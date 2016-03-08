var async = require('async'),
    _ = require('underscore'),
    db = require('../db');

var getType = function(user, admins) {
  if (user.roles && user.roles.length) {
    return user.roles[0];
  }
  return admins[user.name] ? 'admin' : 'unknown';
};

var getFacility = function(user, facilities) {
  return _.findWhere(facilities, { _id: user.facility_id });
};

var getAllUserSettings = function(callback) {
  var opts = {
    include_docs: true,
    key: ['user-settings']
  };
  db.medic.view('medic', 'doc_by_type', opts, function(err, results) {
    if (err) {
      return callback(err);
    }
    callback(null, _.map(results.rows, function(row) {
      return row.doc;
    }));
  });
};

var getAllUsers = function(callback) {
  db._users.list({include_docs: true}, function(err, results) {
    if (err) {
      return callback(err);
    }
    callback(null, results.rows);
  });
};

var getFacilities = function(callback) {
  db.medic.view('medic', 'facilities', {include_docs: true}, function(err, results) {
    if (err) {
      return callback(err);
    }
    callback(null, _.map(results.rows, function(row) {
      return row.doc;
    }));
  });
};

var getSettings = function(id, settings) {
  return _.findWhere(settings, { _id: id });
};

var getAdmins = function(callback) {
  var opts = {
    path: '_config/admins'
  };
  db.request(opts, function(err, body) {
    if (err) {
      return callback(err);
    }
    callback(null, body);
  });
};

var mapUsers = function(users, settings, facilities, admins) {
  var filtered = _.filter(users, function(user) {
    return user.id.indexOf(getPrefix() + ':') === 0;
  });
  return _.map(filtered, function(user) {
    var setting = getSettings(user.id, settings) || {};
    return {
      id: user.id,
      rev: user.doc._rev,
      username: user.doc.name,
      fullname: setting.fullname,
      email: setting.email,
      phone: setting.phone,
      facility: getFacility(user.doc, facilities),
      type: getType(user.doc, admins),
      language: { code: setting.language },
      contact_id: setting.contact_id
    };
  });
};

var getOrCreateUser = function(id, callback) {
  db._users.get(id, function(err, data) {
    if (err) {
      if (err.error === 'not_found') {
        callback(null, {
          _id: id,
          type: 'user'
        });
      } else {
        callback(err);
      }
    } else {
      callback(null, data);
    }
  });
};

var getOrCreateUserSettings = function(id, name, callback) {
  db.medic.get(id, function(err, data) {
    if (err) {
      if (err.error === 'not_found') {
        callback(null, {
          _id: id,
          type: 'user-settings'
        });
      } else {
        callback(err);
      }
    } else {
      callback(null, data);
    }
  });
};

var updatePassword = function(updated, callback) {
  if (!updated.password) {
    // password not changed, do nothing
    return callback();
  }
  module.exports._getAdmins(function(err, admins) {
    if (err) {
      if (err.error === 'unauthorized') {
        // not an admin
        return callback();
      }
      return callback(err);
    }
    if (!admins[updated.name]) {
      // not an admin so admin password change not required
      return callback();
    }
    db.request({
      path: '_config/admins/' + updated.name,
      method: 'PUT',
      body: JSON.stringify(updated.password)
    }, callback);
  });
};

var updateUser = function(id, updates, callback) {
  if (!updates) {
    // only updating settings
    return callback();
  }
  getOrCreateUser(id, function(err, user) {
    if (err) {
      return callback(err);
    }
    var updated = _.extend(user, updates);
    if (updated.password) {
      delete updated.derived_key;
      delete updated.salt;
    }
    db._users.insert(updated, function(err) {
      if (err) {
        return callback(err);
      }
      updatePassword(updated, function(err) {
        callback(err, updated);
      });
    });
  });
};

var updateSettings = function(id, updates, callback) {
  if (!updates) {
    // only updating user
    return callback();
  }
  getOrCreateUserSettings(id, updates.name, function(err, settings) {
    if (err) {
      return callback(err);
    }
    var updated = _.extend(settings, updates);
    db.medic.insert(updated, callback);
  });
};

var createOrUpdate = function(id, settingUpdates, userUpdates, callback) {
  if (!callback) {
    callback = userUpdates;
    userUpdates = null;
  }
  if (!id && !userUpdates) {
    return callback(new Error('Cannot update user settings without user'));
  }
  updateUser(id, userUpdates, function(err) {
    if (err) {
      return callback(err);
    }
    updateSettings(id, settingUpdates, callback);
  });
};

var rolesMap = {
  'national-manager': ['kujua_user', 'data_entry', 'national_admin'],
  'district-manager': ['kujua_user', 'data_entry', 'district_admin'],
  'facility-manager': ['kujua_user', 'data_entry'],
  'data-entry': ['data_entry'],
  'analytics': ['kujua_analytics'],
  'gateway': ['kujua_gateway']
};

var getRoles = function(type) {
  // create a new array with the type first, by convention
  return type ? [type].concat(rolesMap[type]) : [];
};

var getDocID = function(doc) {
  if (typeof doc === 'string') {
    return doc;
  }
  if (typeof doc === 'object') {
    return doc._id;
  }
};

var getSettingsUpdates = function(data) {
  return {
  // Redundant, already saved in users db.
  // name: data.name,
    fullname: data.fullname,
    email: data.email,
    phone: data.phone,
    language: data.language && data.language.code,
    facility_id: getDocID(data.place),
    contact_id: getDocID(data.contact)
  };
};

var getUserUpdates = function(id, data) {
  return {
    name: id.split(':')[1],
    password: data.password,
    // defaults role to district-manager
    roles: data.type ? getRoles(data.type) : getRoles('district-manager'),
    facility_id: getDocID(data.place)
  };
};

var getPrefix = function() {
  return 'org.couchdb.user';
};

var createId = function(name) {
  return [getPrefix(), name].join(':');
};

var deleteUser = function(id, callback) {
  // Potential problem here where _users database update happens but medic
  // update fails and user is in inconsistent state. There is no way to do
  // atomic update on more than one database with CouchDB API.
  async.series([
    function(cb){
      db._users.get(id, function(err, user) {
        if (err) {
          return cb(err);
        }
        user._deleted = true;
        db._users.insert(user, cb);
      });
    },
    function(cb){
      db.medic.get(id, function(err, user) {
        if (err) {
          return cb(err);
        }
        user._deleted = true;
        db.medic.insert(user, cb);
      });
    }
  ], function(err) {
    callback(err);
  });
};

/*
 * Everything not exported directly is private.  Underscore prefix is only used
 * to export functions needed for testing.
 */
module.exports = {
  _mapUsers: mapUsers,
  _getType : getType,
  _getAdmins: getAdmins,
  _getAllUsers: getAllUsers,
  _getAllUserSettings: getAllUserSettings,
  _getFacilities: getFacilities,
  _getOrCreateUser: getOrCreateUser,
  _getSettingsUpdates: getSettingsUpdates,
  _getUserUpdates: getUserUpdates,
  _createOrUpdate: createOrUpdate,
  deleteUser: function(username, callback) {
    deleteUser(createId(username), callback);
  },
  getList: function(callback) {
    var self = this;
    async.parallel([
      self._getAllUsers,
      self._getAllUserSettings,
      self._getFacilities,
      self._getAdmins
    ], function(err, results) {
      if (err) {
        return callback(err);
      }
      callback(null, self._mapUsers(results[0], results[1], results[2], results[3]));
    });
  },
  createOrUpdate: function(username, data, contentType, callback) {
    var self = this,
        id = createId(username);
    if (['json'].indexOf(contentType) === -1) {
      return callback(new Error('Content type not supported.'));
    }
    self._createOrUpdate(
      id,
      getSettingsUpdates(data),
      getUserUpdates(id, data),
      callback
    );
  }
};