var _ = require('underscore'),
    bodyParser = require('body-parser'),
    express = require('express'),
    morgan = require('morgan'),
    http = require('http'),
    app = express(),
    db = require('./db'),
    config = require('./config'),
    auth = require('./auth'),
    AuditProxy = require('./audit-proxy'),
    target = 'http://' + db.client.host + ':' + db.client.port,
    proxy = require('http-proxy').createProxyServer({ target: target }),
    activePregnancies = require('./controllers/active-pregnancies'),
    upcomingAppointments = require('./controllers/upcoming-appointments'),
    missedAppointments = require('./controllers/missed-appointments'),
    upcomingDueDates = require('./controllers/upcoming-due-dates'),
    smsGateway = require('./controllers/sms-gateway'),
    highRisk = require('./controllers/high-risk'),
    totalBirths = require('./controllers/total-births'),
    missingDeliveryReports = require('./controllers/missing-delivery-reports'),
    deliveryLocation = require('./controllers/delivery-location'),
    visitsCompleted = require('./controllers/visits-completed'),
    visitsDuring = require('./controllers/visits-during'),
    monthlyRegistrations = require('./controllers/monthly-registrations'),
    monthlyDeliveries = require('./controllers/monthly-deliveries'),
    messages = require('./controllers/messages'),
    records = require('./controllers/records'),
    forms = require('./controllers/forms'),
    createDomain = require('domain').create;

http.globalAgent.maxSockets = 100;

// requires content-type application/json header
var jsonParser = bodyParser.json({limit: '32mb'});

// requires content-type application/x-www-form-urlencoded header
var formParser = bodyParser.urlencoded({limit: '32mb', extended: false});

app.use(morgan('combined', {
  immediate: true
}));

app.use(function(req, res, next) {
  var domain = createDomain();
  domain.on('error', function(err) {
    console.error('UNCAUGHT EXCEPTION!');
    serverError(err, res);
    domain.dispose();
    process.exit(1);
  });
  domain.enter();
  next();
});

var audit = function(req, res) {
  var ap = new AuditProxy();
  ap.on('error', function(e) {
    serverError(e, res);
  });
  ap.on('not-authorized', function() {
    notLoggedIn(res);
  });
  ap.audit(proxy, req, res);
};

var auditPath = db.name + '*';
app.put(auditPath, audit);
app.post(auditPath, audit);
app.delete(auditPath, audit);

var handleApiCall = function(req, res, controller) {
  auth.getUserCtx(req, function(err) {
    if (err) {
      return notLoggedIn(res);
    }
    controller.get({ district: req.query.district }, function(err, obj) {
      if (err) {
        return serverError(err, res);
      }
      res.json(obj);
    });
  });
};

var handleApiPost = function(req, res, controller) {
  auth.getUserCtx(req, function(err) {
    if (err) {
      return notLoggedIn(res);
    }
    controller.post(req, function(err, obj) {
      if (err) {
        return serverError(err, res);
      }
      res.json(obj);
    });
  });
};

app.get('/setup/poll', function(req, res) {
  var p = require('./package.json');
  res.json({
    ready: true,
    handler: 'medic-api', version: p.version,
    detail: 'All required services are running normally'
  });
});

app.all('/setup', function(req, res) {
  res.status(503).send('Setup services are not currently available');
});

app.all('/setup/password', function(req, res) {
  res.status(503).send('Setup services are not currently available');
});

app.all('/setup/finish', function(req, res) {
  res.status(200).send('Setup services are not currently available');
});

app.get('/api/info', function(req, res) {
  var p = require('./package.json');
  res.json({ version: p.version });
});

app.get('/api/auth/:path', function(req, res) {
  auth.checkUrl(req, function(err, output) {
    if (err) {
      return serverError(err, res);
    }
    if (output.status >= 400 && output.status < 500) {
      res.status(403).send('Forbidden');
    } else {
      res.json(output);
    }
  });
});

app.get('/api/active-pregnancies', function(req, res) {
  handleApiCall(req, res, activePregnancies);
});

app.get('/api/upcoming-appointments', function(req, res) {
  handleApiCall(req, res, upcomingAppointments);
});

app.get('/api/missed-appointments', function(req, res) {
  handleApiCall(req, res, missedAppointments);
});

app.get('/api/upcoming-due-dates', function(req, res) {
  handleApiCall(req, res, upcomingDueDates);
});

app.get('/api/sms', function(req, res) {
  auth.check(req, 'can_access_gateway_api', null, function(err, ctx) {
    if (err) {
      return serverError(err, res);
    }
    handleApiCall(req, res, smsGateway);
  });
});
app.post('/api/sms', function(req, res) {
  auth.check(req, 'can_access_gateway_api', null, function(err, ctx) {
    if (err) {
      return serverError(err, res);
    }
    handleApiPost(req, res, smsGateway);
  });
});

app.get('/api/high-risk', function(req, res) {
  handleApiCall(req, res, highRisk);
});

app.get('/api/total-births', function(req, res) {
  handleApiCall(req, res, totalBirths);
});

app.get('/api/missing-delivery-reports', function(req, res) {
  handleApiCall(req, res, missingDeliveryReports);
});

app.get('/api/delivery-location', function(req, res) {
  handleApiCall(req, res, deliveryLocation);
});

app.get('/api/visits-completed', function(req, res) {
  handleApiCall(req, res, visitsCompleted);
});

app.get('/api/visits-during', function(req, res) {
  handleApiCall(req, res, visitsDuring);
});

app.get('/api/monthly-registrations', function(req, res) {
  handleApiCall(req, res, monthlyRegistrations);
});

app.get('/api/monthly-deliveries', function(req, res) {
  handleApiCall(req, res, monthlyDeliveries);
});

app.get('/api/v1/messages', function(req, res) {
  auth.check(req, 'can_view_data_records', null, function(err, ctx) {
    if (err) {
      return serverError(err, res);
    }
    var opts = _.pick(req.query, 'limit', 'start', 'descending', 'state');
    messages.getMessages(opts, function(err, result) {
      if (err) {
        return serverError(err, res);
      }
      res.json(result);
    });
  });
});

app.get('/api/v1/messages/:id', function(req, res) {
  auth.check(req, 'can_view_data_records', null, function(err, ctx) {
    if (err) {
      return serverError(err, res);
    }
    messages.getMessage(req.params.id, function(err, result) {
      if (err) {
        return serverError(err, res);
      }
      res.json(result);
    });
  });
});

app.put('/api/v1/messages/state/:id', jsonParser, function(req, res) {
  auth.check(req, 'can_update_messages', null, function(err, ctx) {
    if (err) {
      return serverError(err, res);
    }
    messages.updateMessage(req.params.id, req.body, function(err, result) {
      if (err) {
        return serverError(err, res);
      }
      res.json(result);
    });
  });
});

app.post('/api/v1/records', [jsonParser, formParser], function(req, res) {
  auth.check(req, 'can_create_records', null, function(err) {
    var create;
    if (err) {
      console.log('checkURL err', err);
      return serverError(err, res);
    }
    if (req.headers['content-type'].toLowerCase() === 'application/x-www-form-urlencoded') {
      create = records.createRecord;
    } else if (req.headers['content-type'].toLowerCase() === 'application/json') {
      create = records.createRecordJSON;
    } else {
      return serverError('Content type not supported.', res);
    }
    create(req.body, function(err, result) {
      if (err) {
        return serverError(err, res);
      }
      res.json(result);
    });
  });
});

app.get('/api/v1/forms', function(req, res) {
  forms.listForms(req.headers, function(err, body, headers) {
      if (err) {
        return serverError(err, res);
      }
      if (headers) {
        res.writeHead(headers.statusCode || 200, headers);
      }
      res.end(body);
  });
});

app.get('/api/v1/forms/:form', function(req, res) {
  var parts = req.params.form.split('.'),
      form = parts.slice(0, -1).join('.'),
      format = parts.slice(-1)[0];
  if (!form || !format) {
    return serverError(new Error('Invalid form parameter.'));
  }
  forms.getForm(form, format, function(err, body, headers) {
    if (err) {
      return serverError(err, res);
    }
    if (headers) {
      res.writeHead(headers.statusCode || 200, headers);
    }
    res.end(body);
  });
});

app.all('*', function(req, res) {
  proxy.web(req, res);
});

proxy.on('error', function(err, req, res) {
  serverError(JSON.stringify(err), res);
});

var serverError = function(err, res) {
  console.error('Server error: ' + (err.stack || JSON.stringify(err)));
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  });
  res.end('Server error');
};

var notLoggedIn = function(res) {
  res.writeHead(401, {
    'Content-Type': 'text/plain',
    'WWW-Authenticate': 'Basic realm="Medic Mobile Web Services"'
  });
  res.end('Not logged in');
};

// Define error-handling middleware last.
// http://expressjs.com/guide/error-handling.html
app.use(function(err, req, res, next) {
  serverError(err.stack, res);
});

config.load(function(err) {
  if (err) {
    console.error('error loading config', err);
    process.exit(1);
  }
  config.listen();
  app.listen(5988, function() {
    console.log('Medic API listening on port 5988');
  });
});
