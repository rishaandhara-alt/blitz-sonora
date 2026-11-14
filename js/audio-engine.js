/**
 * Pure Web Audio API generative ambient synthesizer.
 * Maps real-time lightning coordinates & telemetry into harmonic scales,
 * FM glass chimes, cello swells, planetary drones, VLF sferics, and shimmer reverb.
 */

export const SCALES = {
  hirajoshi: {
    label: 'Hirajoshi',
    intervals: [0, 1, 5, 6, 10]
  },
  pentatonic: {
    label: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10]
  },
  lydian: {
    label: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11]
  },
  dorian: {
    label: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10]
  }
};

export const ROOT_NOTES = {
  C: { label: 'C', midi: 36 },   // C2 = 65.41 Hz
  D: { label: 'D', midi: 38 },   // D2 = 73.42 Hz
  Eb: { label: 'Eb', midi: 39 }, // Eb2 = 77.78 Hz
  F: { label: 'F', midi: 41 },   // F2 = 87.31 Hz
  G: { label: 'G', midi: 43 },   // G2 = 98.00 Hz
  A: { label: 'A', midi: 45 }    // A2 = 110.00 Hz
};

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiToName(midi) {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export class AmbientAudioEngine {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = true;

    this.scaleKey = 'hirajoshi';
    this.rootKey = 'F';

    this.levels = {
      volume: 0.72,
      reverb: 0.65,
      drone: 0.38,
      sferics: 0.25
    };

    this.masterGain = null;
    this.compressor = null;
    this.analyser = null;
    this.dryBus = null;
    this.wetSend = null;
    this.reverbGain = null;
    this.convolver = null;
    this.delayL = null;
    this.delayR = null;
    this.noiseBuffer = null;

    // Drone nodes
    this.droneGain = null;
    this.droneFilter = null;
    this.droneOscs = [];
    this.droneLfo = null;

    // Polyphony & arpeggio timing
    this.activeVoices = [];
    this.maxVoices = 14;
    this.minSlotInterval = 0.055; // 55ms quantization window
    this.nextSlotTime = 0;

    this.freqData = new Uint8Array(128);
  }

  get isListening() {
    return this.initialized && !this.muted && this.ctx && this.ctx.state === 'running';
  }

  async engage() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this._buildMasterGraph();
      this._buildDrone();
      this.initialized = true;
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.muted = false;
    this._updateMasterGains();
    return true;
  }

  async toggleMute() {
    if (!this.initialized) {
      await this.engage();
      return false;
    }

    if (this.muted) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.muted = false;
    } else {
      this.muted = true;
    }
    this._updateMasterGains();
    return this.muted;
  }

  setScale(scaleKey) {
    if (SCALES[scaleKey]) {
      this.scaleKey = scaleKey;
    }
  }

  setRoot(rootKey) {
    if (!ROOT_NOTES[rootKey]) return;
    this.rootKey = rootKey;
    this._updateDronePitch();
  }

  setParam(param, value) {
    if (!(param in this.levels)) return;
    this.levels[param] = Math.max(0, Math.min(1, Number(value)));
    this._updateMasterGains();
  }

  setStormActivity(strikesPerMinute) {
    if (!this.ctx || !this.droneFilter) return;
    const norm = Math.min(1, Math.max(0, strikesPerMinute / 90));
    const cutoff = 135 + norm * 320;
    this.droneFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.8);
  }

  /**
   * Computes musical pitch mapping from strike latitude & telemetry even when muted
   * so telemetry HUD always displays harmonic correspondence.
   */
  mapStrikeToNote(strike) {
    const scale = SCALES[this.scaleKey] || SCALES.hirajoshi;
    const root = ROOT_NOTES[this.rootKey] || ROOT_NOTES.F;
    const intervals = scale.intervals;

    // Map latitude [-65, +65] onto 4 octaves of the selected scale
    const clampedLat = Math.max(-65, Math.min(65, strike.lat));
    const latNorm = (clampedLat + 65) / 130; // 0 (South) .. 1 (North)
    const totalSteps = intervals.length * 4;
    const stepIndex = Math.min(totalSteps - 1, Math.max(0, Math.floor(latNorm * totalSteps)));

    const octaveOffset = Math.floor(stepIndex / intervals.length);
    const degreeOffset = intervals[stepIndex % intervals.length];
    const midi = root.midi + octaveOffset * 12 + degreeOffset;
    const freq = midiToFreq(midi);
    const noteName = midiToName(midi);

    return {
      midi,
      freq,
      noteName,
      latNorm
    };
  }

  triggerStrike(strike, screenPan = null) {
    const noteInfo = this.mapStrikeToNote(strike);

    if (!this.isListening) {
      return noteInfo;
    }

    const now = this.ctx.currentTime;
    // Quantize simultaneous bursts into clean 55ms arpeggio slots
    if (this.nextSlotTime < now) {
      this.nextSlotTime = now;
    }
    const startTime = Math.min(now + 0.48, this.nextSlotTime);
    this.nextSlotTime = Math.min(now + 0.48, startTime + this.minSlotInterval);

    // Voice-stealing if polyphony limit reached
    this._pruneFinishedVoices(now);
    if (this.activeVoices.length >= this.maxVoices) {
      const oldest = this.activeVoices.shift();
      this._stealVoice(oldest, now);
    }

    const panValue =
      screenPan !== null && Number.isFinite(screenPan)
        ? Math.max(-0.85, Math.min(0.85, screenPan))
        : Math.max(-0.85, Math.min(0.85, strike.lon / 180));

    const sigStrength = Math.min(1, Math.max(0.2, (strike.sigCount || 5) / 14));
    const isPositive = Number(strike.pol) > 0;
    const lat = strike.lat;

    // Register timbre profiling: South = warm swell, Tropics = glass bell, North = crystalline chime
    let carrierType = 'sine';
    let attack = 0.018;
    let release = 4.2;
    let fmRatio = 2.0;
    let fmDepth = noteInfo.freq * (0.45 + sigStrength * 0.8);

    if (lat < -23.5) {
      carrierType = 'triangle';
      attack = 0.045;
      release = 5.6;
      fmRatio = 1.0;
      fmDepth = noteInfo.freq * 0.25;
    } else if (lat > 23.5) {
      carrierType = 'sine';
      attack = 0.012;
      release = 3.5;
      fmRatio = isPositive ? 3.0 : 2.0;
      fmDepth = noteInfo.freq * (0.6 + sigStrength * 1.1);
    }

    const carrier = this.ctx.createOscillator();
    carrier.type = carrierType;
    carrier.frequency.setValueAtTime(noteInfo.freq, startTime);

    // Subtle harmonic shimmer oscillator (+12 fifth/octave warmth)
    const harmonic = this.ctx.createOscillator();
    harmonic.type = 'sine';
    harmonic.frequency.setValueAtTime(
      noteInfo.freq * (isPositive ? 1.5 : 2.0),
      startTime
    );
    const harmonicGain = this.ctx.createGain();
    harmonicGain.gain.setValueAtTime(isPositive ? 0.16 : 0.09, startTime);

    // FM transient modulator
    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(noteInfo.freq * fmRatio, startTime);
    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(fmDepth, startTime);
    modGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.28);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Per-voice filter & envelope
    const voiceFilter = this.ctx.createBiquadFilter();
    voiceFilter.type = 'lowpass';
    voiceFilter.frequency.setValueAtTime(
      Math.min(7500, noteInfo.freq * (3.5 + sigStrength * 4.5)),
      startTime
    );
    voiceFilter.frequency.exponentialRampToValueAtTime(
      Math.max(180, noteInfo.freq * 1.6),
      startTime + release * 0.75
    );

    const env = this.ctx.createGain();
    const peakGain = (0.095 + sigStrength * 0.065) * (lat > 30 ? 0.82 : 1.0);
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + release);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(panValue, startTime);

    carrier.connect(voiceFilter);
    harmonic.connect(harmonicGain);
    harmonicGain.connect(voiceFilter);
    voiceFilter.connect(env);
    env.connect(panner);

    panner.connect(this.dryBus);
    panner.connect(this.wetSend);

    carrier.start(startTime);
    harmonic.start(startTime);
    mod.start(startTime);

    const stopTime = startTime + release + 0.06;
    carrier.stop(stopTime);
    harmonic.stop(stopTime);
    mod.stop(stopTime);

    // Optional VLF radio sferic crackle + distant thunder sub-thump
    if (this.levels.sferics > 0.02 && this.noiseBuffer) {
      this._triggerSferic(startTime, panValue, sigStrength, isPositive);
    }

    const voiceRecord = {
      stopTime,
      env,
      nodes: [carrier, harmonic, mod]
    };
    this.activeVoices.push(voiceRecord);

    return noteInfo;
  }

  _triggerSferic(startTime, panValue, sigStrength, isPositive) {
    const level = this.levels.sferics;
    const sfericSrc = this.ctx.createBufferSource();
    sfericSrc.buffer = this.noiseBuffer;

    // Bandpass radio static click (~1.8 kHz)
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1600 + Math.random() * 900, startTime);
    bp.Q.value = 3.2;

    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, startTime);
    clickGain.gain.linearRampToValueAtTime(0.055 * level * sigStrength, startTime + 0.004);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.085);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(panValue, startTime);

    sfericSrc.connect(bp);
    bp.connect(clickGain);
    clickGain.connect(panner);
    panner.connect(this.dryBus);
    panner.connect(this.wetSend);

    sfericSrc.start(startTime, Math.random() * 0.5, 0.12);

    // Distant low-passed thunder swell on strong or positive bolts
    if (isPositive || sigStrength > 0.55) {
      const thunderSrc = this.ctx.createBufferSource();
      thunderSrc.buffer = this.noiseBuffer;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(105, startTime);
      lp.Q.value = 0.8;

      const tGain = this.ctx.createGain();
      tGain.gain.setValueAtTime(0.0001, startTime);
      tGain.gain.linearRampToValueAtTime(0.09 * level, startTime + 0.09);
      tGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.15);

      thunderSrc.connect(lp);
      lp.connect(tGain);
      tGain.connect(panner);
      thunderSrc.start(startTime, Math.random() * 0.4, 1.25);
    }
  }

  _pruneFinishedVoices(now) {
    this.activeVoices = this.activeVoices.filter((v) => v.stopTime > now);
  }

  _stealVoice(voice, now) {
    if (!voice) return;
    try {
      voice.env.gain.cancelScheduledValues(now);
      voice.env.gain.setTargetAtTime(0.0001, now, 0.015);
      for (const osc of voice.nodes) {
        osc.stop(now + 0.06);
      }
    } catch {
      // already stopped
    }
  }

  getSpectrumBytes() {
    if (!this.analyser || !this.isListening) {
      this.freqData.fill(0);
      return this.freqData;
    }
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  _buildMasterGraph() {
    const ctx = this.ctx;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.25;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.0;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 0.78;

    this.wetSend = ctx.createGain();
    this.wetSend.gain.value = 0.55;

    // Algorithmic 4.5s Stereo Convolution Reverb
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this._createReverbIR(4.5, 2.8);

    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = this.levels.reverb;

    // Cross-coupled stereo ping-pong ambient delay (0.375s / 0.525s)
    this.delayL = ctx.createDelay(1.0);
    this.delayR = ctx.createDelay(1.0);
    this.delayL.delayTime.value = 0.375;
    this.delayR.delayTime.value = 0.525;

    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.32;
    fbR.gain.value = 0.32;

    const fbFilter = ctx.createBiquadFilter();
    fbFilter.type = 'lowpass';
    fbFilter.frequency.value = 2400;

    const delayMix = ctx.createGain();
    delayMix.gain.value = 0.28;

    this.wetSend.connect(this.convolver);
    this.wetSend.connect(this.delayL);

    this.delayL.connect(fbL);
    fbL.connect(this.delayR);
    this.delayR.connect(fbR);
    fbR.connect(fbFilter);
    fbFilter.connect(this.delayL);

    this.delayL.connect(delayMix);
    this.delayR.connect(delayMix);
    delayMix.connect(this.convolver);

    this.convolver.connect(this.reverbGain);

    this.dryBus.connect(this.compressor);
    this.reverbGain.connect(this.compressor);
    delayMix.connect(this.compressor);

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    // Pre-generate 2.0s white noise buffer for VLF sferics & thunder
    const noiseLen = Math.floor(ctx.sampleRate * 2.0);
    this.noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const ch = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
  }

  _createReverbIR(durationSec, decayExponent) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.04));
        const env = fadeIn * Math.pow(1 - t, decayExponent);
        // Gentle one-pole smoothing for silky dark atmospheric tail
        const white = Math.random() * 2 - 1;
        lp = lp * 0.55 + white * 0.45;
        data[i] = lp * env;
      }
    }
    return buffer;
  }

  _buildDrone() {
    const ctx = this.ctx;
    const root = ROOT_NOTES[this.rootKey] || ROOT_NOTES.F;
    const baseFreq = midiToFreq(root.midi);

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 180;
    this.droneFilter.Q.value = 1.6;

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;

    // 3 warm detuned drone oscillators (Root, Fifth, Octave)
    const ratios = [
      { mult: 1.0, type: 'sawtooth', detune: -4, amp: 0.36 },
      { mult: 1.5, type: 'triangle', detune: 5, amp: 0.28 },
      { mult: 2.0, type: 'sine', detune: 0, amp: 0.24 }
    ];

    this.droneLfo = ctx.createOscillator();
    this.droneLfo.type = 'sine';
    this.droneLfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 45;
    this.droneLfo.connect(lfoGain);
    lfoGain.connect(this.droneFilter.frequency);
    this.droneLfo.start();

    this.droneOscs = ratios.map((cfg) => {
      const osc = ctx.createOscillator();
      osc.type = cfg.type;
      osc.frequency.value = baseFreq * cfg.mult;
      osc.detune.value = cfg.detune;

      const g = ctx.createGain();
      g.gain.value = cfg.amp;

      osc.connect(g);
      g.connect(this.droneFilter);
      osc.start();
      return { osc, mult: cfg.mult };
    });

    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.dryBus);
    this.droneGain.connect(this.wetSend);
  }

  _updateDronePitch() {
    if (!this.ctx || !this.droneOscs.length) return;
    const root = ROOT_NOTES[this.rootKey] || ROOT_NOTES.F;
    const baseFreq = midiToFreq(root.midi);
    const now = this.ctx.currentTime;
    for (const item of this.droneOscs) {
      item.osc.frequency.setTargetAtTime(baseFreq * item.mult, now, 0.45);
    }
  }

  _updateMasterGains() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const targetMaster = this.muted ? 0.0 : this.levels.volume;
    this.masterGain.gain.setTargetAtTime(targetMaster, now, 0.08);

    if (this.reverbGain) {
      this.reverbGain.gain.setTargetAtTime(0.15 + this.levels.reverb * 1.15, now, 0.08);
    }
    if (this.wetSend) {
      this.wetSend.gain.setTargetAtTime(0.2 + this.levels.reverb * 0.75, now, 0.08);
    }
    if (this.droneGain) {
      this.droneGain.gain.setTargetAtTime(this.levels.drone * 0.24, now, 0.15);
    }
  }
}
