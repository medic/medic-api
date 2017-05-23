var libphonenumber = require('medic-libphonenumber'),
    smsparser = require('medic-smsparser'),
    medicUtils = require('medic-api-utils'),
    _ = require('underscore'),
    config = require('../config'),
    utils = require('./utils'),
    db = require('../db');

var exists = function(val) {
  return val !== '' && typeof val !== 'undefined';
};

var create = function(record, callback) {
  db.medic.insert(record, function(err, results) {
    if (err) {
      return callback(err);
    }
    callback(null, {
      success: results.ok,
      id: results.id,
      rev: results.rev
    });
  });
};

var createByForm = function(data, callback) {
  var required = ['message', 'from'],
      optional = ['reported_date', 'locale', 'gateway_ref'],
      form_data = null,
      def,
      doc;
  for (var k in required) {
    if (required.hasOwnProperty(k)) {
      if (!exists(data[required[k]])) {
        return callback(new Error('Missing required field: ' + required[k]));
      }
    }
  }
  // filter out unwanted fields
  doc = _.pick(data, required.concat(optional));
  doc.type = 'sms_message';
  doc.form = smsparser.getFormCode(data.message);
  def = config.getForm(doc.form);
  if (doc.form && def) {
    form_data = smsparser.parse(def, doc);
  }
  create(getDataRecord(doc, form_data), callback);
};

/*
 * Save parsed form submitted in JSON format when matching form definition can
 * be found.  Support ODK Collect via Simple ODK Server.  Add standard fields
 * to the record, like form, locale and reported_date.
 */
var createRecordByJSON = function(data, callback) {
  var required = ['from', 'form'],
      optional = ['reported_date', 'locale'],
      form_data = {},
      doc = {},
      def;

  // check required fields are in _meta property
  if (!exists(data._meta)) {
    return callback(new Error('Missing _meta property.'));
  }
  for (var k in required) {
    if (required.hasOwnProperty(k)) {
      if (!exists(data._meta[required[k]])) {
        return callback(new Error('Missing required field: ' + required[k]));
      }
    }
  }

  // filter out any unwanted fields
  data._meta = _.pick(data._meta, required.concat(optional));

  // remove fields that start with underscore except _meta
  _.omit(data, function(v, k) {
    return k !== '_meta' && String(k).startsWith('_');
  });

  // Using `_meta` property for non-form data.
  if (data._meta) {
    doc.reported_date = data._meta.reported_date;
    doc.form = smsparser.getFormCode(data._meta.form);
    doc.from = data._meta.from;
    doc.locale = data._meta.locale || doc.locale;
  }

  def = config.getForm(doc.form);

  if (!def) {
    return callback(new Error('Form not found: ' + doc.form));
  }

  // For now only save string and number fields, ignore the others.
  // Lowercase all property names.
  _.each(data, function(v, k) {
    if (['string', 'number'].indexOf(typeof data[k]) >= 0) {
      form_data[k.toLowerCase()] = data[k];
    }
  });

  create(getDataRecord(doc, form_data), callback);
};

/**
 * @param {String} form - form code
 * @param {Object} form_data - parsed form data
 * @returns {String} - Reporting Unit ID value (case insensitive)
 * @api private
 */
var getRefID = function(form, form_data) {
  var def = config.getForm(form),
      val;
  if (!def || !def.facility_reference) {
    return;
  }
  val = form_data && form_data[def.facility_reference];
  if (val && typeof val.toUpperCase === 'function') {
    return val.toUpperCase();
  }
  return val;
};

/**
 * @param {Object} options from initial POST
 * @param {Object} form_data - parsed form data
 * @returns {Object} - data record
 * @api private
 */
var getDataRecord = function(options, form_data) {

  var form = options.form,
      def = config.getForm(form);

  var record = {
   // _id: req.uuid,
    type: 'data_record',
    // todo maybe change libphonenumber to only take default_country_code
    from: libphonenumber.normalize(config.settings, options.from) || options.from,
    form: form,
    errors: [],
    tasks: [],
    fields: {},
    reported_date: new Date().valueOf(),
    // keep POST data part of record
    sms_message: options
  };

  // try to parse timestamp from gateway
  var ts = utils.parseDate(options.reported_date).valueOf();
  if (ts) {
    record.reported_date = ts;
  }

  if (def) {
    if (def.facility_reference) {
      record.refid = getRefID(form, form_data);
    }
    Object.keys(def.fields).forEach(function(k) {
      smsparser.merge(form, k.split('.'), record.fields, form_data);
    });
    var errors = smsparser.validate(def, form_data);
    errors.forEach(function(err) {
      addError(record, err);
    });
  }

  if (form_data && form_data._extra_fields) {
    addError(record, 'extra_fields');
  }

  if (!def || !def.public_form) {
    addError(record, 'sys.facility_not_found');
  }

  if (typeof options.message === 'string' && !options.message.trim()) {
    addError(record, 'sys.empty');
  }

  if (!def) {
    if (config.get('forms_only_mode')) {
      addError(record, 'sys.form_not_found');
    } else {
      // if form is missing we treat as a regular message
      record.form = undefined;
    }
  }

  return record;
};

/*
 * @param {Object} record - data record
 * @param {String|Object} error - error object or code matching key in messages
 *
 * @returns boolean
 */
var hasError = function(record, error) {
  if (!record || !error) {
    return;
  }
  if (_.isString(error)) {
    error = {
      code: error,
      message: ''
    };
  }
  var existing = _.findWhere(record.errors, {
    code: error.code
  });
  return !!existing;
};

/*
 * Append error to data record if it doesn't already exist. we don't need
 * redundant errors. Error objects should always have a code and message
 * attributes.
 *
 * @param {Object} record - data record
 * @param {String|Object} error - error object or code matching key in messages
 *
 * @returns undefined
 */
var addError = function(record, error) {
  if (!record || !error) {
    return;
  }
  if (_.isString(error)) {
    error = {
      code: error,
      message: ''
    };
  }
  if (hasError(record, error)) {
    return;
  }
  var form = record.form && record.sms_message && record.sms_message.form;

  if (!error.message) {
    error.message = config.translate(
      error.code,
      medicUtils.getLocale(record, config.get('locale'))
    );
  }
  // replace placeholder strings
  error.message = error.message
      .replace('{{fields}}', error.fields && error.fields.join(', '))
      .replace('{{form}}', form);
  if (record.errors) {
    record.errors.push(error);
  } else {
    record.errors = [error];
  }
  console.warn(JSON.stringify(error));
};


module.exports = {
  createRecordByJSON: createRecordByJSON,
  createByForm: createByForm
};
