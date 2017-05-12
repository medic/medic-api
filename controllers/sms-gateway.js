/**
 * This module implements GET and POST to support medic-gateway's API
 * @see https://github.com/medic/medic-gateway
 */

const _ = require('underscore'),
      async = require('async'),
      messageUtils = require('./message-utils'),
      recordUtils = require('./record-utils'),

      // map from the medic-gateway state to the medic-webapp state
      STATUS_MAP = {
        UNSENT: 'received-by-gateway',
        PENDING: 'forwarded-by-gateway',
        SENT: 'sent',
        DELIVERED: 'delivered',
        FAILED: 'failed',
      };

function warn() {
  const args = Array.prototype.slice.call(arguments, 0);
  args.unshift('WARN', 'sms-gateway');
  console.error.apply(console, args);
}

// TODO: pull the logic out of CouchDB, make local, make bulk update
function saveToDb(message, callback) {
  recordUtils.createByForm({
    from: message.from,
    message: message.content,
    gateway_ref: message.id,
  }, callback);
}

function mapStateFields(update) {
  const result = {
    messageId: update.id
  };
  result.state = STATUS_MAP[update.status];
  if (result.state) {
    if(update.reason) {
      result.details = { reason: update.reason };
    }
  } else {
    result.state = 'unrecognised';
    result.details = { gateway_status: update.status };
  }

  return result;
}

function markMessagesForwarded(messages, callback) {
  const taskStateChanges = messages.map((message) => { return {
    messageId: message.id,
    state: 'forwarded-to-gateway'
  };});

  messageUtils.updateMessageTaskStates(taskStateChanges, callback);
}

function getOutgoing(callback) {
  messageUtils.getMessages({ states: ['pending', 'forwarded-to-gateway'] },
    (err, pendingMessages) => {
      // TODO: I don't get this. Why wouldn't you return an error here? What
      //       is the intention behind hiding it from the caller?
      if (err) {
        warn(err);
        return callback(null, []);
      }

      const messages = pendingMessages.map(message => {
        return {
          id: message.id,
          to: message.to,
          content: message.message,
        };
      });

      markMessagesForwarded(messages, (err) => {
        if (err) {
          callback(err);
        } else {
          callback(null, messages);
        }
      });
  });
}

// Process webapp-terminating messages
function addNewMessages(req, callback) {
  if (!req.body.messages) {
    return callback();
  }

  async.eachSeries(req.body.messages, saveToDb, err => {
    if (err) {
      warn(err);
    }
    callback();
  });
}

// Process message status updates
function processTaskStateUpdates(req, callback) {
  if (!req.body.updates) {
    return callback();
  }

  const taskStateChanges = req.body.updates.map(mapStateFields);

  messageUtils.updateMessageTaskStates(taskStateChanges, callback);
}

module.exports = {
  get: function(callback) {
    callback(null, { 'medic-gateway': true });
  },
  post: function(req, callback) {
    async.series([
      _.partial(addNewMessages, req),
      _.partial(processTaskStateUpdates, req),
      getOutgoing
    ], (err, [,,outgoingMessages]) => {
      if (err) {
        return callback(err);
      }
      callback(null, { messages: outgoingMessages });
    });
  },
};
