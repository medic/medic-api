var lib = require('../../../lib/user-db'),
    db = require('../../../db'),
    sinon = require('sinon').sandbox.create();

exports.tearDown = callback => {
  sinon.restore();
  callback();
};

exports['creates the db'] = test => {
  const create = sinon.stub(db.db, 'create').callsArgWith(1);
  const request = sinon.stub(db, 'request').callsArgWith(1);
  const insert = sinon.stub().callsArgWith(1);
  const use = sinon.stub(db, 'use').returns({ insert: insert });
  lib.create('gareth', err => {
    test.equals(err, null);
    test.equals(create.args[0][0], 'medic-user-gareth-meta');
    test.equals(request.callCount, 1);
    const requestParams = request.args[0][0];
    test.equals(requestParams.db, 'medic-user-gareth-meta');
    test.equals(requestParams.path, '/_security');
    test.equals(requestParams.method, 'PUT');
    test.equals(requestParams.body.admins.names[0], 'gareth');
    test.equals(use.callCount, 1);
    test.equals(use.args[0][0], 'medic-user-gareth-meta');
    test.equals(insert.callCount, 1);
    const ddoc = insert.args[0][0];
    test.equals(ddoc._id, '_design/medic-user');
    test.equals(ddoc.views.read.map, 'function (doc) {\n  var parts = doc._id.split(\':\');\n  if (parts[0] === \'read\') {\n    emit(parts[1]);\n  }\n}');
    test.equals(ddoc.views.read.reduce, '_count');
    test.done();
  });
};
