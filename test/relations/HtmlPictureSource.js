/*global describe, it*/
var expect = require('../unexpected-with-plugins'),
    _ = require('lodash'),
    AssetGraph = require('../../lib/AssetGraph');

describe('relations/HtmlPictureSource test', function () {
    it('should handle a test case with an existing <picture><source src="..."></picture> construct', function (done) {
        new AssetGraph({root: __dirname + '/../../testdata/relations/HtmlPictureSource/'})
            .loadAssets('index.html')
            .populate({
                followRelations: function () {return false;}
            })
            .queue(function (assetGraph) {
                expect(assetGraph, 'to contain relations including unresolved', 'HtmlPictureSource', 2);
                assetGraph.findAssets({type: 'Html'})[0].url = 'http://example.com/foo/bar.html';
                assetGraph.findRelations({}, true).forEach(function (relation) {
                    relation.hrefType = 'relative';
                });
                expect(_.map(assetGraph.findRelations({}, true), 'href'), 'to equal', [
                    '../image.png',
                    '../otherImage.jpg'
                ]);
            })
            .run(done);
    });
});
