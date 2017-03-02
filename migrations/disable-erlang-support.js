var db = require('../db');

module.exports = {
  name: 'disable-erlang-support',
  created: new Date(2016, 10, 5),
  run: function(callback) {
    db.getCouchDbVersion(function(err, version) {
      if (err) {
        return callback(err);
      }

      var v2 = version.major === '2';

      db.request({
        db: v2 ?
          '_node' :
          '_config',
        method: 'DELETE',
        path: v2 ?
          process.env.COUCH_NODE_NAME + '/_config/native_query_servers/erlang' :
          'native_query_servers/erlang',
      }, function(err) {
        if (err && err.error === 'not_found') {
          console.log('Erlang support is already disabled.');
          callback();
          return;
        }
        callback(err);
      });

    });
  }
};
