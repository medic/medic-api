const assert = require('chai').assert;
const utils = require('../utils');

describe('SMS Gateway API', () => {

  beforeEach(() => utils.cleanDb());

  it('should respond to GET requests to show the endpoint supports the gateway API', () =>
    utils.apiGet('/api/sms')
      .then(result => assert.isTrue(result['medic-gateway'])));

  it('should save supplied messages to DB', () => TODO(`
    1. send POST request containing some message JSON
    2. check that the expected messages are now available in the DB
    3. if the endpoint is supposed to be non-blocking, add a waiting loop around
       the relevant assertions.
  `));

  it('should not report bad message content', () => TODO(`
    1. send POST request containing some bad message JSON
    2. check that no error is returned
    3. check that no message is created in the DB
    4. if the endpoint is supposed to be non-blocking, add a waiting loop around
       the relevant assertions.
  `));

  it('should save all good messages in a request containing some good and some bad', () => TODO(`
    1. send POST request containing some message JSON for some good and some bad
       messages
    2. check that no error is returned
    3. check that only good messages were created in DB
    4. if the endpoint is supposed to be non-blocking, add a waiting loop around
       the relevant assertions.
  `));

  it('should update message in DB when status update is received', () => TODO(`
    1. save a message in the DB
    2. send POST request containing a status update for that message
    3. check that message state was updated as expected
  `));

  it('should update message multiple times when multilpe status updates for the same message are received', () => TODO(`
    1. save a message in the DB
    2. send POST request containing multiple status updates for that message
    3. check that message state and state_history were updated as expected
  `));

  it('should still save messages when an unrecognised status update is received', () => TODO(`
    1. send POST request containing a status update for an unknown message, and
       a good message definition
    2. check that no error is returned
    3. check that message was created in DB
    4. if the endpoint is supposed to be non-blocking, add a waiting loop around
       the relevant assertions.
  `));
  
});

function TODO(required) {
  assert.fail(required, 'The following needs to be implemented:');
}
