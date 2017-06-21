const PouchDB = require('pouchdb-core');
PouchDB.plugin(require('pouchdb-adapter-http'));

const buildDbUrl = 'https://staging.dev.medicmobile.org/_couch/builds';
const buildDb = new PouchDB(buildDbUrl);
const targetDbUrl = process.env.COUCH_URL;
const targetDb = new PouchDB(targetDbUrl);

module.exports = (version, username) => {
  console.log('upgrade()', `Upgrading to ${version}…`);

  console.log('upgrade()', 'Fetching newDdoc…');
  return buildDb
    .get(version, { attachments:true })
    .then(newDdoc => console.log('upgrade()', 'Fetched newDdoc.') || newDdoc)

    .then(newDdoc => console.log('upgrade()', 'Fetching oldDdoc…') || newDdoc)
    .then(newDdoc =>
      targetDb.get('_design/medic')
        .then(oldDdoc => console.log('upgrade()', 'Fetched oldDdoc.') || oldDdoc)

        .then(oldDdoc => {
          newDdoc.app_settings = oldDdoc.app_settings;
          newDdoc._id = oldDdoc._id;
          newDdoc._rev = oldDdoc._rev;

          newDdoc.deploy_info = {
            timestamp: new Date().toString(),
            user: username,
            version: version,
          };

          console.log('upgrade()', 'Uploading new ddoc…');
          return targetDb.put(newDdoc)
            .then(ret => console.log('upgrade()', 'newDdoc uploaded.') || ret);

        }))
    .catch(err => {
      if (err.status === 404) {
        err = new Error(`Version not found: ${version}`);
        err.expected = true;
      }
      throw err;
    });
};
