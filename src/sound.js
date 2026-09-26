import { wind } from './style.js';

// Engine hum and wind noise, synthesized with WebAudio (no files). Starts on the first user gesture.
export function createSound() {
  let ctx = null, master, engine, filter, osc1, osc2, chugLfo, windGain, windFilter;
  let enabled = true;

  function init() {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Engine: saw + square an octave down → soft low-pass → "chug" amplitude modulation at crank speed
    osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
    osc2 = ctx.createOscillator(); osc2.type = 'square';
    const sub = ctx.createGain(); sub.gain.value = 0.35;
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.8;
    const chug = ctx.createGain(); chug.gain.value = 0.65;
    chugLfo = ctx.createOscillator(); chugLfo.type = 'sine';
    const chugDepth = ctx.createGain(); chugDepth.gain.value = 0.35;
    engine = ctx.createGain(); engine.gain.value = 0;
    osc1.connect(filter); osc2.connect(sub); sub.connect(filter);
    chugLfo.connect(chugDepth); chugDepth.connect(chug.gain);
    filter.connect(chug); chug.connect(engine); engine.connect(master);

    // Wind: looping brown noise through a band-pass whose pitch rises with airspeed
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    noise.connect(windFilter); windFilter.connect(windGain); windGain.connect(master);

    for (const o of [osc1, osc2, chugLfo, noise]) o.start();
  }

  return {
    unlock() {
      if (!ctx) init();
      if (ctx.state === 'suspended') ctx.resume();
    },
    get enabled() { return enabled; },
    setEnabled(on) { enabled = on; },
    update(flight, paused) {
      if (!ctx) return;
      const t = ctx.currentTime, crashed = flight.state === 'crashed';
      master.gain.setTargetAtTime(enabled && !paused ? 0.5 : 0, t, 0.15);
      const rpm = crashed ? 0 : 600 + flight.throttle * 1900 + Math.min(flight.airspeed, 55) * 18;
      const fire = Math.max(20, (rpm / 60) * 3.5); // 7-cylinder four-stroke: 3.5 firing pulses per revolution
      osc1.frequency.setTargetAtTime(fire, t, 0.12);
      osc2.frequency.setTargetAtTime(fire / 2, t, 0.12);
      chugLfo.frequency.setTargetAtTime(Math.max(4, rpm / 60), t, 0.12);
      filter.frequency.setTargetAtTime(280 + flight.throttle * 900, t, 0.12);
      engine.gain.setTargetAtTime(crashed ? 0 : 0.1 + flight.throttle * 0.1, t, 0.25);
      const air = flight.airspeed, gust = wind.now / 12;
      windGain.gain.setTargetAtTime(Math.min(0.55, (air / 50) ** 2 * 0.35 + gust * 0.08), t, 0.2);
      windFilter.frequency.setTargetAtTime(250 + air * 22, t, 0.2);
    },
  };
}
