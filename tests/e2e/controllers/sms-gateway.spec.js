const assert = require('chai').assert;
const utils = require('../utils');

describe('SMS Gateway API', () => {

  beforeEach(() => utils.cleanDb());

  it('should respond to GET requests to show the URL is correct', () =>
    utils.apiRequest('/api/sms')
      .then(result => assert.equal(result, 'show me the result'));
  
});
