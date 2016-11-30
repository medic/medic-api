var db = require('../db');

module.exports = {
  name: 'enable-erlang-support',
  created: new Date(2016, 2, 16),
  run: function(callback) {
    db.request({
      db: '_node',
      method: 'PUT',
      path: process.env.COUCH_NODE_NAME + '/_config/native_query_servers/erlang',
      body: '{couch_native_process, start_link, []}'
    }, function(err) {
      callback(err);
    });
  }
};
