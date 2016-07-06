var ddocExtraction = require('../ddoc-extraction'),
    sinon = require('sinon'),
    utils = require('./utils'),
    db = require('../db');

exports.tearDown = function (callback) {
  utils.restore(db.medic.get);
  callback();
};

exports['run finds all attached ddocs and, if required, updates them'] = function(test) {
  test.expect(10);

  var get = sinon.stub(db.medic, 'get');

  var attachment = { docs: [
    { _id: '_design/new', views: { doc_by_place: { map: 'function() { return true; }' } } },
    { _id: '_design/updated', views: { doc_by_valid: { map: 'function() { return true; }' } } },
    { _id: '_design/unchanged', views: { doc_by_valid: { map: 'function() { return true; }' } } },
  ] };

  var getAttachment = get.withArgs('_design/medic/ddocs/compiled.json').callsArgWith(1, null, attachment);
  var getNew = get.withArgs('_design/new').callsArgWith(1, { error: 'not_found' });
  var getUpdated = get.withArgs('_design/updated').callsArgWith(1, null, { _id: '_design/updated', _rev: '1', views: { doc_by_valed: { map: 'function() { return true; }' } } });
  var getUnchanged = get.withArgs('_design/unchanged').callsArgWith(1, null, { _id: '_design/unchanged', _rev: '1', views: { doc_by_valid: { map: 'function() { return true; }' } } });
  var insert = sinon.stub(db.medic, 'insert').callsArg(1);

  ddocExtraction.run(function(err) {
    test.ok(!err);
    test.equals(getAttachment.callCount, 1);
    test.equals(getNew.callCount, 1);
    test.equals(getUpdated.callCount, 1);
    test.equals(getUnchanged.callCount, 1);
    test.equals(insert.callCount, 2);
    test.equals(insert.args[0][0]._id, '_design/new');
    test.equals(insert.args[0][0]._rev, undefined);
    test.equals(insert.args[1][0]._id, '_design/updated');
    test.equals(insert.args[1][0]._rev, '1');
    test.done();
  });
};

exports['works when the compiled ddocs is not found'] = function(test) {
  test.expect(2);
  var getAttachment = sinon.stub(db.medic, 'get').withArgs('_design/medic/ddocs/compiled.json').callsArgWith(1, { error: 'not_found' });
  ddocExtraction.run(function(err) {
    test.ok(!err);
    test.ok(getAttachment.callCount, 1);
    test.done();
  });
};
