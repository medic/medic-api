var controller = require('../controllers/upcoming-due-dates'),
    db = require('../db'),
    moment = require('moment'),
    sinon = require('sinon');

var clock;

exports.setUp = function(callback) {
  clock = sinon.useFakeTimers();
  callback();
};

exports.tearDown = function(callback) {
  clock.restore();
  if (db.fti.restore) {
    db.fti.restore();
  }
  callback();
};

exports['get returns errors'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti').callsArgWith(2, 'bang');
  controller.get({}, function(err, results) {
    test.equals(err, 'bang');
    test.equals(fti.callCount, 1);
    test.done();
  });
};

exports['get returns empty if no registrations'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti').callsArgWith(2, null, {
    rows: []
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 0);
    test.equals(fti.callCount, 1);
    test.done();
  });
};

exports['get returns zero if all registrations have delivered'] = function(test) {
  test.expect(2);
  var fti = sinon.stub(db, 'fti');
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { 
        doc: { 
          patient_id: 1,
          scheduled_tasks: [ {
            group: 1,
            due: moment().toISOString()
          } ]
        } 
      },
      { 
        doc: { 
          patient_id: 2,
          scheduled_tasks: [ {
            group: 1,
            due: moment().toISOString()
          } ]
        } 
      }
    ]
  });
  fti.onSecondCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 1 } },
      { doc: { patient_id: 2 } }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 0);
    test.equals(fti.callCount, 2);
    test.done();
  });
};

exports['get returns all women with upcoming due dates'] = function(test) {
  test.expect(16);
  var fti = sinon.stub(db, 'fti');
  var today = moment();
  fti.onFirstCall().callsArgWith(2, null, {
    rows: [
      { 
        doc: { 
          patient_id: 1,
          patient_name: 'sarah',
          form: 'R',
          reported_date: today.clone().subtract(38, 'weeks').toISOString(),
          related_entities: { clinic: { id: 'x' } }
        } 
      },
      { 
        doc: { 
          patient_id: 2,
          patient_name: 'sally',
          form: 'P',
          lmp_date: today.clone().subtract(42, 'weeks').toISOString(),
          related_entities: { clinic: { id: 'y' } }
        } 
      }
    ]
  });
  fti.onSecondCall().callsArgWith(2, null, {
    rows: [
      { doc: { patient_id: 4 } }
    ]
  });
  fti.onThirdCall().callsArgWith(2, null, {
    rows: [
      { doc: { 
        patient_id: 1,
        reported_date: today.clone().subtract(2, 'weeks').toISOString()
      } },
      { doc: { 
        patient_id: 1,
        reported_date: today.clone().subtract(6, 'weeks').toISOString()
      } }
    ]
  });
  controller.get({}, function(err, results) {
    test.equals(results.length, 2);

    test.equals(results[0].patient_id, 1);
    test.equals(results[0].patient_name, 'sarah');
    test.equals(results[0].weeks.number, 38);
    test.equals(results[0].weeks.approximate, true);
    test.equals(results[0].lastAppointmentDate.toISOString(), today.clone().subtract(2, 'weeks').toISOString());
    test.equals(results[0].edd.date.toISOString(), today.clone().add(2, 'weeks').toISOString());
    test.equals(results[0].edd.approximate, true);

    test.equals(results[1].patient_id, 2);
    test.equals(results[1].patient_name, 'sally');
    test.equals(results[1].weeks.number, 40);
    test.equals(results[1].weeks.approximate, undefined);
    test.equals(results[1].lastAppointmentDate, undefined);
    test.equals(results[1].edd.date.toISOString(), today.toISOString());
    test.equals(results[1].edd.approximate, undefined);

    test.equals(fti.callCount, 3);
    test.done();
  });
};