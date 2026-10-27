/* Runs every core unit test:  node tests/run-core-tests.js */
const { done } = require('./core/harness');
['parser', 'timer-engine', 'schedule-rules', 'schedule-time', 'scheduler', 'idle', 'voice-phrases', 'voice-session', 'pin', 'kiosk-gate']
  .forEach((name) => require('./core/' + name + '.test.js'));
done().then((failed) => process.exit(failed ? 1 : 0));
