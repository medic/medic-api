/*
 * Processes view data using a batch size and outputs bulk update results on
 * stdout.
 */

var DB = 'medic',
    DDOC = '_design/migrations-add-uuid-to-scheduled-tasks',
    VIEW = 'scheduled-tasks-no-uuids',
    BATCH_SIZE = 100;

var url = require('url'),
    uuid = require('./uuid'),
    stats = {
      docs: 0,
      messages: 0,
      changes: 0
    },
    http;

process.on('exit', function() {
  console.error(stats);
});

process.on('SIGINT', function() {
  process.exit();
});

if (process.env.COUCH_URL) {
  var options = url.parse(process.env.COUCH_URL);
  if (options.protocol === 'https:') {
    http = require('https');
  } else {
    http = require('http');
    console.warn('using unencrypted protocol: http');
  }
} else {
  console.log("Define COUCH_URL");
  process.exit();
}

// null is not an object
var isObject = function (obj) {
  return Boolean(obj && typeof obj === 'object');
};

var processData = function(input) {
  // prepare for bulk update
  var data = typeof input  === 'string' ? JSON.parse(input ) : input,
      ret = {docs: []};
  if (data.docs) {
    data = data.docs;
  } else if (data.rows) {
    data = data.rows;
  } else if (!Array.isArray(data)) {
    data = [data];
  }
  data.forEach(function(row) {
    var doc = row.doc ? row.doc : row;
    // skip null values
    if (!isObject(doc)) {
      return;
    }
    stats.docs++;
    doc.scheduled_tasks.forEach(function(task) {
      task.messages.forEach(function(msg) {
        stats.messages++;
        if (!msg.uuid) {
          msg.uuid = uuid.v4();
          stats.changes++;
        }
      });
    });
    ret.docs.push(doc);
  });
  return ret;
};

var bulkUpdate = function(body, callback) {
  var options = url.parse(process.env.COUCH_URL);
  options.method = 'POST';
  options.headers = {'content-type': 'application/json'};
  options.path = '/' + DB + '/_bulk_docs';
  var req = http.request(options, function(res) {
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      console.log(chunk);
    });
    res.on('error', callback);
  });
  req.on('error', callback);
  req.write(JSON.stringify(body));
  req.end();
};

var processViewData = function(callback) {
  var options = url.parse(process.env.COUCH_URL);
  options.path += '/' + DB + '/' + DDOC;
  options.path += '/_view/' + VIEW;
  options.path += '?limit=' + BATCH_SIZE + '&include_docs=true';
  var req = http.request(options, function(res) {
    var resBody = '';
    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      resBody += chunk;
    });
    res.on('end', function() {
      var body = JSON.parse(resBody);
      if (body.total_rows == 0) {
        // done processing view results
        return callback();
      }
      bulkUpdate(processData(body), function(e) {
        if (e) throw e;
        processViewData(callback);
      });
    });
    res.on('error', callback);
  });
  req.on('error', callback);
  req.end();
};

processViewData(function(err) {
  if (err) throw err;
});
