/**
 * This module implements GET and POST to support medic-gateway's API
 * @see https://github.com/medic/medic-gateway
 */

/*

TODO

* There are some log messages followed by the comment DEBUG.  Once this controller
is working as expected and has tests, these are probably best removed.

 */

var _ = require('underscore'),
    db = require('../db'),
    http = require('http'),
    querystring = require('querystring'),
    utils = require('./utils'),
    messageUtils = require('./messages');

require('lie/polyfill');

var UNUSED = null; // this var is declared in various functions in the messages controller but never actually used

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

  new Promise(function(resolve, reject) {
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
            return resolve();
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

function getWebappState(update) {
  switch(update.status) {
    case 'SENT':
      return 'sent';
    case 'DELIVERED':
      return 'delivered';
    case 'FAILED':
      return 'failed';
  }
}

function updateStateFor(gatewayRequest, update) {
  var newState = getWebappState(update);
  if (!newState) {
    return Promise.reject(new Error('Could not work out new state for update: ' + JSON.stringify(update)));
  }

  return updateState(
      gatewayRequest,
      gatewayRequest.headers['user-agent'],
      update.id,
      newState);
}

function updateState(gatewayRequest, userAgent, messageId, newState) {
  var updateBody = {
    state: newState,
    details: {
      useragent: userAgent,
    },
  };

  new Promise(function(resolve, reject) {
    messageUtils.updateMessage(messageId, updateBody, UNUSED, function(err, result) {
      if (err) {
        return reject(err);
      }
      console.log('updateState', 'update completed', userAgent, messageId, newState, result);
      return resolve();
    });
  })
  .catch(function(err) {
    console.log('updateState', 'error updating message state', userAgent, messageId, newState, err);
  });
}

function getWebappOriginatingMessages(gatewayRequest) {
  return new Promise(function(resolve, reject) {
    var opts = { state: 'pending' };
    messageUtils.getMessages(opts, UNUSED, function(err, pendingMessages) {
      if (err) {
        return reject(err);
      }
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
    });
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

        // Process WO message status updates asynchronously
        Promise.resolve()
          .then(function() {
            if(request.updates) {
              _.forEach(request.updates, function(update) {
                updateStateFor(req, update);
              });
            } else console.log('No status updates.'); // DEBUG
          })
          .catch(console.log.bind(console.log));
      })
      .then(function() {
        return getWebappOriginatingMessages(req);
      })
      .then(function(woMessages) {
        callback(null, { messages: woMessages.outgoingPayload });
        _.forEach(woMessages.docs, function(doc) {
          updateState(req, 'medic-api:sms-gateway controller', doc.id, 'scheduled');
        });
      })
      .catch(callback);
  },
};
