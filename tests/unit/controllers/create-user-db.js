var controller = require('../../../controllers/create-user-db'),
    db = require('../../../db'),
    auth = require('../../../auth'),
    sinon = require('sinon').sandbox.create();

exports.tearDown = callback => {
  sinon.restore();
  callback();
};

exports['returns error when not logged in'] = test => {
  const req = {};
  const getUserCtx = sinon.stub(auth, 'getUserCtx').callsArgWith(1, 'bang');
  controller(req, err => {
    test.equals(err, 'bang');
    test.equals(getUserCtx.callCount, 1);
    test.done();
  });
};

exports['returns error when putting an invalid db name'] = test => {
  const req = { url: '/medic-user-supersecret-meta/' };
  sinon.stub(auth, 'getUserCtx').callsArgWith(1, null, { name: 'gareth' });
  controller(req, err => {
    test.equals(err.code, 403);
    test.done();
  });
};

exports['creates the database and sets permissions'] = test => {
  const req = { url: '/medic-user-gareth-meta/' };
  sinon.stub(auth, 'getUserCtx').callsArgWith(1, null, { name: 'gareth' });
  const create = sinon.stub(db.db, 'create').callsArgWith(1);
  const request = sinon.stub(db, 'request').callsArgWith(1);
  controller(req, err => {
    test.equals(err, null);
    test.equals(create.callCount, 1);
    test.equals(create.args[0][0], 'medic-user-gareth-meta');
    test.equals(request.callCount, 1);
    const requestParams = request.args[0][0];
    test.equals(requestParams.db, 'medic-user-gareth-meta');
    test.equals(requestParams.path, '/_security');
    test.equals(requestParams.method, 'put');
    test.equals(requestParams.body.admins.names[0], 'gareth');
    test.done();
  });
};
