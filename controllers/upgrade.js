const PouchDB = require('pouchdb');

const buildDbUrl = 'https://staging.dev.medicmobile.org/_couch/builds';
const buildDb = new PouchDB(buildDbUrl);
const targetDbUrl = process.env.COUCH_URL;
const targetDb = new PouchDB(targetDbUrl);

module.exports = version => {
  console.log(`Upgrading ${targetDbUrl} to ${version} from ${buildDbUrl}…`);
  return buildDb
    .get(version, { attachments:true })
    .then(newDdoc => console.log('Fetched newDdoc') || newDdoc)
    .then(newDdoc =>
      targetDb.get('_design/medic')
        .then(oldDdoc => console.log('Fetched oldDdoc') || oldDdoc)
        .then(oldDdoc => {
          newDdoc.app_settings = oldDdoc.app_settings;
          newDdoc._id = oldDdoc._id;
          newDdoc._rev = oldDdoc._rev;
          return targetDb.put(newDdoc)
            .then(ret => console.log('Put newDdoc') || ret);
        }))
    .catch(err => {
      if (err.status === 404) {
        err = new Error(`Version not found: ${version}`);
        err.expected = true;
      }
      throw err;
    });
};
