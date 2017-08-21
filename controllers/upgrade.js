const PouchDB = require('pouchdb-core');
PouchDB.plugin(require('pouchdb-adapter-http'));

const buildDbUrl = 'https://staging.dev.medicmobile.org/_couch/builds';

const buildDb = new PouchDB(buildDbUrl);
const targetDbUrl = process.env.COUCH_URL;
const targetDb = new PouchDB(targetDbUrl);

const stagedDdocName = name => name + ':staged';

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
      status: 400,
      message: 'We only support medic as the application and namespace'
    });
  }

  console.log('upgrade()', `Upgrading to ${JSON.stringify(buildInfo)}…`);

  console.log('upgrade()', 'Fetching newDdoc…');
  return buildDb
    .get(ddocName(buildInfo), { attachments:true })
    .catch(err => {
      console.log('GOT ERROR', err);
      if (err.status === 404) {
        err = new Error(`Version not found: ${buildInfo.version}`);
      }
      // FIXME: why does this from causing an unhandled promise rejection?
      //        It shouldn't do this because we catch again in server.js:194
      //        Exceptions thrown in other parts (such as targetDb.put(newDDoc))
      //        correctly flow to the second catch, but this one doesn't?
      throw err;
    })
    .then(newDdoc => {
      console.log('upgrade()', 'Fetched newDdoc.');

      console.log('upgrade()', 'Fetching oldDdoc…');
      return targetDb.get('_design/medic')
        .then(oldDdoc => {
          console.log('upgrade()', 'Fetched oldDdoc.');

          newDdoc._id = stagedDdocName(oldDdoc._id);
          delete newDdoc._rev;

          newDdoc.deploy_info = {
            timestamp: new Date().toString(),
            user: username,
            version: buildInfo.version,
          };

          console.log('upgrade()', `Staging new ddoc as ${newDdoc._id}`);
          // TODO: if we have already pushed a staged ddoc this can cause a 409
          //       Do we want to deal with this? Do we want to delete the existing
          //       ddoc first? What if horti is in the middle of dealing with it?
          //       Horti deletes this document once it's copied it into the right
          //       place, so maybe leave this / make the error messag clearer
          return targetDb.put(newDdoc);
        })
        .then(() => console.log('upgrade()', 'newDdoc uploaded, awaiting Horticulturalist'));
      });
};
