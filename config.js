var _ = require('underscore'),
    follow = require('follow'),
    db = require('./db'),
    settings,
    translations = {};

var defaults = {
  anc_forms: {
    registration: 'R',
    registrationLmp: 'P',
    visit: 'V',
    delivery: 'D',
    flag: 'F'
  }
};

var getMessage = function(value, locale) {

  var _findTranslation = function(value, locale) {
    if (value.translations) {
      var translation = _.findWhere(
        value.translations, { locale: locale }
      );
      return translation && translation.content;
    } else {
      // fallback to old translation definition to support
      // backwards compatibility with existing forms
      return value[locale];
    }
  };

  if (!_.isObject(value)) {
    return value;
  }

  var test = false;
  if (locale === 'test') {
    test = true;
    locale = 'en';
  }

  var result =

    // 1) Look for the requested locale
    _findTranslation(value, locale) ||

    // 2) Look for the default
    value.default ||

    // 3) Look for the English value
    _findTranslation(value, 'en') ||

    // 4) Look for the first translation
    (value.translations && value.translations[0] && value.translations[0].content) ||

    // 5) Look for the first value
    value[_.first(_.keys(value))];

  if (test) {
    result = '-' + result + '-';
  }

  return result;
};

var loadSettings = function(callback) {
  db.medic.get('_design/medic', function(err, ddoc) {
    if (err) {
      return callback(err);
    }
    settings = ddoc.app_settings;
    _.defaults(settings, defaults);
    callback();
  });
};

var loadTranslations = function() {
  var options = { key: [ 'translations' ], include_docs: true };
  db.medic.view('medic', 'doc_by_type', options, function(err, result) {
    if (err) {
      console.error('Error loading translations - starting up anyway', err);
      return;
    }
    result.rows.forEach(function(row) {
      translations[row.doc.code] = row.doc.values;
    });
  });
};

module.exports = {
  get: function(key) {
    return settings[key];
  },
  translate: function(key, locale, ctx) {
    if (_.isObject(locale)) {
      ctx = locale;
      locale = null;
    }
    locale = locale || (settings && settings.locale) || 'en';
    if (_.isObject(key)) {
      return getMessage(key, locale) || key;
    }
    var value = (translations[locale] && translations[locale][key]) ||
                (translations.en && translations.en[key]) ||
                key;
    // underscore templates will return ReferenceError if all variables in
    // template are not defined.
    try {
      return _.template(value)(ctx || {});
    } catch(e) {
      return value;
    }
  },
  load: function(callback) {
    loadSettings(callback);
    loadTranslations();
  },
  listen: function() {
    var feed = new follow.Feed({ db: process.env.COUCH_URL, since: 'now' });
    feed.on('change', function(change) {
      if (change.id === '_design/medic') {
        console.log('Detected settings change - reloading');
        loadSettings(function(err) {
          if (err) {
            console.error('Failed to reload settings', err);
            process.exit(1);
          }
        });
      } else if (change.id.indexOf('messages-') === 0) {
        console.log('Detected translations change - reloading');
        loadTranslations();
      }
    });
    // TODO also update ddocs?
    feed.follow();
  }
};
