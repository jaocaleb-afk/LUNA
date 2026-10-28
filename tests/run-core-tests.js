/* Runs every core unit test:  node tests/run-core-tests.js */
const { done } = require('./core/harness');
['duration-parser', 'arithmetic', 'parser', 'parser-commands', 'timer-engine', 'schedule-rules', 'schedule-time', 'scheduler', 'idle', 'voice-phrases', 'voice-session', 'pin', 'kiosk-gate',
  'speech-text', 'speech-output', 'miss-counter', 'screen-time-policy', 'screen-time-storage', 'screen-time-timer']
  .forEach((name) => require('./core/' + name + '.test.js'));
done().then((failed) => process.exit(failed ? 1 : 0));
