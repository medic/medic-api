#!/bin/node

// Intentionally not ES6 because it may be run on old systems with an old node

var scriptLocation = process.argv[2];

if (!scriptLocation) {
  console.error('You must provide the script to run as argument.');
  process.exit(1);
}

if (!process.env.COUCH_URL) {
  console.error('You must define a COUCH_URL in your environment');
  console.error('e.g. COUCH_URL=http://admin:pass@localhost:5994/medic');
  process.exit(1);
}

var script = require(scriptLocation);

console.log('Migration script ' + script.name);
console.log('Created on ' + script.created);
console.log('Running manually...');

script.run(function(err) {
  if (err) {
    console.error('There was an error manually running ' + script.name);
    console.error(err);
    process.exit(1);
  }

  console.log(script.name + ' was run successfully');
});
