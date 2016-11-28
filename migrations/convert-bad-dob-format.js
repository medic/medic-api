var db = require('../db'),
    moment = require('moment');

module.exports = {
  name: 'convert-bad-dob-format',
  created: new Date(2016, 4, 20),
  run: function(callback) {
    db.request({
      db: 'medic',
      method: 'POST',
      path: '_find',
      body: {
        selector: {
          type: 'person',
          date_of_birth: {
            $regex: ' '
          }
        }
      }
    }, function(err, result) {
      var docs = result.docs;

      docs.forEach(function(doc) {
        doc.date_of_birth = moment(doc.date_of_birth, 'MMM Do, YYYY').format('YYYY-MM-DD');
      });

      db.medic.bulk({
        docs: docs
      }, callback);
    });
  }
};
