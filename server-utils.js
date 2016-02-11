var UTILS = {
  notLoggedIn: function(req, res, pathPrefix) {
    // web access - redirect to login page
    res.redirect(301, pathPrefix + 'login?redirect=' + encodeURIComponent(req.url));
  },

  error: function(err, req, res, pathPrefix) {
    if (typeof err === 'string') {
      return UTILS.serverError(err, req, res);
    } else if (err.code === 500) {
      return UTILS.serverError(err.message, req, res);
    } else if (err.code === 401) {
      return UTILS.notLoggedIn(req, res, pathPrefix);
    }
    res.writeHead(err.code || 500, {
      'Content-Type': 'text/plain'
    });
    res.end(err.message);
  },

  serverError: function(err, req, res) {
    console.error('Server error: ');
    console.log('  detail: ' + (err.stack || JSON.stringify(err)));
    res.writeHead(500, {
      'Content-Type': 'text/plain'
    });
    if (err.message) {
      res.end('Server error: ' + err.message);
    } else if (typeof err === 'string') {
      res.end('Server error: ' + err);
    } else {
      res.end('Server error');
    }
  }
};

module.exports = UTILS;
