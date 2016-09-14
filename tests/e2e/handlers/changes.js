var _ = require('underscore'),
    assert = require('chai').assert,
    PouchDB = require('pouchdb'),
    request = require('request'),
    Url = require('url'),
    utils = require('../utils');

var DB_NAME = require('../../../db').settings.db,
    adminDb = new PouchDB(process.env.COUCH_URL);

var adminUrl = process.env.API_URL;
function userUrl(name) {
  var url = Url.parse(adminUrl);
  url.auth = name + ':secret';
  console.log('userUrl', Url.format(url));
  return url;
}

function assertChangeIds(changes) {
  changes = JSON.parse(changes).results;

  // filter out deleted entries - we never delete in our production code, but
  // some docs are deleted in the test setup/teardown
  changes = _.reject(changes, function(change) {
    return change.deleted;
  });

  var expectedIds = Array.prototype.slice.call(arguments, 1);
  assert.deepEqual(_.pluck(changes, 'id').sort(), expectedIds.sort());
}

function requestChanges(username, ids) {
  return new Promise(function(resolve, reject) {
    var qs = {};
    if(ids) {
      qs = {
        filter: '_doc_ids',
        doc_ids: JSON.stringify(ids),
      };
    }

    var url = userUrl(username);
    url.pathname = '/' + DB_NAME + '/_changes';
    url = Url.format(url);
console.log('Requesting changes feed from', url);
    request({ uri:url, qs:qs, },
    function(err, res, body) {
      if(err) {
        return reject(err);
      }
      if(res.statusCode !== 200) {
        return reject(body);
      }
      return resolve(body);
    });
  });
}

var AppSettings = {

  get: function() {
    // TODO get the current app_settings from the db
    return adminDb.get('_design/medic')
      .then(function(ddoc) {
        AppSettings.original = ddoc.app_settings;
        return JSON.parse(JSON.stringify(ddoc.app_settings));
      });
  },

  set: function(newAppSettings) {
    AppSettings.modified = true;

    return adminDb.get('_design/medic')
      .then(function(ddoc) {
        ddoc.app_settings = newAppSettings;
        return adminDb.put(ddoc);
      });
  },

  restore: function() {
    if(AppSettings.modified) {
      return adminDb.get('_design/medic')
        .then(function(ddoc) {
          ddoc.app_settings = AppSettings.original;
          return adminDb.put(ddoc);
        });
    } else {
      return Promise.resolve();
    }
  }

};

describe('changes handler', function() {

  beforeEach(function(done) {
    AppSettings.modified = false;
    delete AppSettings.original;

    utils.beforeEach()
      .then(function() {
        done();
      })
      .catch(done);
  });

  afterEach(function(done) {
    AppSettings.restore()
      .then(function() {
        done();
      })
      .catch(done);
  });

  it('should allow access to replicate medic ddoc', function() {
    // given user 'bob' is set up in fixtures
    // and ddoc exists

    // when
    // request is made for changes to _design/medic
    return requestChanges('bob', ['_design/medic'])
      .then(function(changes) {

        // then
        return assertChangeIds(changes, '_design/medic');
      });
  });

  it.only('should filter the changes to relevant ones', function() {
    // given
    // a normal user (bob, from fixtures)

    // and an irrelevant doc is inserted
    return adminDb.post({ type:'clinic', parent:{ _id:'nowhere' } })
      .then(function() {

        // and a relevant doc is inserted
        return adminDb.put({ type:'clinic', _id:'very-relevant', parent:{ _id:'fixture:bobville' } });

      })
      .then(function() {

        // and another irrelevant doc is inserted
        return adminDb.post({ type:'clinic', parent:{ _id:'irrelevant-place' } });

      })
      .then(function() {

        // when
        // full changes feed is requested
        return requestChanges('bob');

      })
      .then(function(changes) {

        // then
        // only change listed is for the relevant doc
        return assertChangeIds(changes,
            'appcache',
            'messages-sw',
            'messages-ne',
            'messages-hi',
            'messages-fr',
            'messages-es',
            'messages-en',
            'resources',
            '_design/medic-client',
            'org.couchdb.user:bob',
            'fixture:bobville',
            'very-relevant');
      });
  });

  describe('reports with no associated contact', function() {

    describe('for a user with can_view_unallocated_data_records permission', function() {

      it('should be visible if district_admins_access_unallocated_messages is enabled', function() {
        // given
        // a user with can_view_unallocated_data_records: bob (created in fixtures)

        // and district_admins_access_unallocated_messages is enabled
        return AppSettings.get()
          .then(function(appSettings) {

            appSettings.district_admins_access_unallocated_messages = true;
            return AppSettings.set(appSettings);

          })
          .then(function() {

            // and an unassigned data_record
            return adminDb.post({ _id:'unallocated_report', type:'data_record' });

          })
          .then(function() {

            // when
            // the changes feed is requested
            return requestChanges('bob');

          })
          .then(function(changes) {

            // then
            // it should contain the unassigned data_record
            return assertChangeIds(changes,
              'appcache',
              'messages-sw',
              'messages-ne',
              'messages-hi',
              'messages-fr',
              'messages-es',
              'messages-en',
              'resources',
              '_design/medic-client',
              'org.couchdb.user:bob',
              'fixture:bobville',
              'unallocated_report');

          });

        });

      });

      it('should not be visible if district_admins_access_unallocated_messages is disabled', function() {
        // given
        // a user with can_view_unallocated_data_records: bob (created in fixtures)

        // and district_admins_access_unallocated_messages is not enabled

        // and an unassigned data_record
        return adminDb.post({ _id:'unallocated_report', type:'data_record' })
          .then(function() {

            // when
            // the changes feed is requested
            return requestChanges('bob');

          })
          .then(function(changes) {

            // then
            // it should contain the unassigned data_record
            return assertChangeIds(changes,
              'appcache',
              'messages-sw',
              'messages-ne',
              'messages-hi',
              'messages-fr',
              'messages-es',
              'messages-en',
              'resources',
              '_design/medic-client',
              'org.couchdb.user:bob',
              'fixture:bobville');

          });
      });

    it('should NOT be supplied for a user without can_view_unallocated_data_records permission', function() {
      // given
      // a user without can_view_unallocated_data_records: clare (created in fixtures)

      // and an unassigned data_record
      return adminDb.post({ _id:'unallocated_report', type:'data_record' })
        .then(function() {

          // when
          // the changes feed is requested
          return requestChanges('clare');

        })
        .then(function(changes) {

          // then
          // it should contain the unassigned data_record
          return assertChangeIds(changes,
            'appcache',
            'messages-sw',
            'messages-ne',
            'messages-hi',
            'messages-fr',
            'messages-es',
            'messages-en',
            'resources',
            '_design/medic-client',
            'org.couchdb.user:clare',
            'fixture:clareville');

        });
    });

  });

  describe('replication depth', function() {

    describe('when configured', function() {

      beforeEach(function() {
        // TODO configure replication depth
      });

      it.skip('should be respected when the user has permission', function() {
        // given
        // TODO a user with the correct permissions

        // when
        // TODO

        // then
        // TODO
      });

      it.skip('should not be respected when the user does not have permission', function() {
        // given
        // TODO

        // when
        // TODO

        // then
        // TODO
      });

    });

    describe('when not configured', function() {

      it.skip('should not be respected when the user has permission', function() {
        // given
        // TODO a user with the correct permissions

        // when
        // TODO

        // then
        // TODO
      });

      it.skip('should not be respected when the user does not have permission', function() {
        // given
        // TODO

        // when
        // TODO

        // then
        // TODO
      });

    });

  });

  it.skip('should not return reports about you by someone above you in the hierarchy', function() {
    // given
    // TODO a chw user exists
    // TODO and a boss user exists
    // TODO and the CHW submits a report
    // TODO and the boss submits a report

    // when
    // TODO the changes feed is requested

    // then
    // TODO the changes feed only includes the report from the CHW
  });

  it.skip('should not return reports about your place by someone above you in the hierarchy', function() {
    // given
    // TODO

    // when
    // TODO

    // then
    // TODO
  });

  it.skip('should filter out undeleted docs they are not allowed to see', function() {
    // given
    // TODO

    // when
    // TODO

    // then
    // TODO
  });

  it.skip('should update the feed when the doc is updated', function() {
    // given
    // TODO

    // when
    // TODO

    // then
    // TODO
  });

  it.skip('should replicate new docs to relevant feeds', function() {
    // given
    // TODO

    // when
    // TODO

    // then
    // TODO
  });

});
