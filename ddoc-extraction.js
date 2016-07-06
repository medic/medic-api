var async = require('async'),
    _ = require('underscore'),
    db = require('./db');

var getCompiledDdocs = function(callback) {
  db.medic.get('_design/medic/ddocs/compiled.json', function(err, ddocs) {
    if (err) {
      if (err.error === 'not_found') {
        return callback(null, []);
      }
      return callback(err);
    }
    callback(null, ddocs.docs);
  });
};

var updateIfRequired = function(ddoc, callback) {
  db.medic.get(ddoc._id, function(err, oldDdoc) {
    if (err && err.error !== 'not_found') {
      return callback(err);
    }
    ddoc._rev = oldDdoc && oldDdoc._rev;
    if (oldDdoc && _.isEqual(ddoc, oldDdoc)) {
      // unmodified
      return callback();
    }
    console.log('Updating ddoc ' + ddoc._id);
    db.medic.insert(ddoc, callback);
  });
};

module.exports = {
  run: function(callback) {
    getCompiledDdocs(function(err, ddocs) {
      if (err) {
        return callback(err);
      }
      async.each(ddocs, updateIfRequired, callback);
    });
  }
};
