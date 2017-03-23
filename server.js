const _ = require('underscore'),
      async = require('async'),
      bodyParser = require('body-parser'),
      express = require('express'),
      moment = require('moment'),
      morgan = require('morgan'),
      path = require('path');

const AuditProxy = require('./audit-proxy'),
      auth = require('./auth'),
      config = require('./config'),
      db = require('./db'),
      ddocExtraction = require('./ddoc-extraction'),
      migrations = require('./migrations'),
      scheduler = require('./scheduler'),
      serverUtils = require('./server-utils'),
      translations = require('./translations');

const activePregnancies = require('./controllers/active-pregnancies'),
      deliveryLocation = require('./controllers/delivery-location'),
      exportData = require('./controllers/export-data'),
      forms = require('./controllers/forms'),
      fti = require('./controllers/fti'),
      highRisk = require('./controllers/high-risk'),
      messages = require('./controllers/messages'),
      missedAppointments = require('./controllers/missed-appointments'),
      missingDeliveryReports = require('./controllers/missing-delivery-reports'),
      monthlyDeliveries = require('./controllers/monthly-deliveries'),
      monthlyRegistrations = require('./controllers/monthly-registrations'),
      people = require('./controllers/people'),
      places = require('./controllers/places'),
      records = require('./controllers/records'),
      smsGateway = require('./controllers/sms-gateway'),
      totalBirths = require('./controllers/total-births'),
      upcomingAppointments = require('./controllers/upcoming-appointments'),
      upcomingDueDates = require('./controllers/upcoming-due-dates'),
      users = require('./controllers/users'),
      visitsCompleted = require('./controllers/visits-completed'),
      visitsDuring = require('./controllers/visits-during'),
      login = require('./controllers/login');

const apiPort = process.env.API_PORT || 5988,
      app = express(),
      appcacheManifest = /\/manifest\.appcache$/,
      pathPrefix = `/${db.settings.db}/`,
      appPrefix = `${pathPrefix}_design/${db.settings.ddoc}/_rewrite/`,
      createDomain = require('domain').create,
      favicon = /\/icon_\d\d.ico$/,
      target = `http://${db.settings.host}:${db.settings.port}`,
      proxy = require('http-proxy').createProxyServer({ target: target }),
      proxyForAuditing = require('http-proxy').createProxyServer({ target: target }),
      staticResources = /\/(templates|static)\//;

// requires content-type application/json header
const jsonParser = bodyParser.json({limit: '32mb'});

// requires content-type application/x-www-form-urlencoded header
const formParser = bodyParser.urlencoded({limit: '32mb', extended: false});

app.set('strict routing', true);

app.use(morgan('combined', {
  immediate: true
}));

app.use((req, res, next) => {
  const domain = createDomain();
  domain.on('error', err => {
    console.error('UNCAUGHT EXCEPTION!');
    serverUtils.serverError(err, req, res);
    domain.dispose();
    process.exit(1);
  });
  domain.enter();
  next();
});

app.get('/', (req, res) => {
  if (req.headers.accept === 'application/json') {
    // couchdb request - let it go
    proxy.web(req, res);
  } else {
    // redirect to the app path - redirect to _rewrite
    res.redirect(appPrefix);
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get(`${pathPrefix}login`, login.get);
app.post(`${pathPrefix}login`, jsonParser, login.post);

const UNAUDITED_ENDPOINTS = [
  // This takes arbitrary JSON, not whole documents with `_id`s, so it's not
  // auditable in our current framework
  `_design/${db.settings.ddoc}/_rewrite/update_settings/*`,
  // Replication machinery we don't care to audit
  '_local/*',
  '_revs_diff',
  '_missing_revs',
  // These may use POST for specifiying ids
  // NB: _changes is dealt with elsewhere: see `changesHandler`
  '_all_docs',
  '_bulk_get',
  '_design/*/_list/*',
  '_design/*/_show/*',
  '_design/*/_view/*',
  // Interacting with mongo filters uses POST
  '_find',
  '_explain'
];

// NB: as this evaluates first, it will skip any hooks defined in the rest of
// the file below, and these calls will all be proxies. If you want to avoid
// auditing and do other things as well, look to how the _changes feed is
// handled.
UNAUDITED_ENDPOINTS.forEach(url => app.all(pathPrefix + url, proxy.web));

app.get('/setup/poll', (req, res) => {
  const p = require('./package.json');
  res.json({
    ready: true,
    handler: 'medic-api', version: p.version,
    detail: 'All required services are running normally'
  });
});

app.all('/setup', (req, res) =>
  res.status(503).send('Setup services are not currently available'));

app.all('/setup/password', (req, res) =>
  res.status(503).send('Setup services are not currently available'));

app.all('/setup/finish', (req, res) =>
  res.status(200).send('Setup services are not currently available'));

app.get('/api/info', (req, res) => {
  const p = require('./package.json');
  res.json({ version: p.version });
});

app.get('/api/auth/:path', (req, res) => {
  auth.checkUrl(req, (err, output) => {
    if (err) {
      return serverUtils.serverError(err, req, res);
    }
    if (output.status >= 400 && output.status < 500) {
      res.status(403).send('Forbidden');
    } else {
      res.json(output);
    }
  });
});

const handleAnalyticsCall = (req, res, controller) => {
  auth.check(req, 'can_view_analytics', req.query.district, (err, ctx) => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    controller.get({ district: ctx.district }, (err, obj) => {
      if (err) {
        return serverUtils.serverError(err, req, res);
      }
      res.json(obj);
    });
  });
};

const emptyJSONBodyError = (req, res) => {
  return serverUtils.error({
    code: 400,
    message: 'Request body is empty or Content-Type header was not set to application/json.'
  }, req, res);
};

app.get('/api/active-pregnancies', (req, res) =>
  handleAnalyticsCall(req, res, activePregnancies));

app.get('/api/upcoming-appointments', (req, res) =>
  handleAnalyticsCall(req, res, upcomingAppointments));

app.get('/api/missed-appointments', (req, res) =>
  handleAnalyticsCall(req, res, missedAppointments));

app.get('/api/upcoming-due-dates', (req, res) =>
  handleAnalyticsCall(req, res, upcomingDueDates));

app.get('/api/sms', (req, res) => {
  auth.check(req, 'can_access_gateway_api', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    smsGateway.get((err, obj) => {
      if (err) {
        return serverUtils.error(err, res);
      }
      res.json(obj);
    });
  });
});

app.post('/api/sms', jsonParser, (req, res) => {
  auth.check(req, 'can_access_gateway_api', null, (err) => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    smsGateway.post(req, (err, obj) => {
      if (err) {
        return serverUtils.error(err, res);
      }
      res.json(obj);
    });
  });
});

app.get('/api/high-risk', (req, res) =>
  handleAnalyticsCall(req, res, highRisk));

app.get('/api/total-births', (req, res) =>
  handleAnalyticsCall(req, res, totalBirths));

app.get('/api/missing-delivery-reports', (req, res) =>
  handleAnalyticsCall(req, res, missingDeliveryReports));

app.get('/api/delivery-location', (req, res) =>
  handleAnalyticsCall(req, res, deliveryLocation));

app.get('/api/visits-completed', (req, res) =>
  handleAnalyticsCall(req, res, visitsCompleted));

app.get('/api/visits-during', (req, res) =>
  handleAnalyticsCall(req, res, visitsDuring));

app.get('/api/monthly-registrations', (req, res) =>
  handleAnalyticsCall(req, res, monthlyRegistrations));

app.get('/api/monthly-deliveries', (req, res) =>
  handleAnalyticsCall(req, res, monthlyDeliveries));

const formats = {
  xml: {
    extension: 'xml',
    contentType: 'application/vnd.ms-excel'
  },
  csv: {
    extension: 'csv',
    contentType: 'text/csv'
  },
  json: {
    extension: 'json',
    contentType: 'application/json'
  },
  zip: {
    extension: 'zip',
    contentType: 'application/zip'
  }
};

const getExportPermission = type => {
  if (type === 'audit') {
    return 'can_export_audit';
  }
  if (type === 'feedback') {
    return 'can_export_feedback';
  }
  if (type === 'contacts') {
    return 'can_export_contacts';
  }
  if (type === 'logs') {
    return 'can_export_server_logs';
  }
  return 'can_export_messages';
};

app.all([
  '/api/v1/export/:type/:form?',
  `/${db.getPath()}/export/:type/:form?`
], (req, res) => {
  auth.check(req, getExportPermission(req.params.type), req.query.district, (err, ctx) => {
    if (err) {
      return serverUtils.error(err, req, res, true);
    }
    req.query.type = req.params.type;
    req.query.form = req.params.form || req.query.form;
    req.query.district = ctx.district;
    exportData.get(req.query, (err, exportDataResult) => {
      if (err) {
        return serverUtils.serverError(err, req, res);
      }

      const format = formats[req.query.format] || formats.csv;
      const filename =
        `${req.params.type}-${moment().format('YYYYMMDDHHmm')}.${format.extension}`;

      res
        .set('Content-Type', format.contentType)
        .set(`Content-Disposition', 'attachment; filename=${filename}`);

      if (_.isFunction(exportDataResult)) {
        // wants to stream the result back
        exportDataResult(res.write.bind(res), res.end.bind(res));
      } else {
        // has already generated result to return
        res.send(exportDataResult);
      }
    });
  });
});

app.get('/api/v1/fti/:view', (req, res) => {
  auth.check(req, 'can_view_data_records', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    auth.check(req, 'can_view_unallocated_data_records', null, (err, ctx) => {
      const queryOptions = _.pick(req.query, 'q', 'schema', 'sort', 'skip', 'limit', 'include_docs');
      queryOptions.allocatedOnly = !!err;
      fti.get(req.params.view, queryOptions, ctx && ctx.district, (err, result) => {
        if (err) {
          return serverUtils.serverError(err.message, req, res);
        }
        res.json(result);
      });
    });
  });
});

app.get('/api/v1/messages', (req, res) => {
  auth.check(req, ['can_view_data_records','can_view_unallocated_data_records'], null, err => {
    if (err) {
      return serverUtils.error(err, req, res, true);
    }
    const opts = _.pick(req.query, 'limit', 'start', 'descending', 'state');
    messages.getMessages(opts, (err, result) => {
      if (err) {
        return serverUtils.serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.get('/api/v1/messages/:id', (req, res) => {
  auth.check(req, ['can_view_data_records','can_view_unallocated_data_records'], null, err => {
    if (err) {
      return serverUtils.error(err, req, res, true);
    }
    messages.getMessage(req.params.id, (err, result) => {
      if (err) {
        return serverUtils.serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.put('/api/v1/messages/state/:id', jsonParser, (req, res) => {
  auth.check(req, 'can_update_messages', null, err => {
    if (err) {
      return serverUtils.error(err, req, res, true);
    }
    messages.updateMessage(req.params.id, req.body, (err, result) => {
      if (err) {
        return serverUtils.serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.post('/api/v1/records', [jsonParser, formParser], (req, res) => {
  auth.check(req, 'can_create_records', null, err => {
    if (err) {
      return serverUtils.error(err, req, res, true);
    }
    records.create(req.body, req.is(['json','urlencoded']), (err, result) => {
      if (err) {
        return serverUtils.serverError(err.message, req, res);
      }
      res.json(result);
    });
  });
});

app.get('/api/v1/scheduler/:name', (req, res) => {
  auth.check(req, 'can_execute_schedules', null, err => {
    if (err) {
      return serverUtils.error(err, req, res, true);
    }
    scheduler.exec(req.params.name, (err) => {
      if (err) {
        return serverUtils.serverError(err.message, req, res);
      }
      res.json({ schedule: req.params.name, result: 'success' });
    });
  });
});

app.get('/api/v1/forms', (req, res) => {
  forms.listForms(req.headers, (err, body, headers) => {
    if (err) {
      return serverUtils.serverError(err, req, res);
    }
    if (headers) {
      res.writeHead(headers.statusCode || 200, headers);
    }
    res.end(body);
  });
});

app.get('/api/v1/forms/:form', (req, res) => {
  const parts = req.params.form.split('.'),
        form = parts.slice(0, -1).join('.'),
        format = parts.slice(-1)[0];
  if (!form || !format) {
    return serverUtils.serverError(new Error('Invalid form parameter.'), req, res);
  }
  forms.getForm(form, format, (err, body, headers) => {
    if (err) {
      return serverUtils.serverError(err, req, res);
    }
    if (headers) {
      res.writeHead(headers.statusCode || 200, headers);
    }
    res.end(body);
  });
});

app.get('/api/v1/users', (req, res) => {
  auth.check(req, 'can_view_users', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    users.getList((err, body) => {
      if (err) {
        return serverUtils.error(err, req, res);
      }
      res.json(body);
    });
  });
});

app.post('/api/v1/users', jsonParser, (req, res) => {
  auth.check(req, 'can_create_users', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    users.createUser(req.body, (err, body) => {
      if (err) {
        return serverUtils.error(err, req, res);
      }
      res.json(body);
    });
  });
});

app.post('/api/v1/users/:username', jsonParser, (req, res) => {
  auth.check(req, 'can_update_users', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    if (_.isEmpty(req.body)) {
      return emptyJSONBodyError(req, res);
    }
    users.updateUser(req.params.username, req.body, (err, body) => {
      if (err) {
        return serverUtils.error(err, req, res);
      }
      res.json(body);
    });
  });
});

app.delete('/api/v1/users/:username', jsonParser, (req, res) => {
  auth.check(req, 'can_delete_users', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    users.deleteUser(req.params.username, (err, result) => {
      if (err) {
        return serverUtils.error(err, req, res);
      }
      res.json(result);
    });
  });
});

app.post('/api/v1/places', jsonParser, (req, res) => {
  auth.check(req, 'can_create_places', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    if (_.isEmpty(req.body)) {
      return emptyJSONBodyError(req, res);
    }
    places.createPlace(req.body, (err, body) => {
      if (err) {
        return serverUtils.error(err, req, res);
      }
      res.json(body);
    });
  });
});

app.post('/api/v1/places/:id', jsonParser, (req, res) => {
  auth.check(req, 'can_update_places', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    if (_.isEmpty(req.body)) {
      return emptyJSONBodyError(req, res);
    }
    places.updatePlace(req.params.id, req.body, (err, body) => {
      if (err) {
        return serverUtils.error(err, req, res);
      }
      res.json(body);
    });
  });
});

app.post('/api/v1/people', jsonParser, (req, res) => {
  auth.check(req, 'can_create_people', null, err => {
    if (err) {
      return serverUtils.error(err, req, res);
    }
    if (_.isEmpty(req.body)) {
      return emptyJSONBodyError(req, res);
    }
    people.createPerson(req.body, (err, body) => {
      if (err) {
        return serverUtils.error(err, req, res);
      }
      res.json(body);
    });
  });
});

// DB replication endpoint
const changesHander = _.partial(require('./handlers/changes').request, proxy);
app.get(`${pathPrefix}_changes`, changesHander);
app.post(`${pathPrefix}_changes`, jsonParser, changesHander);

const writeHeaders = (req, res, headers, redirect) => {
  res.oldWriteHead = res.writeHead;
  res.writeHead = (_statusCode, _headers) => {
    // hardcode this so we never show the basic auth prompt
    res.setHeader('WWW-Authenticate', 'Cookie');
    if (headers) {
      headers.forEach(([k, v]) => res.setHeader(k, v));
    }
    // for dynamic resources, redirect to login page
    if (redirect && _statusCode === 401) {
      _statusCode = 302;
      res.setHeader(
        'Location', `${pathPrefix}login?redirect=${encodeURIComponent(req.url)}`);
    }
    res.oldWriteHead(_statusCode, _headers);
  };
};

/**
 * Set cache control on static resources. Must be hacked in to
 * ensure we set the value first.
 */
proxy.on('proxyReq', (proxyReq, req, res) => {
  if (favicon.test(req.url)) {
    // Cache for a week.  Normally we don't interferse with couch headers, but
    // due to Chrome (including Android WebView) aggressively requesting
    // favicons on every page change and window.history update
    // (https://github.com/medic/medic-webapp/issues/1913 ), we have to stage an
    // intervention:
    writeHeaders(req, res, [
      [ 'Cache-Control', 'public, max-age=604800' ],
    ]);
  } else if (appcacheManifest.test(req.url)) {
    // requesting the appcache manifest
    writeHeaders(req, res, [
      [ 'Cache-Control', 'must-revalidate' ],
      [ 'Content-Type', 'text/cache-manifest; charset=utf-8' ],
      [ 'Last-Modified', 'Tue, 28 Apr 2015 02:23:40 GMT' ],
      [ 'Expires', 'Tue, 28 Apr 2015 02:21:40 GMT' ]
    ]);
  } else if (!staticResources.test(req.url) && req.url.includes(appPrefix)) {
    // requesting other application files
    writeHeaders(req, res, [], true);
  } else {
    // everything else
    writeHeaders(req, res);
  }
});

/**
 * Make sure requests to these urls sans trailing / are redirected to the
 * correct slashed endpoint to avoid weird bugs
 */
[
  appPrefix,
  pathPrefix
].forEach(url => {
  const urlSansTrailingSlash = url.slice(0, - 1);
  app.get(urlSansTrailingSlash, (req, res) => res.redirect(url));
});

const audit = (req, res) => {
  const ap = new AuditProxy();
  ap.on('error', e => serverUtils.serverError(e, req, res));
  ap.on('not-authorized', () => serverUtils.notLoggedIn(req, res));
  ap.audit(proxyForAuditing, req, res);
};

const auditPath = `${pathPrefix}*`;
app.put(auditPath, audit);
app.post(auditPath, audit);
app.delete(auditPath, audit);

app.all('*', proxy.web);

proxy.on('error', (err, req, res) => serverUtils.serverError(JSON.stringify(err), req, res));

proxyForAuditing.on('error', (err, req, res) => serverUtils.serverError(JSON.stringify(err), req, res));

const nodeVersionCheck = callback => {
  try {
    console.log('Node Version:', process.version);

    const version = process.versions.node.match(/(\d)+\.(\d)+\.(\d)+/)[1];

    if (Number(version[1] <= 4)) {
      // 5 seems to be where the majority of ES6 was added without flags.
      // Seems safeist to not allow api to run
      callback(new Error(`Node version ${process.version} is not supported`));
    }

    if (Number(version[1]) < 6 && Number(version[2]) < 10) {
      console.error('This node version may not be supported');
    }

    callback();
  } catch (error) {
    callback(error);
  }
};

const envVarsCheck = callback => {
  const envValueAndExample = [
    ['COUCH_URL', 'http://admin:pass@localhost:5984/medic'],
    ['COUCH_NODE_NAME', 'couchdb@localhost']
  ];

  const failures = [];
  envValueAndExample.forEach(([envVar, example]) => {
    if (!process.env[envVar]) {
      failures.push(`${envVar} must be set. For example: ${envVar}=${example}`);
    }
  });

  if (failures.length) {
    callback('At least one required environment variable was not set:\n' + failures.join('\n'));
  } else {
    callback();
  }
};

const couchDbVersionCheck = callback =>
  db.getCouchDbVersion((err, version) => {
    console.log('CouchDB Version:', version);
    callback();
  });

const asyncLog = message => async.asyncify(() => console.log(message));

async.series([
  nodeVersionCheck,
  envVarsCheck,
  couchDbVersionCheck,
  ddocExtraction.run,
  asyncLog('DDoc extraction completed successfully'),
  config.load,
  asyncLog('Configuration loaded successfully'),
  async.asyncify(config.listen),
  translations.run,
  asyncLog('Translations merged successfully'),
  migrations.run,
  asyncLog('Database migrations completed successfully'),
  async.asyncify(scheduler.init)
], err => {
  if (err) {
    console.error('Fatal error initialising medic-api', err);
    process.exit(1);
  }

  app.listen(apiPort, () =>
    console.log('Medic API listening on port ' + apiPort));
});

// Define error-handling middleware last.
// http://expressjs.com/guide/error-handling.html
app.use((err, req, res, next) => { // jshint ignore:line
  serverUtils.serverError(err, req, res);
});
