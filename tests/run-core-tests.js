/* Runs every core unit test:  node tests/run-core-tests.js */
const { summary } = require('./core/harness');
['parser', 'timer-engine', 'schedule-rules', 'schedule-time', 'scheduler', 'idle', 'voice-phrases', 'voice-session']
  .forEach((name) => require('./core/' + name + '.test.js'));
process.exit(summary() ? 1 : 0);
