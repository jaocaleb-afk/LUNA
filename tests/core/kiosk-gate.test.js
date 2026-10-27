const a = require('assert');
const { testAsync } = require('./harness');
const { createKioskGate } = require('./load');

/* A fake browser: fullscreen requests succeed unless refuse=true, and every change calls gate.fullscreenChanged()
   the way a real `fullscreenchange` event would. browserExit() is the browser's own control / Esc. */
function makeGate(opts = {}) {
  const fake = {
    fs: !!opts.startFullscreen, pin: opts.pin !== false, active: !!opts.active, refuse: false,
    requests: 0, exits: 0, views: [],
  };
  let gate;
  const change = (on) => { fake.fs = on; gate.fullscreenChanged(); };
  gate = createKioskGate({
    supported: opts.supported !== false,
    isFullscreen: () => fake.fs,
    request: () => { fake.requests++; if (fake.refuse) return Promise.reject(new Error('gesture')); change(true); return Promise.resolve(); },
    exit: () => { fake.exits++; change(false); return Promise.resolve(); },
    hasPin: () => fake.pin,
    loadActive: () => fake.active,
    saveActive: (on) => { fake.active = on; },
    onChange: (v) => fake.views.push(v),
  });
  fake.browserExit = () => change(false);
  gate.init();
  return { gate, fake, mode: () => gate.view().mode };
}

testAsync('kiosk: entering fullscreen starts kiosk mode and remembers it', async () => {
  const { gate, fake, mode } = makeGate();
  a.strictEqual(mode(), 'normal');
  a.deepStrictEqual(await gate.enter(), { ok: true });
  a.strictEqual(mode(), 'kiosk');
  a.strictEqual(fake.active, true);
});

testAsync('kiosk: LUNA’s own Exit control asks for the PIN and does not leave fullscreen by itself', async () => {
  const { gate, fake, mode } = makeGate();
  await gate.enter();
  await gate.requestExit();
  a.strictEqual(mode(), 'confirm-exit');
  a.strictEqual(fake.fs, true, 'still fullscreen');
  a.strictEqual(fake.exits, 0);
  gate.cancelExit();
  a.strictEqual(mode(), 'kiosk');
});

testAsync('kiosk: wrong PIN keeps the prompt with a message; correct PIN exits fullscreen', async () => {
  const { gate, fake, mode } = makeGate();
  await gate.enter();
  await gate.requestExit();
  gate.pinRejected('Wrong PIN.');
  a.strictEqual(mode(), 'confirm-exit');
  a.strictEqual(gate.view().message, 'Wrong PIN.');
  a.strictEqual(fake.fs, true);
  await gate.pinAccepted();
  a.strictEqual(fake.fs, false);
  a.strictEqual(mode(), 'normal', 'approved exit is not treated as an escape');
  a.strictEqual(fake.active, false);
});

testAsync('kiosk: fullscreen ending without the PIN (browser control / Esc) locks LUNA', async () => {
  const { gate, fake, mode } = makeGate();
  await gate.enter();
  fake.browserExit();
  a.strictEqual(mode(), 'locked');
  a.strictEqual(gate.view().reason, 'exited');
  gate.pinRejected('Wrong PIN.');
  a.strictEqual(mode(), 'locked', 'a wrong PIN keeps it locked');
  await gate.pinAccepted();
  a.strictEqual(mode(), 'normal');
  a.strictEqual(fake.active, false);
});

testAsync('kiosk: Esc during the PIN prompt also locks (the prompt alone is not an approval)', async () => {
  const { gate, fake, mode } = makeGate();
  await gate.enter();
  await gate.requestExit();
  fake.browserExit();
  a.strictEqual(mode(), 'locked');
});

testAsync('kiosk: "Return to fullscreen" from the lock goes back to kiosk; a refusal stays locked and says why', async () => {
  const { gate, fake, mode } = makeGate();
  await gate.enter();
  fake.browserExit();
  fake.refuse = true;
  a.deepStrictEqual(await gate.returnToFullscreen(), { ok: false });
  a.strictEqual(mode(), 'locked');
  a.match(gate.view().message, /did not allow fullscreen/);
  fake.refuse = false;
  a.deepStrictEqual(await gate.returnToFullscreen(), { ok: true });
  a.strictEqual(mode(), 'kiosk');
});

testAsync('kiosk: a reload while in kiosk mode comes back locked (if a PIN is set)', async () => {
  let x = makeGate({ active: true });
  a.strictEqual(x.mode(), 'locked');
  a.strictEqual(x.gate.view().reason, 'reload');
  await x.gate.returnToFullscreen();
  a.strictEqual(x.mode(), 'kiosk');

  x = makeGate({ active: true, pin: false });
  a.strictEqual(x.mode(), 'normal', 'no PIN: nothing to protect, and the stale flag is cleared');
  a.strictEqual(x.fake.active, false);

  x = makeGate({ active: true, supported: false });
  a.strictEqual(x.mode(), 'normal', 'no fullscreen API: never locks (it could not have been fullscreen)');
});

testAsync('kiosk: with no PIN set every exit is allowed (no pretend protection)', async () => {
  const { gate, fake, mode } = makeGate({ pin: false });
  a.strictEqual(gate.isProtected(), false);
  await gate.enter();
  await gate.requestExit();
  a.strictEqual(mode(), 'normal');
  a.strictEqual(fake.fs, false);
  await gate.enter();
  fake.browserExit();
  a.strictEqual(mode(), 'normal');
});

testAsync('kiosk: missing or refused fullscreen API is reported, not faked', async () => {
  let x = makeGate({ supported: false });
  const r = await x.gate.enter();
  a.ok(!r.ok && /does not let LUNA go fullscreen/.test(r.msg));
  a.strictEqual(x.fake.requests, 0);
  a.strictEqual(x.mode(), 'normal');

  x = makeGate();
  x.fake.refuse = true;
  const refused = await x.gate.enter();
  a.ok(!refused.ok && /did not allow/.test(refused.msg));
  a.strictEqual(x.mode(), 'normal');
});

testAsync('kiosk: the exit control does nothing outside kiosk mode', async () => {
  const { gate, fake, mode } = makeGate();
  await gate.requestExit();
  a.strictEqual(mode(), 'normal');
  a.strictEqual(fake.exits, 0);
  await gate.pinAccepted();
  a.strictEqual(mode(), 'normal');
});
