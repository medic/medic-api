const db = require('../db');

module.exports = {
  name: 'add-national_admin-role',
  created: new Date(2017, 3, 30),
  run: callback => {
    db.request({
      db: '_users',
      method: 'GET',
      path: '_security'
    }, (err, result) => {
      if (err) {
        return callback(err);
      }

      if (!result.admins.roles.includes('national_admin')) {
        console.log('Adding "national_admin" role to _user admins');
        result.admins.roles.push('national_admin');
      }

      db.request({
        db: '_users',
        method: 'PUT',
        path: '_security',
        body: result
      }, callback);
    });
  }
};
