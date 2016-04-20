var db = require('../db'),
    moment = require('moment');

/* jshint ignore:start */
// (it's more readable to use double quotes)
var temporaryView = {
  'map': "function(doc) { if (doc.type === 'person' && doc.date_of_birth && doc.date_of_birth.indexOf(' ') >= 0) { emit(1); }}"
};
/* jshint ignore:end */

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

      docs.forEach(function(doc) {
        doc.date_of_birth = moment(doc.date_of_birth, 'MMM Do, YYYY').format('YYYY-MM-DD');
      });

      db.medic.bulk({
        docs: docs
      }, callback);
    });
  }
};
