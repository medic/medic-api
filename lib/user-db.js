const db = require('../db');

const readMapFunction = function(doc) {
  var parts = doc._id.split(':');
  if (parts[0] === 'read') {
    emit(parts[1]);
  }
};

const ddoc = {
  _id: '_design/medic-user',
  views: {
    read: {
      map: readMapFunction.toString(),
      reduce: '_count'
    }
  }
};

const createDb = (dbName, callback) => {
  db.db.create(dbName, callback);
};

const setSecurity = (dbName, username, callback) => {
  db.request({
    db: dbName,
    path: '/_security',
    method: 'PUT',
    body: {
      admins: { names: [ username ], roles: [] },
      members: { names: [], roles:[] }
    }
  }, callback);
};

const putDdoc = (dbName, callback) => {
  db.use(dbName).insert(ddoc, callback);
};

module.exports = {
  getDbName: username => `medic-user-${username}-meta`,
  create: (username, callback) => {
    const dbName = module.exports.getDbName(username);
    createDb(dbName, err => {
      if (err) {
        return callback(err);
      }
      setSecurity(dbName, username, err => {
        if (err) {
          return callback(err);
        }
        putDdoc(dbName, callback);
      });
    });
  }
};
