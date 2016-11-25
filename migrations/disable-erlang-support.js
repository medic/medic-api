var db = require('../db');

module.exports = {
  name: 'disable-erlang-support',
  created: new Date(2016, 10, 5),
  run: function(callback) {
    db.request({
      db: '_node',
      method: 'DELETE',
      path: 'couchdb@localhost/_config/native_query_servers/erlang',
    }, function(err) {
      if (err && err.error === 'not_found') {
        console.log('Erlang support is already disabled.');
        callback();
        return;
      }
      callback(err);
    });
  }
};
