/*

TODO

There are some log messages followed by the comment DEBUG.  Once this controller
is working as expected and has tests, these are probably best removed.

 */

var _ = require('underscore'),
    db = require('../db'),
    http = require('http'),
    querystring = require('querystring'),
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

function readResBody(res) {
  return readBody(res)
    .then(function(body) {
      if (res.statusCode >= 400) {
        throw new Error('Bad status received: ' + res.statusCode + ': ' + body);
      }
      return body;
    });
}

function saveToDb(gatewayRequest, wtMessage) {
  var messageBody = querystring.stringify({
    from: wtMessage.from,
    message: wtMessage.content,
    'medic-gateway_id': wtMessage.id,
  });

  new Promise(function(resolve, reject) { // TODO unresolved
    var req = http.request(
      {
        hostname: 'localhost',
        port: 5984,
        path: '/medic/_design/medic/_rewrite/add',
        method: 'POST',
        headers: {
          'Content-Length': messageBody.length,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': gatewayRequest.headers.authorization,
        },
      },
      function(res) {
        readResBody(res)
          .then(JSON.parse)
          .then(function(response) {
            console.log('saveToDb', 'completed', wtMessage);
          })
          .catch(reject);
      });

    req.on('error', reject);

    req.write(messageBody);
    req.end();
  })
  .catch(function(err) {
    console.log('saveToDb', 'error saving', wtMessage, err);
  });
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
      gatewayRequest,
      gatewayRequest.headers['user-agent'],
      delivery.id,
      newState);
}

function updateState(gatewayRequest, userAgent, messageId, newState) {
  var updateBody = {
    state: newState,
    details: {
      useragent: userAgent,
    },
  };

  new Promise(function(resolve, reject) { // TODO unresolved
    var path = '/api/v1/messages/state/' + messageId;
    console.log('updateState()', path, '->', newState, updateBody);

    var req = http.request(
      {
        hostname: 'localhost',
        port: 5988,
        path: path,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': gatewayRequest.headers.authorization,
        },
      },
      function(res) {
        readResBody(res)
          .then(JSON.parse)
          .then(function(response) {
            console.log('updateState', 'update completed', userAgent, messageId, newState, response);
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

function getWebappOriginatingMessages(gatewayRequest) {
  return new Promise(function(resolve, reject) {
    var req = http.request(
      {
        hostname: 'localhost',
        port: 5988,
        path: '/api/v1/messages?state=pending',
        method: 'GET',
        headers: {
          'Authorization': gatewayRequest.headers.authorization,
        },
      },
      function(res) {
        readResBody(res)
          .then(JSON.parse)
          .then(function(pendingMessages) {
            var woMessages = { docs: [], outgoingPayload: [] };
            _.each(pendingMessages, function(pendingMessage) {
              woMessages.docs.push(pendingMessage);
              woMessages.outgoingPayload.push({
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

function updateWebappOriginatingMessageStatuses(gatewayRequest, woMessages) {
  _.forEach(woMessages.docs, function(doc) {
    updateState(gatewayRequest, 'medic-api:updateWebappOriginatingMessageStatuses()', doc.id, 'scheduled');
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
                saveToDb(req, webappTerminatingMessage);
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
      .then(function() {
        return getWebappOriginatingMessages(req);
      })
      .then(function(woMessages) {
        callback(null, { messages: woMessages.outgoingPayload });
        updateWebappOriginatingMessageStatuses(req, woMessages);
      })
      .catch(callback);
  },
};
