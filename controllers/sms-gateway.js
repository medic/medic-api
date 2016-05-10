/*

TODO

I don't understand the existing data structure for messages in couch, so the
functions which should be querying and updating couch docs have not been
implemented yet.

There are some log messages followed by the comment DEBUG.  Once this controller
is working as expected and has tests, these are probably best removed.

 */

var _ = require('underscore'),
    db = require('../db'),
    http = require('http'),
    utils = require('./utils');
require('lie/polyfill');

function readBody(stream) {
  var body = '';
  return new Promise(function(resolve, reject) {
    stream.on('data', function(data) {
      body += data.toString();
    });
    stream.on('end', function() {
      resolve(body);
    });
    stream.on('error', reject);
  });
}

function saveToDb(wtMessage) {
  // TODO the object provided should be converted into the medic format for
  // webapp-terminating SMS messages.  Supplied fields are:
  //   wtMessage.id
  //   wtMessage.from
  //   wtMessage.content
}

function getWebappState(delivery) {
  switch(delivery.status) {
    case 'SENT':
      return 'sent';
    case 'DELIVERED':
      return 'delivered';
    case 'REJECTED':
    case 'FAILED':
      return 'failed';
  }
}

function updateStateForDelivery(gatewayRequest, delivery) {
  var newState = getWebappState(delivery);
  if (!newState) {
    return Promise.reject(new Error('Could not work out new state for delivery: ' + JSON.stringify(delivery)));
  }

  return updateState(
      gatewayRequest.getHeader('user-agent'),
      delivery.id,
      newState);
}

function updateState(userAgent, messageId, newState) {
  var updateBody = {
    state: newState,
    details: {
      useragent: userAgent,
    },
  };

  new Promise(function(resolve, reject) {
    var req = http.request(
      {
        hostname: 'localhost',
        port: 5988,
        path: '/api/v1/messages/state/' + messageId,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
      },
      function(res) {
        readBody(res)
          .then(JSON.parse)
          .then(function(response) {
            console.log('updateState', 'update completed', userAgent, messageId, newState);
          })
          .catch(reject);
      });

    req.on('error', reject);

    req.write(JSON.stringify(updateBody));
    req.end();
  })
  .catch(function(err) {
    console.log('updateState', 'error updating message state', userAgent, messageId, newState, err);
  });
}

function getWebappOriginatingMessages() {
  return new Promise(function(resolve, reject) {
    var req = http.request(
      {
        hostname: 'localhost',
        port: 5988,
        path: '/api/v1/messages?state=pending',
        method: 'GET',
      },
      function(res) {
        readBody(res)
          .then(JSON.parse)
          .then(function(pendingMessages) {
            var woMessages = { docs: [], outgoingPayload: [] };
            _.each(pendingMessages, function(pendingMessage) {
              docs.push(pendingMessage);
              outgoingPayload.push({
                id: pendingMessage.id,
                to: pendingMessage.to,
                content: pendingMessage.message,
              });
            });
            resolve(woMessages);
          })
          .catch(reject);
      });

    req.on('error', reject);
    req.end();
  });
}

function updateWebappOriginatingMessageStatuses(woMessages) {
  _.forEach(woMessages.docs, function(doc) {
    updateState('medic-api:updateWebappOriginatingMessageStatuses()', doc.id, 'scheduled');
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
              _.forEach(request.deliveries, function(delivery) {
                updateStateForDelivery(req, delivery);
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
