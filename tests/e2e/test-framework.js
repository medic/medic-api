var assert = require('chai').assert,
    request = require('request'),
    utils = require('./utils');

describe('medic-api e2e tests framework', function() {
  beforeEach(utils.beforeEach);

  it('should be able to access medic-api over HTTP', function(done) {
    // when
    request.get({
      uri: process.env.API_URL,
      followRedirect: false,
    },
    function(err, res) {
      // expect
      assert.equal(res.statusCode, 302);
      assert.deepEqual(res.headers.location, '/medic/_design/medic/_rewrite/');

      done();
    });
  });
});
