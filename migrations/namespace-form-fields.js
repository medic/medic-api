/**
 * For `data_records`, moves form fields from `doc.my_field` to `doc.fields.my_field`.
 */

var async = require('async'),
    _ = require('underscore'),
    db = require('../db'),
    config = require('../config'),
    forms;

var BATCH_SIZE = 100;

var namespace = function(docs, callback) {
  console.log('-------------- new batch');
  console.log(docs);
  docs.forEach(function(doc) {
    if (doc.fields || !doc.form) {
      return;
    }
    var form = forms[doc.form];
    if (!form) {
      return;
    }
    doc.fields = {};
    _.keys(form.fields).forEach(function(key) {
      doc.fields[key] = doc[key];
      delete doc[key];
    });
  });
  console.log('------ namespaced');
  console.log(docs);

  db.medic.bulk({ docs : docs }, function(err, result) {
    console.log('done bulk query');
    if (err) {
      console.log('Error in bulk edit', err);
    }
    console.log('result', result);
    callback(err);
  });
};

var runBatch = function(batchSize, skip, callback) {
  var options = {
    include_docs: true,
    limit: batchSize,
    skip: skip
  };
  db.medic.view('medic', 'data_records', options, function(err, result) {
    if (err) {
      console.log('Error getting data_records', err);
      return callback(err);
    }
    console.log('        Processing ' + skip + ' to ' + (skip + batchSize) + ' docs of ' + result.total_rows + ' total');
    var docs = _.uniq(_.pluck(result.rows, 'doc'));

    namespace(docs, function(err) {
      var keepGoing = result.total_rows > (skip + batchSize);
      callback(err, keepGoing);
    });
  });
};

module.exports = {
  name: 'namespace-form-fields',
  created: new Date(2015, 5, 19, 10, 30, 0, 0),
  // Exposed for testing.
  _runWithBatchSize: function(batchSize, callback) {
    config.load(function() {
      forms = config.get('forms');

      var currentSkip = 0;
      async.doWhilst(
        function(callback) {
          runBatch(batchSize, currentSkip, callback);
        },
        function(keepGoing) {
          console.log('done batch with skip', currentSkip);
          currentSkip += batchSize;
          return keepGoing;
        },
        callback
      );
    });
  },
  run: function(callback) {
    module.exports._runWithBatchSize(BATCH_SIZE, callback);
  }
};