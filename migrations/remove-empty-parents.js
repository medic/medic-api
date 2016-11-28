var db = require('../db');

module.exports = {
  name: 'remove-empty-parents',
  created: new Date(2016, 7, 10, 13, 37, 0, 0),
  run: function(callback) {
    db.request({
      db: 'medic',
      method: 'POST',
      path: '_find',
      body: {
        selector: {
          type: {
            $in: ['district_hospital', 'health_center', 'clinic', 'person']
          },
          $or: [
          {
            parent: {
              $eq: null
            }
          },
          {
            parent: {
              $exists: true,
              _id: {
                $exists: false
              }
            }
          }]
        }
      }
    }, function(err, result) {
      if (err) {
        return callback(err);
      }

      var docs = result.docs;

      docs.forEach(function(doc) {
        delete doc.parent;
      });

      db.medic.bulk({
        docs: docs
      }, callback);
    });
  }
};
