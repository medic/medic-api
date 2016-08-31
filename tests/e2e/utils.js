var request = require('request');

module.exports = {
  beforeEach: function(done) {
    console.log('e2e.utils.beforeEach()');

    // check that API_URL is set
    if(!process.env.API_URL) {
      throw new Error('Please set API_URL in your env for medic-api e2e tests.');
    }

    // check that COUCH_URL is set
    if(!process.env.COUCH_URL) {
      throw new Error('Please set COUCH_URL in your env for medic-api e2e tests.');
    }

    // check that COUCH_URL doesn't look like the prod db (could be messy)
    if(process.env.COUCH_URL.endsWith('/medic') /* TODO && this is not travis */) {
      throw new Error('It looks like you\'re using your standard COUCH_URL for medic-api e2e tests.  This would be very destructive!');
    }

    // delete all docs from DB
    request({
      method: 'DELETE',
      uri: process.env.COUCH_URL,
    }, function(err) {
      if(err) {
        return done(err);
      }
      request({
        method: 'PUT',
        uri: process.env.COUCH_URL,
      }, function(err) {
        if(err) {
          return done(err);
        }
        return done();
      });
    });
  },
};
