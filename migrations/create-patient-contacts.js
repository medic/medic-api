var _ = require('underscore'),
    db = require('../db'),
    async = require('async');

var BATCH_SIZE = 100;

var filterThoseWithExistingContacts = function(batch, callback) {
  db.medic.view('medic', 'patient_by_patient_shortcode_id', {
      keys: batch.map(function(row) {
        return row[0];
      })
    }, function(err, results) {
      if (err) {
        return callback(err);
      }

      var existingContactShortcodes = _.pluck(results.rows, 'key');

      callback(batch.filter(function(row) {
        return !_.contains(existingContactShortcodes, row[0]);
      }));
    });
};

var batchCreatePatientContacts = function(batch, callback) {
  process.stdout.write('Of ' + batch.length + ' potential patients');

  filterThoseWithExistingContacts(batch, function(filteredBatch) {
    process.stdout.write(filteredBatch.length + ' do not have a contact.');
    if (filteredBatch.length === 0) {
      process.stdout.write('\n');
      return callback();
    }

    process.stdout.write('Getting registrations.. ');

    var registrationIdsToConsider = _.flatten(_.pluck(filteredBatch, 1));

    db.medic.fetch({
      keys: registrationIdsToConsider,
      include_docs: true
    }, function(err, results) {
      if (err) {
        return callback(err);
      }

      console.log(registrationIdsToConsider);

      var uniqueValidRegistrations = _.chain(results.rows)
        .pluck('doc')
        .filter(function(registration) {
          // Registrations require a patient_id to indicate they are the type to
          // have a patient contact created for them
          return registration.patient_id;
        })
        .uniq(false, function(registration) {
          // And we only need one for each patient.
          return registration.patient_id;
        })
        .value();

      if (!uniqueValidRegistrations.length) {
        console.log('no new patient registrations in this batch');
        return callback();
      } else {
        process.stdout.write(uniqueValidRegistrations.length + ' new patient registrations.. ');
      }

      process.stdout.write('Getting parents.. ');

      var contactPhoneNumbers = _.chain(uniqueValidRegistrations)
        .pluck('from')
        .uniq()
        .map(function(ph) {
          return [ph];
        })
        .value();

      db.medic.view('medic-client', 'people_by_phone', {
        keys: contactPhoneNumbers,
        include_docs: true
      }, function(err, results) {
        if (err) {
          return callback(err);
        }

        var contactForPhoneNumber = _.chain(results.rows)
          .pluck('doc')
          .uniq()
          .reduce(function(memo, doc) {
            memo[doc.phone] = doc;
            return memo;
          }, {})
          .value();

        var patientPersons = uniqueValidRegistrations.map(function(registration) {
          var contact = contactForPhoneNumber[registration.from];
          // create a new patient with this patient_id
          var patient = {
            // TODO: Marc is going to work out if we need to look in other places as well
            name: registration.fields.patient_name,
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

        console.log(patientPersons);

        process.stdout.write('Storing ' + patientPersons.length + ' new patient contacts.. ');

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
  name: 'create-patient-contacts',
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

      var registrationsForPatientShortcode = _.pairs(
        _.reduce(results.rows, function(memo, row) {
          if (!memo[row.key]) {
            memo[row.key] = [];
          }

          memo[row.key].push(row.id);
          return memo;
        }, {})
      );

      console.log('There are ' +
                  registrationsForPatientShortcode.length +
                  ' patients with registrations');

      async.doWhilst(
        function(callback) {
          var batch = registrationsForPatientShortcode.splice(0, BATCH_SIZE);

          batchCreatePatientContacts(batch, callback);
        },
        function() {
          return registrationsForPatientShortcode.length;
        },
        callback);
    });
  }
};
