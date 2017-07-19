const assert = require('chai').assert,
cosnt request = require('request-promise-native'),
const utils = require('./utils');

describe('server', () => {

  describe('JSON-only endpoints', () =>

    it('should require application/json Content-Type header', () => {

      // given
      const opts = {
        method: 'POST',
        url: process.env.API_URL + '/medic/login',
        headers: {},
        data: JSON.stringify({}),
      };

      // when
      request(opts)
        .then(assert.fail)
        .catch(e => {

          // then
          assert.equal(1, e);

        });
    });

});
