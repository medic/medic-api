var _ = require('underscore'),
    assert = require('chai').assert,
    request = require('request'),
    utils = require('../utils');

function assertChangeIds(changes) {
  changes = JSON.parse(changes).results;
  assert.equal(changes.length, 1);

  var expectedIds = Array.prototype.slice.call(arguments, 1);
  assert.deepEqual(_.pluck(changes, 'id'), expectedIds);
}

function examplePlace(name, type) {
  return {
    name: name,
    type: type || 'health_center',
  };
}

function createUser(name, place) {
  return new Promise(function(resolve, reject) {
    request({
      method: 'POST',
      uri: process.env.API_URL + '/api/v1/users',
      postData: {
        username: name,
        password: 'secret',
        place: place,
        contact: {
          name: name,
        },
      },
    },
    function(err, res) {
      if(err) {
        return reject(err);
      }
      return resolve(res);
    });
  });
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

    request({
      uri: process.env.API_URL + '/medic-api-e2e/_changes',
      qs: qs,
    },
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

function uploadDoc(doc) {
  console.log('TODO: upload to db', doc);
  return new Promise(function(resolve, reject) {
    request({
      method: 'PUT',
      uri: process.env.API_URL + '/medic-api-e2e/' + doc._id,
      json: true,
      body: doc,
    },
    function(err, res) {
      if(err || res.statusCode !== 201) {
        return reject(err || res);
      }
      return resolve();
    });
  });
}

describe('changes handler', function() {

  beforeEach(utils.beforeEach);

  it('should allow access to replicate medic ddoc', function() {
    // given
    return createUser('alice', examplePlace('Aliceville'))

      .then(function() {

        // and TODO ddoc exists
        return uploadDoc({ _id:'_design/medic' })
          .then(function() {

            // when
            // request is made for changes to _design/medic
            return requestChanges('alice', ['_design/medic'])
              .then(function(changes) {

                // then
                assertChangeIds(changes, '_design/medic');
              });
          });
      });
  });

  it.skip('should filter the changes to relevant ones', function() {
    // given
    // TODO a normal user
    // TODO an irrelevant doc is inserted
    // TODO a relevant doc is inserted
    // TODO an irrelevant doc is inserted

    // when
    // TODO full changes feed is requested

    // then
    // TODO only change listed is for the relevant doc
  });

  describe('unallocated access', function() {

    describe('when configured', function() {

      beforeEach(function() {
        // TODO configure unallocated access
      });

      it.skip('should be allowed for users with the correct permission', function() {
        // given
        // TODO a user with the correct permissions
        // TODO an unallocated doc

        // when
        // TODO changes feed is requested

        // then
        // TODO it should include the unallocated doc
      });

      it.skip('should not be allowed for users without the correct permission', function() {
        // given
        // TODO a user without the correct permission
        // TODO an unallocated doc

        // when
        // TODO changes feed is requested

        // then
        // TODO it should not include the unallocated doc
      });

    });

    describe('when not configured', function() {

      it.skip('should not be allowed for users with the correct permission', function() {
        // given
        // TODO a user with the correct permissions
        // TODO an unallocated doc

        // when
        // TODO changes feed is requested

        // then
        // TODO it should not include the unallocated doc
      });

      it.skip('should not be allowed for users without the correct permission', function() {
        // given
        // TODO a user without the correct permission
        // TODO an unallocated doc

        // when
        // TODO changes feed is requested

        // then
        // TODO it should not include the unallocated doc
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
    // TODO

    // when
    // TODO

    // then
    // TODO
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

  it.skip('should clean up when the client connection is closed - #2476', function() {
    // given
    // TODO

    // when
    // TODO

    // then
    // TODO
  });

});
