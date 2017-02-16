var utils = require('./utils');

var migrate = function() {
  return utils.runMigration('create-patient-contacts');
};

describe('create-patient-contacts migration', function() {
  afterEach(function() {
    return utils.tearDown();
  });

  it('should run cleanly with no registered patients', function() {
    return utils.initDb([])
    .then(migrate)
    .then(function() {
      return utils.assertDb([]);
    });
  });

  it('should ignore registrations that already have patient contacts', function() {
    var documents = [
      {
        _id: 'registrationA',
        patient_id: '1234',
        form: 'A',
        transitions: {
          registration: {
            ok: true
          }
        }
      },
      {
        _id: 'RANDOM_UUID',
        patient_id: '1234',
        reported_date: 'now',
        type: 'person'
      }
    ];
    return utils.initDb(documents)
    .then(migrate)
    .then(function() {
      return utils.assertDb(documents);
    });
  });

  it('converts a registration into a patient contact', function() {
    var registration = {
      _id: 'registrationA',
      patient_id: '1234',
      form: 'A',
      from: '555-5555',
      reported_date: 'now',
      fields: {
        patient_name: 'Testerina'
      },
      transitions: {
        registration: {
          ok: true
        }
      }
    };
    var contact = {
      _id: 'chw',
      phone: '555-5555',
      reported_date: 'now',
      type: 'person',
      parent: {
        _id: 'a-parent'
      }
    };
    var patientContact = {
      name: 'Testerina',
      patient_id: '1234',
      reported_date: 'now',
      type: 'person',
      parent: {
        _id: 'a-parent'
      }
    };
    return utils.initDb([registration, contact])
    .then(migrate)
    .then(function() {
      return utils.assertDb([registration, contact, patientContact]);
    });
  });
});
