var _ = require('underscore'),
    PouchDB = require('pouchdb'),
    request = require('request'),
    url = require('url'),

    db,
    dbName,
    
    PARENT_PLACE = {
      _id: 'parent-place',
      type: 'district_hospital',
      name: 'Big Parent Hospital',
    };

//> INITIALISATION
{
  // check that API_URL is set
  if(!process.env.API_URL) {
    throw new Error('Please set API_URL in your env for medic-api e2e tests.');
  }

  // check that COUCH_URL is set
  if(!process.env.COUCH_URL) {
    throw new Error('Please set COUCH_URL in your env for medic-api e2e tests.');
  }

  // check that COUCH_URL doesn't look like the prod db (could be messy)
  if(process.env.COUCH_URL.endsWith('/medic')) {
    throw new Error('It looks like you\'re using your standard COUCH_URL for medic-api e2e tests.  You must use a temporary database!');
  }

  var couchUrl = url.parse(process.env.COUCH_URL);

  if(couchUrl.pathname.length < 2) {
    throw new Error('No database name supplied in COUCH_URL env var.');
  }
  dbName = couchUrl.pathname.substring(1);
  var adminAuth = couchUrl.auth.split(':', 2);
  if(adminAuth.length !== 2) {
    throw new Error('Admin username and/or password not found in COUCH_URL env var.');
  }

  var adminUser = adminAuth[0];

  db = new PouchDB(process.env.COUCH_URL);
}
//> END INITIALISATION

function assertAdmin() {
  var checkUrl = url.parse(process.env.COUCH_URL);
  checkUrl.path = '/_config/admins';
  return new Promise(function(resolve, reject) {
    request(url.format(checkUrl), function(err, res) {
      if(err || res.statusCode !== 200) {
        return reject(err || res.statusCode);
      }
      return resolve();
    });
  });
}

function assertUser(username, roles, expectedPlace) {
  console.log('assertUser()', 'ENTRY');

  function createUserAndPlace() {
    console.log('assertUser()', 'createUserAndPlace()', 'ENTRY');
    return new Promise(function(resolve, reject) {
      request({
        method: 'POST',
        uri: process.env.API_URL + '/api/v1/users',
        json: true,
        body: {
          username: username,
          password: 'secret',
          place: expectedPlace,
          contact: {
            name: username,
          },
          roles: roles,
        },
      },
      function(err, res, body) {
        console.log('Result of creating user:', res.statusCode, err, body);
        if(err || res.statusCode !== 200) {
          console.log('assertUser()', 'createUserAndPlace()', 'err', err || res.statusCode);
          return reject(err || new Error([res.statusCode, JSON.stringify(body)].join('::')));
        }
          console.log('assertUser()', 'createUserAndPlace()', 'OK!');
        return resolve(res);
      });
    });
  }

  function assertPlaceExists(userDoc) {
    console.log('assertUser()', 'assertPlaceExists()', 'ENTRY');
    return db.get(userDoc.facility_id)
      .then(function(actualPlace) {
        console.log('assertUser()', 'fetched place:', JSON.stringify(actualPlace));
        if(actualPlace.type !== expectedPlace.type || actualPlace.name !== expectedPlace.name) {
          throw new Error('Expected user ' + username + '\'s expectedPlace to be ' + expectedPlace.type + ':' + expectedPlace.name +
              ', but was actually ' + actualPlace.type + ':' + actualPlace.name);
        }
      });
  }

  function updateUserPassword(userDoc) {
    console.log('updateUserPassword()', 'ENTRY');
    console.log('updateUserPassword()', 'userDoc:', JSON.stringify(userDoc));
    var usersUrl = url.parse(process.env.COUCH_URL);
    usersUrl.path = '/_users';
    var db = new PouchDB(url.format(usersUrl));
    return db
      .get(userDoc._id)
      .then(function(userDoc) {
        userDoc.password = 'secret';
        return db.put(userDoc);
      })
      .then(function() {
        return db.get(userDoc._id);
      });
  }

  console.log('assertUser()', 'db:', db.name);
  return db.get('org.couchdb.user:' + username)
    .then(updateUserPassword)
    .then(assertPlaceExists)
    .catch(function(err) {
      console.log('assertUser()', 'caught error', err);
      if(err.status === 404) {
        return createUserAndPlace()
          .then(assertPlaceExists);
      }
      throw new Error('caught in assertUser: ' + JSON.stringify(err));
    });
}

module.exports = {
  adminUser: adminUser,

  init: function(done) {
    // create users/assert that existing users have required permissions
    assertAdmin()
      .then(function() {
        console.log('e2e.utils.init()', 'checking for parent place:', PARENT_PLACE._id);
        return db.get(PARENT_PLACE._id)
          .then(function(parentPlace) {
            console.log('e2e.utils.init()', 'fetched place:', JSON.stringify(parentPlace));
          })
          .catch(function(err) {
            console.log('e2e.utils.init()', 'error fetching parent place:', JSON.stringify(err));
            return db.put(PARENT_PLACE);
          });
      })
      .then(function() {
        return assertUser('bob', ['district-manager', 'kujua_user', 'data_entry', 'district_admin'],
            { type:'health_center', name:'Bobville', parent:PARENT_PLACE });
      })
      .then(done)
      .catch(done);
  },

  beforeEach: function() {
    console.log('e2e.utils.beforeEach()');

    // delete all docs from DB except for standard medic docs
    return db.allDocs()
      .then(function(res) {
        console.log('e2e.utils.beforeEach() :: fetched all docs');
        return _.chain(res.rows)
            .reject(function(row) {
              var id = row.id;
              return id.indexOf('_design/') === 0 ||
                  id.indexOf('org.couchdb.user:') === 0 ||
                  ['appcache', 'messages', 'resources'].indexOf(id) !== -1 ||
                  id.indexOf('messages-') === 0;
            })
            .map(function(row) {
              return {
                _id: row.id,
                _rev: row.value.rev,
              };
            })
            .value();
      })
      .then(function(docs) {
        //return Promise.all(docs.map(db.remove));
        return Promise.all(docs.map(function(doc) {
          return db.remove(doc);
        }));
      });
  },
};
