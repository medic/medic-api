var db = require('../db');

var filterBadClinics = function(doc) {
  if (doc.type === 'clinic' && doc.name === doc.parent.name) {
    emit();
  }
}

module.exports = {
  name: 'rename-chw-areas',
  created: new Date(2016, 7, 19, 13, 37, 0, 0),
  run: function(callback) {
    db.request({
      db: 'medic',
      method: 'POST',
      path: '_temp_view',
      body: { map: filterBadClinics.toString() },
      qs: {
        include_docs: true,
      }
    }, function(err, result) {
      if (err) {
        return callback(err);
      }

      var docs = result.rows.map(function(row) {
        return row.doc;
      });

      docs.forEach(function(doc) {
        doc.name = doc.contact.name + ' Area';
      });

      db.medic.bulk({
        docs: docs
      }, callback);
    });
  }
};
