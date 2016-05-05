/*

TODO

I don't understand the existing data structure for messages in couch, so the
functions which should be querying and updating couch docs have not been
implemented yet.

There are some log messages followed by the comment DEBUG.  Once this controller
is working as expected and has tests, these are probably best removed.

 */

var utils = require('./utils'),
    db = require('../db'),
    _ = require('underscore');
require('lie/polyfill');

function readBody(req) {
  var body = '';
  return new Promise(function(resolve, reject) {
    req.on('data', function(data) {
      body += data.toString();
    });
    req.on('end', function() {
      resolve(body);
    });
    req.on('error', reject);
  });
}

function saveToDb(wtMessage) {
  // TODO the object provided should be converted into the medic format for
  // webapp-terminating SMS messages.  Supplied fields are:
  //   wtMessage.id
  //   wtMessage.from
  //   wtMessage.content
}

function updateStatus(doc, statusUpdate) {
  // TODO
  // 1. look up the message with id `statusUpdate.id`
  // 2, set it's status to `statusUpdate.status`.  N.B. This value may need to
  //    be translated to be in line with the statuses already in use.
  // 3. save the updated doc to couch
}

function getWebappOriginatingMessages() {
  return new Promise(function(resolve, reject) {
    // TODO fetch a sensible number of webapp-originating messages from couch,
    // and convert them into the expected `medic-gateway` format:
    //     { id:?, to:?, content:? }

    resolve({ docs: [], outgoingPayload: [] });
  });
}

function updateWebappOriginatingMessageStatuses(woMessages) {
  _.forEach(woMessages.docs, function(doc) {
    // TODO now that the messages have been successfully forwarded to
    // `medic-gateway`, update the status of each of the messages to prevent
    // them from being forwarded next time API is polled.
  });
}

module.exports = {
  get: function(options, callback) {
    callback(null, { 'medic-gateway': true });
  },
  post: function(req, callback) {
    readBody(req)
      .then(JSON.parse)
      .then(function(request) {
        // Process webapp-terminating messages asynchronously
        Promise.resolve()
          .then(function() {
            if(request.messages) {
              _.forEach(request.messages, function(webappTerminatingMessage) {
                console.log('Inserting wt message into DB.', webappTerminatingMessage); // DEBUG
                saveToDb(webappTerminatingMessage);
              });
            } else console.log('No WT messages.'); // DEBUG
          })
          .catch(console.log.bind(console.log));

        // Process delivery status updates asynchronously
        Promise.resolve()
          .then(function() {
            if(request.deliveries) {
              _.forEach(request.deliveries, function(statusUpdate) {
                console.log('Updating message status in DB.', statusUpdate); // DEBUG
                db.request('/' + statusUpdate.id, function(err, doc) {
                  if (err) {
                    return console.log('controllers/sms-gateway', 'Error processing delivery status update.', e, statusUpdate);
                  }
                  updateStatus(doc, statusUpdate);
                });
              });
            } else console.log('No deliveries.'); // DEBUG
          })
          .catch(console.log.bind(console.log));
      })
      .then(getWebappOriginatingMessages)
      .then(function(woMessages) {
        callback(null, { messages: woMessages.outgoingPayload });
        updateWebappOriginatingMessageStatuses(woMessages);
      })
      .catch(callback);
  },
};
