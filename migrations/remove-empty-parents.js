var async = require('async'),
    db = require('../db');

function hasProperties(obj) {
  var k;

  if (!obj) {
    return false;
  }

  for(k in obj) {
    if(obj.hasOwnProperty(k)) {
      return true;
    }
  }

  return false;
}

function removeDeadParents(row, callback) {
  console.log('Should process parent: ', row);
  if(hasProperties(row.doc.parent)) {
    return callback();
  }
  db.medic.get(row.id, function(err, doc) {
    if(err) {
      return callback(err);
    }
    delete doc.parent;
    db.medic.insert(doc, function(err) {
      if(err) {
        return callback(err);
      }
      return callback();
    });
  });
}

module.exports = {
  name: 'remove-empty-parents',
  created: new Date(2016, 7, 10, 13, 37, 0, 0),
  run: function(callback) {
    // TODO pull full list of contacts, and remove dead parents
    db.medic.view(
      'medic-client',
      'contacts_by_type',
      { include_docs:true },
      function(err, result) {
        if (err) {
          return callback(err);
        }
        async.each(result.rows, removeDeadParents, callback);
      });
  }
};
