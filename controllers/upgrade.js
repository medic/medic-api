const PouchDB = require('pouchdb-core');
PouchDB.plugin(require('pouchdb-adapter-http'));

// const buildDbUrl = 'https://staging.dev.medicmobile.org/_couch/builds';

//////////////////////////////// HACK
const buildDbUrl = 'https://admin:pass@localhost:5984/builds';
//////////////////////////////// HACK

const buildDb = new PouchDB(buildDbUrl);
const targetDbUrl = process.env.COUCH_URL;
const targetDb = new PouchDB(targetDbUrl);

// TODO: formalise this (TODO add ticket)
const stagedDdocName = name => name + ':staged';

// TODO: formalise all of this data munging (TODO add ticket)
const ddocName = buildInfo =>
 `${buildInfo.namespace}:${buildInfo.application}:${buildInfo.version}`;

module.exports = (buildInfo, username) => {
  if (!buildInfo) {
    throw new Error('Bad request');
  }

  // While we've set the api to in theory be more generic, this is for if we
  // split this code out (and say, put it with horticulturalist). For now we
  // just support medic deploying medic :-)
  if (buildInfo.namespace !== 'medic' ||
      buildInfo.application !== 'medic') {
    return Promise.reject({
      expected: true,
      status: 400,
      message: 'We only support medic as the application and namespace'
    });
  }

  console.log('upgrade()', `Upgrading to ${JSON.stringify(buildInfo)}…`);

  console.log('upgrade()', 'Fetching newDdoc…');
  return buildDb
    .get(ddocName(buildInfo), { attachments:true })
    .catch(err => {
      if (err.status === 404) {
        err = new Error(`Version not found: ${buildInfo.version}`);
        err.expected = true;
      }
      throw err;
    })
    .then(newDdoc => {
      console.log('upgrade()', 'Fetched newDdoc.');

      console.log('upgrade()', 'Fetching oldDdoc…');
      return targetDb.get('_design/medic')
        .then(oldDdoc => {
          console.log('upgrade()', 'Fetched oldDdoc.');

          newDdoc._id = stagedDdocName(oldDdoc._id);
          newDdoc._rev = oldDdoc._rev;

          newDdoc.deploy_info = {
            timestamp: new Date().toString(),
            user: username,
            version: buildInfo.version,
          };

          console.log('upgrade()', 'Uploading new ddoc into staging position');
          return targetDb.put(newDdoc);
        })
        .then(() => console.log('upgrade()', 'newDdoc uploaded, awaiting Horticulturalist'));
      });
};
