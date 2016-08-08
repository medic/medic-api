/**
 * This module implements GET and POST to support medic-gateway's API
 * @see https://github.com/medic/medic-gateway
 */

var async = require('async'),
// TODO pull these out as utils rather than calling controller code...
    messageUtils = require('./messages'),
    recordUtils = require('./records');

function warn() {
  var args = Array.prototype.slice.call(arguments, 0);
  args.unshift('WARN', 'sms-gateway');
  console.error.apply(console, args);
}

function saveToDb(message, callback) {
  recordUtils.createByForm({
    from: message.from,
    message: message.content,
    gateway_ref: message.id,
  }, callback);
}

function getWebappState(update) {
  // TODO replace with map
  switch(update.status) {
    case 'SENT':
      return 'sent';
    case 'DELIVERED':
      return 'delivered';
    case 'FAILED':
      return 'failed';
  }
}

function updateStateFor(update, callback) {
  var newState = getWebappState(update);
  if (!newState) {
    return callback(new Error('Could not work out new state for update: ' + JSON.stringify(update)));
  }
  updateState(update.id, newState, update.reason, callback);
}

function updateState(messageId, newState, reason, callback) {
  var updateBody = {
    state: newState,
  };
  if (reason) {
    updateBody.details = { reason: reason };
  }
  messageUtils.updateMessage(messageId, updateBody, callback);
}

// TODO update to use bulk docs instead of update function??
function markMessagesScheduled(messages, callback) {
  async.eachSeries(
    messages,
    function(message, callback) {
      updateState(message.id, 'scheduled', null, callback);
    },
    function(err) {
      if (err) {
        warn(err);
      }
      return callback();
    }
  );
}

function getOutgoing(callback) {
  messageUtils.getMessages({ state: 'pending' }, function(err, pendingMessages) {
    if (err) {
      warn(err);
      return callback(null, []);
    }
    var messages = pendingMessages.map(function(message) {
      return {
        id: message.id,
        to: message.to,
        content: message.message,
      };
    });
    markMessagesScheduled(messages, function() {
      callback(null, messages);
    });
  });
}

// Process webapp-terminating messages
function processMessages(req, callback) {
  if (!req.body.messages) {
    return callback();
  }
  async.eachSeries(req.body.messages, saveToDb, function(err) {
    if (err) {
      warn(err);
    }
    callback();
  });
}

// Process message status updates
function processUpdates(req, callback) {
  if (!req.body.updates) {
    return callback();
  }
  async.eachSeries(req.body.updates, updateStateFor, function(err) {
    if (err) {
      warn(err);
    }
    callback();
  });
}


// TODO this needs to be documented in the api docs
module.exports = {
  get: function(callback) {
    // TODO what is this for? Is it listing supported clients? Because that
    // seems backwards...
    callback(null, { 'medic-gateway': true });
  },
  // TODO why is the POST api returning messages to send?
  // TODO the client isn't getting any status feedback if something goes wrong
  post: function(req, callback) {
    async.series([
      function(callback) {
        processMessages(req, callback);
      },
      function(callback) {
        processUpdates(req, callback);
      },
      function(callback) {
        getOutgoing(callback);
      }
    ], function(err, results) {
      if (err) {
        return callback(err);
      }
      callback(null, { messages: results[2] });
    });
  },
};
