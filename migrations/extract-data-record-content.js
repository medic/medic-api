var _ = require('underscore'),
    db = require('../db'),
    async = require('async');

var BATCH_SIZE = 100;
var PERCENT_REPORT_CHUNKS = 10;

// Copied from https://github.com/node-browser-compat/btoa/blob/master/index.js
// because why import a library for one tiny function
function btoa(str) {
  var buffer;

  if (str instanceof Buffer) {
    buffer = str;
  } else {
    buffer = new Buffer(str.toString(), 'binary');
  }

  return buffer.toString('base64');
}

var attachmentIse = function(record) {
  // XML forms which have not been migrated yet
  if (record.content_type === 'xml' && record.content) {
    record._attachments = record._attachments || {};
    record._attachments.content = {
      content_type: 'application/xml',
      data: btoa(record.content)
    };
    delete record.content;

    return record;
  }
};


var incrementPercentTarget = function(percentTarget) {
  return percentTarget + PERCENT_REPORT_CHUNKS;
};

module.exports = {
  name: 'extract-data-record-content',
  created: new Date(2017, 0, 6),
  run: function(callback) {
    console.log('Finding data_records...');
    db.medic.view('medic', 'data_records', function(err, body) {
      if (err) {
        return callback(err);
      }

      var recordStubs = body.rows;
      var originalTotal = recordStubs.length;
      var nextPercentTarget = incrementPercentTarget(0);

      console.log('Migrating up to ' + recordStubs.length + ' rows');
      process.stdout.write('Working');

      async.doUntil(
        function(callback) {
          process.stdout.write('.');

          // Percent indication
          var completedPercent = 100 - (recordStubs.length / originalTotal) * 100;
          if (completedPercent >= nextPercentTarget) {
            process.stdout.write('['+Math.floor(completedPercent)+'%]');
            nextPercentTarget = incrementPercentTarget(nextPercentTarget);
          }

          var batch = recordStubs.splice(0, BATCH_SIZE);

          db.medic.fetch({keys: _.pluck(batch, 'id')}, function(err, results) {
            if (err) {
              return callback(err);
            }
            var docs = _.pluck(results.rows, 'doc');

            docs = docs.map(attachmentIse).filter(function(i) {
              return i;
            });

            if (docs.length === 0) {
              // The view we're using gets all data records, not just XML ones
              // so there is a good chance entire batches will be filtered out
              // TODO: when we upgrade to CouchDB2.0 this is a great place to use
              //       mango filters to target XML forms better
              return callback();
            } else {
              db.medic.bulk({docs: docs}, callback);
            }
          });
        },
        function() {
          return recordStubs.length === 0;
        },
        function() {
          process.stdout.write('\n');
          return callback();
        }
      );
    });
  }
};
