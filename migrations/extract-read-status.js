const db = require('../db'),
      async = require('async'),
      BATCH_SIZE = 100;

const getDbName = username => `medic-user-${username}-meta`;

const createReadStatusDoc = record => {
  const type = record.form ? 'report' : 'message';
  const id = `read:${type}:${record._id}`;
  return { _id: id };
};

const createDb = (username, dbName, callback) => {
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

const ensureDbExists = (username, dbName, callback) => {
  db.db.get(dbName, err => {
    if (err && err.statusCode === 404) {
      return createDb(username, dbName, callback);
    }
    callback(err);
  });
};

const saveReadStatusDocs = (username, docs, callback) => {
  const userDbName = getDbName(username);
  ensureDbExists(username, userDbName, err => {
    if (err) {
      return callback(err);
    }
    const userDb = db.use(userDbName);
    userDb.bulk({ docs: docs }, callback);
  });
};

const extract = (rows, callback) => {
  const toSave = {};
  rows.forEach(row => {
    const doc = row.doc;
    if (doc.read) {
      doc.read.forEach(user => {
        if (!toSave[user]) {
          toSave[user] = [];
        }
        toSave[user].push(createReadStatusDoc(doc));
      });
    }
  });
  async.each(
    Object.keys(toSave),
    (username, callback) => saveReadStatusDocs(username, toSave[username], callback),
    callback
  );
};

const query = (skip, callback) => {
  const options = {
    key: [ 'data_record' ],
    include_docs: true,
    limit: BATCH_SIZE,
    skip: skip
  };
  db.medic.view('medic-client', 'doc_by_type', options, callback);
};

module.exports = {
  name: 'extract-read-status',
  created: new Date(2017, 6, 7),
  run: callback => {
    db.batch(query, extract, BATCH_SIZE, callback);
  }
};
