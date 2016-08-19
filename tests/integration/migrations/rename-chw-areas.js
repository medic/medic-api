var utils = require('./utils');

var ANY_STRING = new RegExp('^.*$');
var ANY_NUMBER = new RegExp('^[0-9]+(\\.[0-9]*)?$');

describe('extract-person-contacts migration', function() {
  afterEach(function() {
    return utils.tearDown();
  });

  it('should not change the name of a CHW area with a different name to its parent', function() {
    // given
    return utils.initDb([
      {
        _id: 'abc',
        type: 'clinic',
        name: 'chw area',
        parent: {
         type: 'health_center',
         name: 'health centre',
        },
      },
    ])
    .then(function() {

      // when
      return utils.runMigration('rename-chw-areas');

    })
    .then(function() {

      // expect
      return utils.assertDb([
        {
          _id: 'abc',
          type: 'clinic',
          name: 'chw area',
          parent: {
           type: 'health_center',
           name: 'health centre',
          },
        },
      ]);

    });
  });

  it('should change the name of a CHW area with the same name as its parent', function() {
    // given
    return utils.initDb([
      {
        _id: 'abc',
        type: 'clinic',
        name: 'health centre',
        parent: {
         type: 'health_center',
         name: 'health centre',
        },
        contact: { name:'a chw', },
      },
    ])
    .then(function() {

      // when
      return utils.runMigration('rename-chw-areas');

    })
    .then(function() {

      // expect
      return utils.assertDb([
        {
          _id: 'abc',
          type: 'clinic',
          name: 'a chw Area',
          parent: {
           type: 'health_center',
           name: 'health centre',
          },
          contact: { name:'a chw', },
        },
      ]);

    });
  });

});
