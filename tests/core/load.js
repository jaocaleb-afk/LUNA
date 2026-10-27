/* Loads the browser-style core files (plain <script>s, no module syntax) in the same order index.html
   loads them, and returns their top-level names. This lets the REAL source files be unit-tested
   without adding export boilerplate to them. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CORE_FILES = ['duration-parser', 'parser', 'timer-engine', 'schedule-time', 'schedule', 'scheduler', 'idle', 'voice-phrases', 'voice-session', 'pin', 'kiosk-gate', 'speech-output',
  'screen-time-policy', 'screen-time-storage', 'screen-time-timer'];
const NAMES = ['DurationParser', 'Parser', 'TimerEngine', 'createTimerEngine', 'ScheduleTime', 'Schedule', 'createScheduler', 'createIdle', 'VoicePhrases', 'VoiceCore', 'Pin', 'createKioskGate', 'SpeechOutput',
  'ScreenTimePolicy', 'ScreenTimeRecord', 'createScreenTimeTimer'];

for (const f of CORE_FILES) {
  const file = path.join(__dirname, '..', '..', 'js', 'core', f + '.js');
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
module.exports = vm.runInThisContext('({' + NAMES.join(',') + '})');
