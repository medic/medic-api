var _ = require('underscore'),
    db = require('../db'),
    async = require('async');

var BATCH_SIZE = 100;

var filterThoseWithExistingContacts = function(batch, callback) {
  db.medic.view('medic', 'patient_by_patient_shortcode_id', {
      keys: batch.map(function(row) {
        return row.key;
      })
    }, function(err, results) {
      if (err) {
        return callback(err);
      }

      var existingContactShortcodes = _.pluck(results.rows, 'key');

      callback(batch.filter(function(row) {
        return !_.contains(existingContactShortcodes, row.key);
      }));
    });
};

var batchCreatePatientContacts = function(batch, callback) {
  process.stdout.write('Of ' + batch.length + ' registered patients… ');

  filterThoseWithExistingContacts(batch, function(filteredBatch) {
    process.stdout.write(filteredBatch.length + ' need a contact. ');
    if (filteredBatch.length === 0) {
      return callback();
    }

    process.stdout.write('Getting… ');

    db.medic.fetch({
      keys: _.pluck(batch, 'id'),
      include_docs: true
    }, function(err, results) {
      if (err) {
        return callback(err);
      }

      process.stdout.write('registrations… ');

      var registrations = _.pluck(results.rows, 'doc');

      var phoneNumbersToQuery = _.chain(registrations)
        .pluck('from')
        .uniq()
        .map(function(ph) {
          return [ph];
        })
        .value();

      db.medic.view('medic-client', 'people_by_phone', {
        keys: phoneNumbersToQuery,
        include_docs: true
      }, function(err, results) {
        if (err) {
          return callback(err);
        }

        process.stdout.write('parents… ');

        var phoneToContact = _.chain(results.rows)
          .pluck('doc')
          .uniq()
          .reduce(function(ptp, doc) {
            ptp[doc.phone] = doc;
            return ptp;
          }, {})
          .value();

        var patientPersons = registrations.map(function(registration) {
          var contact = phoneToContact[registration.from];
          // create a new patient with this patient_id
          var patient = {
              name: registration.fields.patient_name, // FIXME: pick this based on config?
                                                      //        (see transitions/registration.js)
              parent: contact && contact.parent,
              reported_date: registration.reported_date,
              type: 'person',
              patient_id: registration.patient_id
          };
          // include the DOB if it was generated on report
          if (registration.birth_date) {
            patient.date_of_birth = registration.birth_date;
          }
          return patient;
        });

        process.stdout.write('storing… ');

        db.medic.bulk({docs: patientPersons}, function(err, results) {
          if (err) {
            return callback(err);
          }

          var errors = results.filter(function(result) {
            return !result.ok;
          });

          if (errors.length) {
            return callback(new Error('Bulk create errors: ' + JSON.stringify(errors)));
          }

          console.log('DONE');
          callback();
        });
      });
    });
  });
};

module.exports = {
  name: 'separate-audit-db',
  created: new Date(2017, 2, 13),
  run: function(callback) {
    db.medic.view('medic', 'registered_patients', {}, function(err, results) {
      if (err) {
        return callback(err);
      }

      if (results.rows.length === 0) {
        console.log('No registered patients to create contacts from');
        return callback();
      }


      var patientIdToShortCode = _.uniq(results.rows, true, function(row) {
        return row.key;
      });

      console.log(results.rows.length + ' registered patients');

      async.doWhilst(
        function(callback) {
          var batch = patientIdToShortCode.splice(0, BATCH_SIZE);

          batchCreatePatientContacts(batch, callback);
        },
        function() {
          return patientIdToShortCode.length;
        },
        callback);
    });
  }
};
