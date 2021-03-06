module.exports = queryObj => {
    return function inlineHtmlTemplates(assetGraph) {
        const relationsToDetachById = {};
        const potentiallyOrphanedAssetsById = {};

        for (const htmlAsset of assetGraph.findAssets(Object.assign({type: 'Html', isInline: false, isFragment: false}, queryObj))) {
            const assetsBySeenIdAttribute = {};
            const relationsToInline = [];
            assetGraph.eachAssetPostOrder(htmlAsset, {type: assetGraph.query.not(['HtmlAnchor', 'HtmlMetaRefresh'])}, asset => {
                if (asset.type === 'JavaScript') {
                    relationsToInline.push(...assetGraph.findRelations({
                        from: asset,
                        type: assetGraph.query.not(['JavaScriptGetText', 'JavaScriptTrHtml']),
                        to: {
                            type: 'Html',
                            extension: '.ko',
                            isInline: false,
                            isLoaded: true
                        }
                    }));
                } else if (asset.type === 'Html' && asset.nonInlineAncestor.extension === '.ko' && asset.isFragment) {
                    relationsToInline.push(...assetGraph.findRelations({
                        from: asset,
                        type: 'HtmlInlineScriptTemplate',
                        to: {
                            isLoaded: true
                        }
                    }));
                    if (asset.isLoaded) {
                        for (const element of Array.from(asset.parseTree.getElementsByTagName('*'))) {
                            if (element.hasAttribute('id') && !relationsToInline.some(relationToInline => relationToInline.node === element)) {
                                const id = element.getAttribute('id');
                                if (id) {
                                    (assetsBySeenIdAttribute[id] = assetsBySeenIdAttribute[id] || []).push(asset);
                                }
                            }
                        }
                    }
                }
            });
            const alreadyInlinedById = {};
            for (const htmlInlineScriptTemplate of assetGraph.findRelations({from: htmlAsset, type: 'HtmlInlineScriptTemplate'})) {
                const id = htmlInlineScriptTemplate.node.getAttribute('id');
                if (id) {
                    alreadyInlinedById[id] = true;
                }
            }
            const document = htmlAsset.parseTree;
            for (const relationToInline of relationsToInline) {
                relationsToDetachById[relationToInline.id] = relationToInline;
                let id;
                if (relationToInline.type === 'HtmlInlineScriptTemplate') {
                    id = relationToInline.node.getAttribute('id');
                } else {
                    id = relationToInline.to.url.split('/').pop().replace(/\..*$/, ''); // Strip .ko or .<localeId>.ko extension
                }
                const existingAttributes = relationToInline.type === 'HtmlInlineScriptTemplate' && relationToInline.node.attributes;
                if (!id || !alreadyInlinedById[id]) {
                    if (id && assetsBySeenIdAttribute[id]) {
                        assetGraph.emit('warn', new Error(
                            `inlineTemplates: Inlining ${relationToInline.to.urlOrDescription} ` +
                            `into a <script> in ${htmlAsset.urlOrDescription} ` +
                            `with an id attribute of ${id}, which already exists in these assets:` +
                            '\n  ' + assetsBySeenIdAttribute[id].map(asset => asset.urlOrDescription).join('\n  ')
                        ));
                    }
                    potentiallyOrphanedAssetsById[relationToInline.to.id] = relationToInline.to;
                    const node = document.createElement('script');
                    node.setAttribute('type', 'text/html');
                    if (id) {
                        node.setAttribute('id', id);
                    }
                    if (existingAttributes) {
                        for (const attribute of Array.from(existingAttributes)) {
                            if (attribute.name !== 'type' && attribute.name !== 'id') {
                                node.setAttribute(attribute.name, attribute.value);
                            }
                        }
                    }
                    document.head.appendChild(node);
                    const htmlInlineScriptTemplate = new assetGraph.HtmlInlineScriptTemplate({
                        to: relationToInline.to,
                        node
                    });
                    htmlAsset.addRelation(htmlInlineScriptTemplate);
                    htmlInlineScriptTemplate.inline();
                    // These are attached separately
                    for (const template of assetGraph.findRelations({from: htmlInlineScriptTemplate.to, type: 'HtmlInlineScriptTemplate'})) {
                        template.detach();
                    }
                    if (id) {
                        alreadyInlinedById[id] = true;
                    }
                }
            }
        }
        for (const relationId of Object.keys(relationsToDetachById)) {
            relationsToDetachById[relationId].detach();
        }

        // Template assets that had more than one incoming relation to begin with will
        // be cloned in the .inline() call above. Remove the template assets that have
        // become orphans:
        for (const assetId of Object.keys(potentiallyOrphanedAssetsById)) {
            const asset = potentiallyOrphanedAssetsById[assetId];
            if (assetGraph.findRelations({to: asset}).length === 0) {
                assetGraph.removeAsset(asset);
            }
        }
    };
};
