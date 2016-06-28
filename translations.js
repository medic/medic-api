var async = require('async'),
    _ = require('underscore'),
    properties = require('properties'),
    db = require('./db'),
    DDOC_ID = '_design/medic',
    TRANSLATION_FILE_NAME_REGEX = /translations\/messages\-([a-z]*)\.properties/,
    DOC_TYPE = 'translations',
    BACKUP_TYPE = 'translations-backup';

var LOCAL_NAME_MAP = {
  en: 'English',
  es: 'Español (Spanish)',
  fr: 'Français (French)',
  ne: 'नेपाली (Nepali)',
  sw: 'Kiswahili (Swahili)',
  hi: 'हिन्दी (Hindi)'
};

var extractLocaleCode = function(filename) {
  var parts = TRANSLATION_FILE_NAME_REGEX.exec(filename);
  if (parts && parts[1]) {
    return parts[1].toLowerCase();
  }
};

var createBackup = function(attachment) {
  return {
    _id: [ 'messages', attachment.code, 'backup' ].join('-'),
    type: BACKUP_TYPE,
    code: attachment.code,
    values: attachment.values
  };
};

var createDoc = function(attachment) {
  return {
    _id: [ 'messages', attachment.code ].join('-'),
    type: DOC_TYPE,
    code: attachment.code,
    name: LOCAL_NAME_MAP[attachment.code] || attachment.code,
    enabled: true,
    values: attachment.values
  };
};

var merge = function(attachments, backups, docs) {
  var updatedDocs = [];
  attachments.forEach(function(attachment) {
    var code = attachment.code;
    if (!code) {
      return;
    }
    var backup = _.findWhere(backups, { code: code });
    if (!backup) {
      // new language
      updatedDocs.push(createDoc(attachment));
      updatedDocs.push(createBackup(attachment));
      return;
    }
    var doc = _.findWhere(docs, { code: code });
    if (doc) {
      // language hasn't been deleted - free to update
      var updated = false;
      Object.keys(attachment.values).forEach(function(key) {
        if (!doc.values[key] || (doc.values[key] === backup.values[key] && backup.values[key] !== attachment.values[key])) {
          // new or updated translation
          doc.values[key] = attachment.values[key];
          updated = true;
        }
      });
      if (updated) {
        updatedDocs.push(doc);
      }
    }
    if (!_.isEqual(backup.values, attachment.values)) {
      // backup the modified attachment
      backup.values = attachment.values;
      updatedDocs.push(backup);
    }
  });
  return updatedDocs;
};

var getAttachment = function(name, callback) {
  db.medic.attachment.get(DDOC_ID, name, function(err, attachment) {
    if (err) {
      return callback(err);
    }
    properties.parse(attachment.toString('utf8'), function(err, values) {
      if (err) {
        return callback(err);
      }
      callback(null, {
        code: extractLocaleCode(name),
        values: values
      });
    });
  });
};

var getAttachments = function(callback) {
  db.medic.get(DDOC_ID, function(err, ddoc) {
    if (err) {
      return callback(err);
    }
    if (!ddoc._attachments) {
      return callback(null, []);
    }
    var attachments = _.filter(Object.keys(ddoc._attachments), function(key) {
      return key.match(TRANSLATION_FILE_NAME_REGEX);
    });
    async.map(attachments, getAttachment, callback);
  });
};

var getDocs = function(type, callback) {
  var options = { key: [ type ], include_docs: true };
  db.medic.view('medic', 'doc_by_type', options, function(err, response) {
    if (err) {
      return callback(err);
    }
    callback(null, _.pluck(response.rows, 'doc'));
  });
};

module.exports = {
  run: function(callback) {
    getAttachments(function(err, attachments) {
      if (err) {
        return callback(err);
      }
      if (!attachments.length) {
        return callback();
      }
      getDocs(BACKUP_TYPE, function(err, backups) {
        if (err) {
          return callback(err);
        }
        getDocs(DOC_TYPE, function(err, docs) {
          if (err) {
            return callback(err);
          }
          var updatedDocs = merge(attachments, backups, docs);
          if (!updatedDocs.length) {
            return callback();
          }
          db.medic.bulk({ docs: updatedDocs }, callback);
        });
      });
    });
  }
};
