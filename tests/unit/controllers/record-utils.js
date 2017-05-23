var controller = require('../../../controllers/record-utils'),
    defs = require('../fixtures/form_definitions'),
    config = require('../../../config'),
    db = require('../../../db'),
    sinon = require('sinon').sandbox.create();

exports.tearDown = function (callback) {
  sinon.restore();
  callback();
};

exports['create form returns formated error from string'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, 'icky');
  controller.createByForm({
    message: 'test',
    from: '+123'
  }, function(err) {
    test.equals(err, 'icky');
    test.equals(req.callCount, 1);
    test.done();
  });
};

exports['create form returns error if missing required from field'] = function(test) {
  var req = sinon.stub(db.medic, 'insert');
  controller.createByForm({
    message: 'test'
  }, function(err) {
    test.equals(err.message, 'Missing required field: from');
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['create form returns error if empty message field'] = function(test) {
  var req = sinon.stub(db.medic, 'insert');
  controller.createByForm({
    from: '+123',
    message: ''
  }, function(err) {
    test.equals(err.message, 'Missing required field: message');
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['createRecordByJSON returns formated error from string'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, 'icky');
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var body = {
    _meta: {
      from: '+123',
      form: 'A'
    }
  };
  controller.createRecordByJSON(body, function(err) {
    test.equals(err, 'icky');
    test.equals(req.callCount, 1);
    test.done();
  });
};

exports['createRecordByJSON returns error if missing _meta property'] = function(test) {
  var req = sinon.stub(db.medic, 'insert');
  var body = { name: 'bob' };
  controller.createRecordByJSON(body, function(err) {
    test.equal(err.message, 'Missing _meta property.');
    // request should never be called if validation fails
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['createRecordByJSON does not call request if validation fails'] = function(test) {
  var req = sinon.stub(db.medic, 'insert');
  var body = {};
  controller.createRecordByJSON(body, function() {
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['createRecordByJSON returns error if form not found'] = function(test) {
  var req = sinon.stub(db.medic, 'insert');
  var data = {
    _meta: {
       form: 'foo'
    }
  };
  controller.createRecordByJSON(data, function(err, result) {
    test.equals(req.callCount, 0);
    test.equals(result, undefined);
    test.equals(err.message, 'Missing required field: from');
    test.done();
  });
};

exports['create form does not call request if validation fails'] = function(test) {
  var req = sinon.stub(db.medic, 'insert');
  var body = {};
  controller.createByForm(body, function() {
    test.equals(req.callCount, 0);
    test.done();
  });
};

exports['create form returns success'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  controller.createByForm({
    message: 'test',
    from: '+123',
    unwanted: ';-- DROP TABLE users'
  }, function(err, results) {
    test.equals(err, null);
    test.equals(results.success, true);
    test.equals(results.id, 5);
    test.equals(req.callCount, 1);
    var doc = req.firstCall.args[0];
    test.equals(doc.sms_message.message, 'test');
    test.equals(doc.from, '+123');
    test.equals(doc.unwanted, undefined);
    test.done();
  });
};

exports['createRecordByJSON returns success'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    _meta: {
      form: 'test',
      from: '+123',
      unwanted: ';-- DROP TABLE users'
    }
  };
  controller.createRecordByJSON(data, function(err, results) {
    var doc = req.firstCall.args[0];
    test.equals(err, null);
    test.equals(results.success, true);
    test.equals(results.id, 5);
    test.equals(req.callCount, 1);
    test.equals(doc.form, 'TEST');
    test.equals(doc.from, '+123');
    test.equals(doc.fields.unwanted, undefined);
    test.equals(doc.unwanted, undefined);
    test.done();
  });
};

exports['createRecordByJSON supports _meta.form property'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var getForm = sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    facility_id: 'zanzibar',
    year: 2011,
    month: 8,
    _meta: {
      form: 'yyyy',
      from: '+123'
    }
  };
  controller.createRecordByJSON(data, function(err, results) {
    var doc = req.firstCall.args[0];
    test.equals(err, null);
    test.ok(getForm.alwaysCalledWith('YYYY'));
    test.equals(results.success, true);
    test.equals(doc.from, '+123');
    test.equals(doc.form, 'YYYY');
    test.equals(doc.fields.facility_id, 'zanzibar');
    test.equals(doc.fields.month, 8);
    test.equals(doc.fields.year, 2011);
    test.done();
  });
};

exports['createRecordByJSON _meta.form is case insensitive'] = function(test) {
  sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var getForm = sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    _meta: {
      form: 'yyYy',
      from: '+123'
    }
  };
  controller.createRecordByJSON(data, function() {
    test.ok(getForm.alwaysCalledWith('YYYY'));
    test.done();
  });
};

exports['createRecordByJSON convert property names to lowercase'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    FaciLity_Id: 'zanzibar',
    Year: 2011,
    mOnth: 8,
    _meta: {
      form: 'yyyy',
      from: '+123'
    }
  };
  controller.createRecordByJSON(data, function(err, results) {
    var doc = req.firstCall.args[0];
    test.equals(err, null);
    test.equals(results.success, true);
    test.ok(doc.fields.facility_id === 'zanzibar');
    test.ok(doc.fields.year === 2011);
    test.ok(doc.fields.month === 8);
    test.done();
  });
};

exports['createRecordByJSON supports _meta.reported_date property'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    _meta: {
      reported_date : '2015-01-13T19:36:59.013Z',
      form: 'yyyy',
      from: '+123'
    }
  };
  controller.createRecordByJSON(data, function(err, results) {
    var doc = req.firstCall.args[0];
    test.equals(err, null);
    test.same(results.success, true);
    test.same(doc.reported_date, 1421177819013);
    test.done();
  });
};

exports['assert month is parsed as integer'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var getForm = sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  controller.createByForm({
    from: '+888',
    message: '1!YYYY!facility#2011#11'
  }, function() {
    var doc = req.firstCall.args[0];
    test.ok(getForm.alwaysCalledWith('YYYY'));
    test.same(11, doc.fields.month);
    test.done();
  });
};

exports['assert unix timestamp parsed'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  controller.createByForm({
    from: '+888',
    message: 'foo',
    reported_date: '1352499725000'
  }, function() {
    var doc = req.firstCall.args[0];
    test.equal(
      'Fri, 09 Nov 2012 22:22:05 GMT',
      new Date(doc.reported_date).toUTCString()
    );
    test.done();
  });
};

exports['deep keys parsed'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    from: '+13125551212',
    message: '1!YYYY!facility#2011#11#0#1#2#3#4#5#6#9#8#7#6#5#4',
    reported_date: '1352399720000'
  };
  var days_stocked_out = {
    cotrimoxazole: 7,
    eye_ointment: 4,
    la_6x1: 9,
    la_6x2: 8,
    ors: 5,
    zinc: 6
  };
  var quantity_dispensed = {
    cotrimoxazole: 3,
    eye_ointment: 6,
    la_6x1: 1,
    la_6x2: 2,
    ors: 5,
    zinc: 4
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.fields.days_stocked_out, days_stocked_out);
    test.same(doc.fields.quantity_dispensed, quantity_dispensed);
    test.done();
  });
};

exports['POST data is saved on sms_message attr'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    from: '+13125551212',
    message: '1!YYYY!facility#2011#11#0#1#2#3#4#5#6#9#8#7#6#5#4',
    reported_date: '1352399720000'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.sms_message.from, data.from);
    test.same(doc.sms_message.message, data.message);
    test.same(doc.sms_message.reported_date, data.reported_date);
    test.done();
  });
};

exports['parsed form success maintains facility not found'] = function (test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYZ);
  var data = {
    from:'+888',
    message:'1!YYYZ!foo#bar'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.errors[0].code, 'sys.facility_not_found');
    test.same(doc.errors.length, 1);
    test.done();
  });
};

exports['autoreply on YYYY form is ignored'] = function (test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    from:'+888',
    message:'1!YYYY!facility#2012#4#1#222#333#444#555#666#777#888#999#111#222#333#444'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.form, 'YYYY');
    test.same(doc.errors[0].code, 'sys.facility_not_found');
    test.same(doc.errors.length, 1);
    test.done();
  });
};

exports['form not found error not set by default'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var data = {
    from:'+888',
    message:'foo bar baz'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.errors[0].code, 'sys.facility_not_found');
    test.same(doc.errors.length, 1);
    test.done();
  });
};

exports['form not found error set in forms only mode'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  sinon.stub(config, 'get').withArgs('forms_only_mode').returns(true);
  var data = {
    from:'+888',
    message:'foo bar baz'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.errors[0].code, 'sys.facility_not_found');
    test.same(doc.errors[1].code, 'sys.form_not_found');
    test.same(doc.errors.length, 2);
    test.done();
  });
};

exports['form not found message locale fallback to app_settings'] = function (test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var configGet = sinon.stub(config, 'get').withArgs('forms_only_mode').returns(true);
  configGet.withArgs('locale').returns('ne');
  sinon.stub(config, 'translate', function(key, locale) {
    return key + '|' + locale;
  });
  var data = {
    from: '+888',
    message: '1!0000!2012#2#20#foo#bar'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.errors[0].code, 'sys.facility_not_found');
    test.same(doc.errors[0].message, 'sys.facility_not_found|ne');
    test.same(doc.errors[1].code, 'sys.form_not_found');
    test.same(doc.errors[1].message, 'sys.form_not_found|ne');
    test.same(doc.errors.length, 2);
    test.done();
  });
};

exports['form not found message when locale undefined'] = function (test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var configGet = sinon.stub(config, 'get').withArgs('forms_only_mode').returns(true);
  configGet.withArgs('locale').returns();
  sinon.stub(config, 'translate', function(key, locale) {
    return key + '|' + locale;
  });
  var data = {
    from: '+888',
    message: '1!0000!2012#2#20#foo#bar'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.errors[0].code, 'sys.facility_not_found');
    test.same(doc.errors[0].message, 'sys.facility_not_found|en');
    test.same(doc.errors[1].code, 'sys.form_not_found');
    test.same(doc.errors[1].message, 'sys.form_not_found|en');
    test.same(doc.errors.length, 2);
    test.done();
  });
};

exports['assign sys.empty error to empty report'] = function (test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var data = {
    from:'+888',
    message: ' '
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.errors[0].code, 'sys.facility_not_found');
    test.same(doc.errors[0].message, 'sys.facility_not_found');
    test.same(doc.errors[1].code, 'sys.empty');
    test.same(doc.errors[1].message, 'sys.empty');
    test.done();
  });
};

exports['one word report gets undefined form property'] = function (test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var data = {
    from:'+888',
    message: 'foo'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.same(doc.form, undefined);
    test.done();
  });
};

exports['errors on extra fields'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var getForm = sinon.stub(config, 'getForm').returns(defs.forms.YYYZ);
  var data = {
    from:'+888',
    message: '1!YYYY!facility#2011#11#0#1#2#3#4#5#6#9#8#7#6#5#4#123',
    sent_timestamp:'1352399720000'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.ok(getForm.alwaysCalledWith('YYYY'));
    test.same(doc.errors.length, 2);
    test.same(doc.errors[0], {
      code: 'extra_fields',
      message:'extra_fields'
    });
    test.done();
  });
};

exports['errors on missing fields'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var getForm = sinon.stub(config, 'getForm').returns(defs.forms.YYYY);
  var data = {
    from:'+888',
    message: '1!YYYY!foo'
  };
  controller.createByForm(data, function() {
    var doc = req.firstCall.args[0];
    test.ok(getForm.alwaysCalledWith('YYYY'));
    test.same(doc.errors[0], {
      code: 'sys.missing_fields',
      fields: ['year','month'],
      message: 'sys.missing_fields'
    });
    test.done();
  });
};

exports['support unstructured message'] = function(test) {
  var req = sinon.stub(db.medic, 'insert').callsArgWith(1, null, { ok: true, id: 5 });
  var data = {
    from:'+888',
    message: 'hello world! anyone there?'
  };
  controller.createByForm(data, function(err, results) {
    var doc = req.firstCall.args[0];
    // unstructured message has undefined form
    test.same(err, null);
    test.same(doc.form, undefined);
    test.same(doc.sms_message.message, 'hello world! anyone there?');
    test.same(results.success, true);
    test.same(doc.errors[0], {
      code: 'sys.facility_not_found',
      message: 'sys.facility_not_found'
    });
    test.done();
  });
};

