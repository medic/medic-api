var db = require('../db');

module.exports = {
  name: 'enable-erlang-support',
  created: new Date(2016, 2, 16),
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
        method: 'PUT',
        path: v2 ?
          process.env.COUCH_NODE_NAME + '/_config/native_query_servers/erlang' :
          'native_query_servers/erlang',
        body: '{couch_native_process, start_link, []}'
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
