var _ = require('underscore'),
    db = require('../db');

var empty = function(val) {
  return val === '' ||
         val === null ||
         val === undefined;
};

var request = function(opts, callback) {
  opts.path = db.getPath() + '/add';
  opts.method = 'POST';
  db.request(opts, function(err, results) {
    if (err) {
      return callback(err);
    }
    callback(null, {
      success: results.payload.success,
      id: results.payload.id
    });
  });
};

var createByForm = function(data, callback) {
  if (empty(data.from)) {
    return callback(new Error('Missing required field: from'));
  }

  // We're OK with message being empty, but the field should exist
  if (!data.hasOwnProperty('message')) {
    return callback(new Error('Missing required field: message'));
  }

  var fields = ['from', 'message', 'reported_date', 'locale', 'gateway_ref'];

  // filter out any unwanted fields
  var content = _.pick(data, fields);
  request({
    form: content,
    content_type: 'application/x-www-form-urlencoded'
  }, callback);
};

var createRecordByJSON = function(data, callback) {
  var required = ['from', 'form'],
      optional = ['reported_date', 'locale'];
  // check required fields are in _meta property
  if (empty(data._meta)) {
    return callback(new Error('Missing _meta property.'));
  }
  for (var k of required) {
    if (empty(data._meta[k])) {
      return callback(new Error('Missing required field: ' + k));
    }
  }
  // filter out any unwanted fields
  data._meta = _.pick(data._meta, required.concat(optional));
  // no need to pass the content type as nano.request defaults to json.
  request({ body: data }, callback);
};

module.exports = {
  createRecordByJSON: createRecordByJSON,
  createByForm: createByForm
};
