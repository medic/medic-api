const db = require('../db'),
      auth = require('../auth');

const getDbName = username => `medic-user-${username}-meta`;

const createDatabase = (username, callback) => {
  const dbName = getDbName(username);
  db.db.create(dbName, err => {
    if (err) {
      return callback(err);
    }
    const params = {
      db: dbName,
      path: '/_security',
      method: 'PUT',
      body: {
        admins: { names: [ username ], roles: [] },
        members: { names: [], roles:[] }
      }
    };
    db.request(params, callback);
  });
};

const checkPermissions = (req, callback) => {
  auth.getUserCtx(req, (err, userCtx) => {
    if (err) {
      return callback(err);
    }
    const username = userCtx.name;
    if (req.url !== '/' + getDbName(username) + '/') {
      // trying to create a db with a disallowed name
      return callback({ code: 403, message: 'Insufficient privileges' });
    }
    return callback(null, username);
  });
};

module.exports = (req, callback) => {
  checkPermissions(req, (err, username) => {
    if (err) {
      return callback(err);
    }
    createDatabase(username, callback);
  });
};
