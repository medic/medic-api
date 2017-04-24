const assert = require('chai').assert,
  PouchDB = require('pouchdb'),
  request = require('request-promise-native'),
  Url = require('url'),
  utils = require('../utils');

const adminDb = new PouchDB(process.env.COUCH_URL);

const data_record = {
  _id: 'my_data_record',
  errors: [],
  form: null,
  from: '0211111111',
  reported_date: 1432801258088,
  tasks: [
    {
      messages: [
        {
          from: '0211111111',
          sent_by: 'gareth',
          to: '+64555555555',
          message: 'hello!',
          uuid: '0a2bda49-7b12-67ce-c9140a6e14007c7a'
        }
      ],
      state: 'pending',
      state_history: [
        {
          state: 'pending',
          timestamp: (new Date()).toISOString()
        }
      ]
    }
  ],
  read: ['gareth'],
  kujua_message: true,
  type: 'data_record',
  sent_by: 'gareth'
};

const apiRequest = (endpoint) => {
  var url = Url.parse(process.env.API_URL);
  url.pathname = endpoint;
  url = Url.format(url);
  return request({ uri: url, json: true });
};

describe('messages controller', function() {
  var data_record_rev;
  beforeEach(function(done) {
    utils.beforeEach()
      .then(() => adminDb.put(data_record))
      .then((result) => {
        data_record_rev = result.rev;
        done();
      })
      .catch(done);
  });

  afterEach(function(done) {
    adminDb.remove(data_record._id, data_record_rev)
      .then(() => done())
      .catch(done);
  });

  it('should fetch all messages', function(done) {
    apiRequest('/api/v1/messages')
    .then((result) => {
      // TODO stop emitting everything twice : https://github.com/medic/medic-webapp/issues/3400
      // assert.equal(result.length, 1);
      assert.equal(result[0].id, data_record.tasks[0].messages[0].uuid);
      done();
    })
    .catch((err) => done(err));
  });
});