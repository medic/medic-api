var utils = require('./utils');

var ANY_STRING = new RegExp('^.*$');
var ANY_NUMBER = new RegExp('^[0-9]*(\\.[0-9]*)?$');

describe('extract-person-contacts migration', function() {
  afterEach(function() {
    return utils.tearDown();
  });

  it('should create a new Person from facility.contact', function() {
    // given
    return utils.initDb([
      {
        _id: 'abc',
        type: 'district_hospital',
        name: 'myfacility',
        contact: { name:'Alice', phone:'+123' },
      },
    ])
    .then(function() {

      console.log('TRACE', 'initDb completed');

      // when
      return utils.runMigration('extract-person-contacts');

    })
    .then(function() {

      console.log('TRACE', 'migration ran successfully');

      // expect
      return utils.assertDb([
        {
          _id: 'abc',
          type: 'district_hospital',
          name: 'myfacility',
          contact: {
            _id: ANY_STRING,
            _rev: ANY_STRING,
            type: 'person',
            name: 'Alice',
            phone: '+123',
            reported_date: ANY_NUMBER,
            parent: {
              _id: 'abc',
              _rev: ANY_STRING,
              type: 'district_hospital',
              name: 'myfacility',
            },
          },
        },
        {
          name: 'Alice',
          type: 'person',
          phone: '+123',
          reported_date: ANY_NUMBER,
          parent: {
            _id: 'abc',
            _rev: ANY_STRING,
            type: 'district_hospital',
            name: 'myfacility',
          },
        },
      ]);

    });
  });

  it('should update nested parent.contact field if the contact has been updated in the parent', function() {
    // given
    return utils.initDb([
      {
        _id: 'hc-1',
        type: 'health_center',
        name: 'myfacility',
        parent: {
          _id: 'dh-1',
          type: 'district_hospital',
          name: 'myparent',
          contact: { name: 'Alice', phone: 123 }, // old-style contact
        }
      },
      // Parent of the facility :
      {
        _id: 'dh-1',
        type: 'district_hospital',
        name: 'myparent',
        contact: { // new-style contact
          _id: 'contact-A',
          type: 'person',
          name: 'Alice',
          phone: 123,
          created_date: 12345678,
          parent: {},
        }
      },
    ])
    .then(function() {

      console.log('TRACE', 'initDb completed');

      // when
      return utils.runMigration('extract-person-contacts');

    })
    .then(function() {

      console.log('TRACE', 'migration ran successfully');

      // expect
      return utils.assertDb([
        {
          _id: 'hc-1',
          type: 'health_center',
          name: 'myfacility',
          parent: {
            _id: 'dh-1',
            _rev: ANY_STRING,
            type: 'district_hospital',
            name: 'myparent',
            contact: { // new-style contact
              _id: 'contact-A',
              type: 'person',
              name: 'Alice',
              phone: 123,
              created_date: 12345678,
              parent: {},
            }
           }
        },
        // Parent of the facility : unchanged.
        {
          _id: 'dh-1',
          type: 'district_hospital',
          name: 'myparent',
          contact: { // new-style contact
            _id: 'contact-A',
            type: 'person',
            name: 'Alice',
            phone: 123,
            created_date: 12345678,
            parent: {},
          }
        },
      ]);

    });
  });

  it('should remove parent property if that place does not exist', function() {
    // given
    return utils.initDb([
      {
        _id: 'hc-1',
        type: 'health_center',
        name: 'myfacility',
        parent: {
          _id: 'dh-1',
          type: 'district_hospital',
          name: 'myparent',
          contact: { name: 'Alice', phone: 123 }, // old-style contact
        }
      },
    ])
    .then(function() {

      console.log('TRACE', 'initDb completed');

      // when
      return utils.runMigration('extract-person-contacts');

    })
    .then(function() {

      console.log('TRACE', 'migration ran successfully');

      // expect
      return utils.assertDb([
        {
          _id: 'hc-1',
          type: 'health_center',
          name: 'myfacility',
          parent: null,
        },
      ]);

    });
  });

  it.skip('should update parent property if the referenced place doesn\'t exist, but another does with the same name', function() {
  });

  it.skip('should have a strategy for handling username collisions', function() {
  });
});
