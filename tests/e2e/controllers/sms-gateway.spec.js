const assert = require('chai').assert;
const utils = require('../utils');

describe('SMS Gateway API', () => {

  beforeEach(() => utils.cleanDb());

  it('should respond to GET requests to show the endpoint supports the gateway API', () =>
    utils.apiGet('/api/sms')
      .then(result => assert.isTrue(result['medic-gateway'])));
  
});
