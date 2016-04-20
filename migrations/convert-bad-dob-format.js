var async = require('async'),
    db = require('../db'),
    moment = require('moment');

var temporaryView = {
  "map": "function(doc) { if (doc.type === 'person' && doc.date_of_birth && doc.date_of_birth.indexOf(' ') >= 0) { emit(1); }}"
};

module.exports = {
  name: 'convert-bad-dob-format',
  created: new Date(2016, 4, 20),
  run: function(callback) {
    db.request({
      db: 'medic',
      method: 'POST',
      path: '_temp_view',
      body: temporaryView,
      qs: {
        include_docs: true,
      }
    }, function(err, result) {
      var docs = result.rows.map(function(row) {
        return row.doc;
      });

      for(doc of docs) {
        var currentDob = doc.date_of_birth;
        var convertedDob = moment(doc.date_of_birth, 'MMM Do, YYYY').format('YYYY-MM-DD');

        doc.date_of_birth = convertedDob;
      }

      db.medic.bulk({
        docs: docs
      }, callback);
    });
  }
};
