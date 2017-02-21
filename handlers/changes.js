var _ = require('underscore'),
    auth = require('../auth'),
    config = require('../config'),
    serverUtils = require('../server-utils'),
    db = require('../db'),
    ALL_KEY = '_all', // key in the docs_by_replication_key view for records everyone can access
    UNASSIGNED_KEY = '_unassigned', // key in the docs_by_replication_key view for unassigned records
    CONTACT_TYPES = ['person', 'clinic', 'health_center', 'district_hospital'],
    inited = false,
    continuousFeeds = [];

var error = function(code, message) {
  return JSON.stringify({ code: code, message: message });
};

var getDepth = function(userCtx) {
  if (!userCtx.roles || !userCtx.roles.length) {
    return -1;
  }
  var settings = config.get('replication_depth');
  if (!settings) {
    return -1;
  }
  var depth = -1;
  userCtx.roles.forEach(function(role) {
    // find the role with the deepest depth
    var setting = _.findWhere(settings, { role: role });
    var settingDepth = setting && parseInt(setting.depth, 10);
    if (!isNaN(settingDepth) && settingDepth > depth) {
      depth = settingDepth;
    }
  });
  return depth;
};

var bindSubjectIds = function(feed) {
  return auth.getFacilityId(feed.req, feed.userCtx)
    .then(function(facilityId) {
      if (!facilityId) {
        feed.subjectIds = [];
        return;
      }
      feed.facilityId = facilityId;
      return auth.getContactId(feed.userCtx)
        .then(function(contactId) {
          feed.contactId = contactId;
          var keys = [];
          var depth = getDepth(feed.userCtx);
          if (depth >= 0) {
            for (var i = 0; i <= depth; i++) {
              keys.push([ facilityId, i ]);
            }
          } else {
            // no configured depth limit
            keys.push([ facilityId ]);
          }
          return db.pouchdb.medic.query('medic/contacts_by_depth', { keys: keys });
        })
        .then(function(result) {
          var subjectIds = [];
          result.rows.forEach(function(row) {
            subjectIds.push(row.id);
            if (row.value) {
              subjectIds.push(row.value);
            }
          });
          subjectIds.push(ALL_KEY);
          if (config.get('district_admins_access_unallocated_messages') &&
              auth.hasAllPermissions(feed.userCtx, 'can_view_unallocated_data_records')) {
            subjectIds.push(UNASSIGNED_KEY);
          }
          feed.subjectIds = subjectIds;
        });
    });
};

/**
 * Method to ensure users don't see reports submitted by their boss about the user
 */
var isSensitive = function(feed, subject, submitter) {
  if (!subject || !submitter) {
    // either not sure who it's about, or who submitted it - not sensitive
    return false;
  }
  if (subject !== feed.contactId && subject !== feed.facilityId) {
    // must be about a descendant - not sensitive
    return false;
  }
  // submitted by someone the user can't see
  return feed.subjectIds.indexOf(submitter) === -1;
};

var bindValidatedDocIds = function(feed) {
  return db.medic.pouchdb.query('medic/docs_by_replication_key', { keys: feed.subjectIds })
    .then(function(result) {
      feed.validatedIds = result.rows.reduce(function(ids, row) {
        if (!isSensitive(feed, row.key, row.value.submitter)) {
          ids.push(row.id);
        }
        return ids;
      }, [ '_design/medic-client', 'org.couchdb.user:' + feed.userCtx.name ]);
    });
};

var bindRequestedIds = function(feed) {
  var ids = [];
  if (feed.req.body && feed.req.body.doc_ids) {
    // POST request
    ids = feed.req.body.doc_ids;
  } else if (feed.req.query && feed.req.query.doc_ids) {
    // GET request
    try {
      ids = JSON.parse(feed.req.query.doc_ids);
    } catch(e) {
      throw new Error({ code: 400, message: 'Invalid doc_ids param' });
    }
  }
  feed.requestedIds = ids;
};

var defibrillator = function(feed) {
  if (feed.req.query && feed.req.query.heartbeat) {
    feed.heartbeat = setInterval(function() {
      feed.res.write('\n');
    }, feed.req.query.heartbeat);
  }
};

var prepareResponse = function(feed, changes) {
  // filter out records the user isn't allowed to see
  changes.results = changes.results.filter(function(change) {
    return change.deleted || _.contains(feed.validatedIds, change.id);
  });
  feed.res.write(JSON.stringify(changes));
};

var cleanUp = function(feed) {
  if (feed.heartbeat) {
    clearInterval(feed.heartbeat);
  }
  var index = _.indexOf(continuousFeeds, feed);
  if (index !== -1) {
    continuousFeeds.splice(index, 1);
  }
  if (feed.changesReq) {
    feed.changesReq.cancel();
  }
};

var getChanges = function(feed) {
  var options = _.pick(feed.req.query, 'timeout', 'style', 'heartbeat', 'since', 'feed', 'limit', 'filter');
  options.live = true;
  options.doc_ids = _.union(feed.requestedIds, feed.validatedIds);
  feed.changesReq = db.pouchdb.medic.changes(options)
    .on('change', function(changes) {
      if (!changes || !changes.results) {
        // See: https://github.com/medic/medic-webapp/issues/3099
        // This should never happen, but apparently it does sometimes.
        // Attempting to log out the response usefully to see what's occuring
        var malformedChangesError = 'No _changes error, but malformed response: ';
        var printableChanges = JSON.stringify(changes);
        console.error(malformedChangesError, printableChanges);
        feed.res.write(error(503, malformedChangesError + printableChanges));
      } else {
        prepareResponse(feed, changes);
      }
      feed.res.end();
      cleanUp(feed);
    })
    .on('error', function() {
      feed.res.write(error(503, 'Error processing your changes'));
      feed.res.end();
      cleanUp(feed);
    });
};

var bindServerIds = function(feed) {
  return bindSubjectIds(feed).then(function() {
    return bindValidatedDocIds(feed);
  });
};

var initFeed = function(feed) {
  bindRequestedIds(feed);
  return bindServerIds(feed);
};

// returns if it is true that for any document in the feed the user
// should be able to see it AND they don't already
var hasNewApplicableDoc = function(feed, changes) {
  return _.some(changes, function(change) {
    if (_.contains(feed.validatedIds, change.id)) {
      // feed already knows about doc
      return false;
    }
    if (isSensitive(feed, change.subject, change.submitter)) {
      // don't show sensitive information
      return false;
    }
    if (feed.subjectIds.indexOf(change.subject) !== -1) {
      // this is relevant to the feed
      return true;
    }
    if (CONTACT_TYPES.indexOf(change.doc.type) === -1) {
      // only people and places are subjects so we don't need to update
      // the subject list for non-contact types.
      return false;
    }
    var depth = getDepth(feed.userCtx);
    if (depth < 0) {
      depth = Infinity;
    }
    var parent = change.doc.parent;
    while (depth >= 0 && parent) {
      if (feed.subjectIds.indexOf(parent._id) !== -1) {
        // this is relevant to the feed
        return true;
      }
      depth--;
      parent = parent.parent;
    }
    return false;
  });
};

// WARNING: If updating this function also update the docs_by_replication_key view in lib/views.js
var getReplicationKey = function(doc) {
  if (doc._id === 'resources' ||
      doc._id === 'appcache' ||
      doc._id === 'zscore-charts' ||
      doc.type === 'form' ||
      doc.type === 'translations') {
    return [ '_all', {} ];
  }
  switch (doc.type) {
    case 'data_record':
      var subject;
      var submitter;
      if (doc.form) {
        // report
        subject = (doc.patient_id || (doc.fields && doc.fields.patient_id)) ||
                  (doc.place_id || (doc.fields && doc.fields.place_id)) ||
                  (doc.contact && doc.contact._id);
        submitter = doc.contact && doc.contact._id;
      } else if (doc.sms_message) {
        // incoming message
        subject = doc.contact && doc.contact._id;
      } else if (doc.kujua_message) {
        // outgoing message
        subject = doc.tasks &&
                  doc.tasks[0] &&
                  doc.tasks[0].messages &&
                  doc.tasks[0].messages[0] &&
                  doc.tasks[0].messages[0].contact &&
                  doc.tasks[0].messages[0].contact._id;
      }
      if (subject) {
        return [ subject, { submitter: submitter } ];
      }
      return [ '_unassigned', {} ];
    case 'clinic':
    case 'district_hospital':
    case 'health_center':
    case 'person':
      return [ doc._id, {} ];
  }
};

var updateFeeds = function(changes) {
  var modifiedChanges = changes.results.map(function(change) {
    var result = {
      id: change.id,
      doc: change.doc
    };
    var row = getReplicationKey(change.doc);
    if (row && row.length) {
      result.subject = row[0];
      result.submitter = row[1].submitter;
    }
    return result;
  });
  continuousFeeds.forEach(function(feed) {
    // check if new and relevant
    if (hasNewApplicableDoc(feed, modifiedChanges)) {
      if (feed.changesReq) {
        feed.changesReq.abort();
      }
      bindServerIds(feed, function(err) {
        if (err) {
          return serverUtils.error(err, feed.req, feed.res);
        }
        getChanges(feed);
      });
    }
  });
};

var init = function(since) {
  inited = true;
  var options = {
    since: since || 'now',
    heartbeat: true,
    feed: 'longpoll',
    include_docs: true
  };
  db.pouchdb.medic.changes(options)
    .on('change', function(changes) {
      updateFeeds(changes);
      setTimeout(function() {
        init(changes.last_seq);
      }, 1000);
    })
    .on('error', function(err) {
      console.error('Error watching for db changes', err);
      setTimeout(function() {
        init(since);
      }, 1000);
    });
};

module.exports = {
  request: function(proxy, req, res) {
    console.log('0');
    if (!inited) {
      init();
    }
    console.log('1');
    auth.getUserCtx(req)
      .then(function(userCtx) {
        console.log('2');

        if (req.query.feed === 'longpoll' ||
            req.query.feed === 'continuous' ||
            req.query.feed === 'eventsource') {
          // Disable nginx proxy buffering to allow hearbeats for long-running feeds
          res.setHeader('X-Accel-Buffering', 'no');
        }

        if (auth.hasAllPermissions(userCtx, 'can_access_directly')) {
          console.log('3');

          proxy.web(req, res);
        } else {
          var feed = {
            req: req,
            res: res,
            userCtx: userCtx
          };
          req.on('close', function() {
            cleanUp(feed);
          });
          initFeed(feed).then(function() {
            if (req.query.feed === 'longpoll') {
              // watch for newly added docs
              continuousFeeds.push(feed);
            }
            res.type('json');
            defibrillator(feed);
            getChanges(feed);
          });
        }
      })
      .catch(function(err) {
        serverUtils.error(err, req, res);
      });
  },
  _getReplicationKey: getReplicationKey // used for testing
};

// used for testing
if (process.env.UNIT_TEST_ENV) {
  _.extend(module.exports, {
    _reset: function() {
      continuousFeeds = [];
      inited = false;
    },
    _getFeeds: function() {
      return continuousFeeds;
    }
  });
}
