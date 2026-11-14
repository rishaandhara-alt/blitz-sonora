import { BlitzortungClient } from './blitzortung.js';
import { AmbientAudioEngine } from './audio-engine.js';
import { LightningGlobe } from './globe.js';
import { getRegionName } from './world-data.js';

const globeCanvas = document.getElementById('globe-canvas');
const spectrumCanvas = document.getElementById('spectrum-canvas');
const spectrumCtx = spectrumCanvas.getContext('2d');

const statusPill = document.getElementById('status-pill');
const statusLabel = document.getElementById('status-label');
const statusDetail = document.getElementById('status-detail');
const hoverCoordsEl = document.getElementById('hover-coords');

const metricSpm = document.getElementById('metric-spm');
const metricTotal = document.getElementById('metric-total');
const metricNote = document.getElementById('metric-note');
const audioStateTag = document.getElementById('audio-state-tag');
const strikeLogEl = document.getElementById('strike-log');

const launchCard = document.getElementById('launch-card');
const btnEngage = document.getElementById('btn-engage');
const btnMute = document.getElementById('btn-mute');
const muteLabel = document.getElementById('mute-label');
const btnBurst = document.getElementById('btn-burst');
const selectRoot = document.getElementById('select-root');

const toggleRotate = document.getElementById('toggle-rotate');
const toggleFollow = document.getElementById('toggle-follow');
const toggleArcs = document.getElementById('toggle-arcs');

const audioEngine = new AmbientAudioEngine();

const recentTimestamps = [];
const recentLogEntries = [];
let sessionTotal = 0;

function formatCoord(lat, lon) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${latDir} ${Math.abs(lon).toFixed(2)}°${lonDir}`;
}

function formatClock(ms) {
  const d = new Date(ms || Date.now());
  return d.toTimeString().slice(0, 8);
}

function updateMetricsUI() {
  const cutoff = Date.now() - 60000;
  while (recentTimestamps.length > 0 && recentTimestamps[0] < cutoff) {
    recentTimestamps.shift();
  }
  const spm = recentTimestamps.length;
  metricSpm.textContent = String(spm);
  metricTotal.textContent = sessionTotal.toLocaleString();
  audioEngine.setStormActivity(spm);
}

function renderStrikeLog() {
  if (recentLogEntries.length === 0) return;
  strikeLogEl.innerHTML = '';

  for (const item of recentLogEntries) {
    const li = document.createElement('li');
    li.className = `strike-row${item.pol > 0 ? ' is-positive' : ''}`;
    li.title = 'Click to rotate globe to strike coordinates';

    const left = document.createElement('div');
    left.className = 'strike-row-left';

    const reg = document.createElement('span');
    reg.className = 'strike-region';
    reg.textContent = `[${item.clock}] ${item.region}`;

    const meta = document.createElement('span');
    meta.className = 'strike-meta';
    meta.textContent = `${formatCoord(item.lat, item.lon)} · ${item.pol > 0 ? '+CG' : '-CG'}`;

    left.appendChild(reg);
    left.appendChild(meta);

    const noteEl = document.createElement('span');
    noteEl.className = 'strike-note';
    noteEl.textContent = `${item.noteName} · ${Math.round(item.freq)}Hz`;

    li.appendChild(left);
    li.appendChild(noteEl);
    li.addEventListener('click', () => {
      globe.focusOn(item.lat, item.lon);
    });

    strikeLogEl.appendChild(li);
  }
}

function processStrike(strike, explicitPan = null) {
  sessionTotal += 1;
  recentTimestamps.push(Date.now());

  const pan = explicitPan !== null ? explicitPan : globe.getScreenPan(strike.lat, strike.lon);
  const noteInfo = audioEngine.triggerStrike(strike, pan);

  globe.addStrike(strike, noteInfo);
  metricNote.textContent = `${noteInfo.noteName} · ${noteInfo.freq.toFixed(0)}Hz`;

  recentLogEntries.unshift({
    clock: formatClock(strike.time),
    region: strike.region || getRegionName(strike.lat, strike.lon),
    lat: strike.lat,
    lon: strike.lon,
    pol: strike.pol,
    noteName: noteInfo.noteName,
    freq: noteInfo.freq
  });
  if (recentLogEntries.length > 5) {
    recentLogEntries.length = 5;
  }

  updateMetricsUI();
  renderStrikeLog();
}

const globe = new LightningGlobe(globeCanvas, {
  onManualStrike: (lat, lon, pan) => {
    const strike = feed.createManualStrike(lat, lon);
    if (strike) {
      // createManualStrike emits via onStrike, so just ensure accurate pan if needed
    }
    void pan;
  },
  onHoverCoords: (coords) => {
    if (!coords) {
      hoverCoordsEl.textContent = 'DRAG TO ORBIT · CLICK GLOBE TO STRIKE';
    } else {
      const region = getRegionName(coords.lat, coords.lon);
      hoverCoordsEl.textContent = `${formatCoord(coords.lat, coords.lon)} · ${region}`;
    }
  }
});

const feed = new BlitzortungClient({
  onStrike: (strike) => {
    processStrike(strike);
  },
  onStatusChange: (status) => {
    statusPill.className = `status-pill status-${status.state}`;
    statusLabel.textContent = status.label;
    statusDetail.textContent = status.detail;
  }
});

function syncAudioUI() {
  const listening = audioEngine.isListening;
  btnMute.classList.toggle('is-muted', !listening);
  muteLabel.textContent = listening ? 'LISTENING' : 'LISTEN';
  audioStateTag.textContent = listening ? 'LIVE AUDIO' : 'MUTED';
  audioStateTag.classList.toggle('is-live', listening);
}

async function handleEngageAudio() {
  await audioEngine.engage();
  launchCard.classList.add('is-hidden');
  syncAudioUI();
  // Play an immediate welcoming atmospheric chord ripple on engage
  feed.triggerBurst(4);
}

btnEngage.addEventListener('click', handleEngageAudio);

btnMute.addEventListener('click', async () => {
  if (!audioEngine.initialized) {
    await handleEngageAudio();
    return;
  }
  await audioEngine.toggleMute();
  launchCard.classList.add('is-hidden');
  syncAudioUI();
});

// Feed Mode Buttons
document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.getAttribute('data-mode');
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    feed.setMode(mode);
  });
});

btnBurst.addEventListener('click', () => {
  feed.triggerBurst(14);
});

// Scale Pills
document.querySelectorAll('[data-scale]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const scale = btn.getAttribute('data-scale');
    document.querySelectorAll('[data-scale]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    audioEngine.setScale(scale);
  });
});

// Root Key Selector
selectRoot.addEventListener('change', (e) => {
  audioEngine.setRoot(e.target.value);
});

// Audio Parameter Sliders
const sliderBindings = [
  ['slider-volume', 'volume'],
  ['slider-reverb', 'reverb'],
  ['slider-drone', 'drone'],
  ['slider-sferics', 'sferics']
];
for (const [elId, param] of sliderBindings) {
  const el = document.getElementById(elId);
  el.addEventListener('input', (e) => {
    audioEngine.setParam(param, parseFloat(e.target.value));
  });
}

// Globe Toggles
toggleRotate.addEventListener('click', () => {
  globe.autoRotate = !globe.autoRotate;
  toggleRotate.classList.toggle('active', globe.autoRotate);
});

toggleFollow.addEventListener('click', () => {
  globe.followStrikes = !globe.followStrikes;
  toggleFollow.classList.toggle('active', globe.followStrikes);
});

toggleArcs.addEventListener('click', () => {
  globe.showArcs = !globe.showArcs;
  toggleArcs.classList.toggle('active', globe.showArcs);
});

const toggleSun = document.getElementById('toggle-sun');
toggleSun.addEventListener('click', () => {
  globe.setShowSun(!globe.showSun);
  toggleSun.classList.toggle('active', globe.showSun);
  if (globe.showSun) {
    const { lat, lon } = globe.subsolar;
    toggleSun.title = `Subsolar point ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`;
  }
});

// 40-Bar Real-time Web Audio FFT Spectrum Visualizer
function renderSpectrumLoop() {
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;
  spectrumCtx.clearRect(0, 0, w, h);

  const bytes = audioEngine.getSpectrumBytes();
  const barCount = 40;
  const gap = 2.5;
  const barWidth = (w - gap * (barCount - 1) - 12) / barCount;
  const startX = 6;

  for (let i = 0; i < barCount; i++) {
    // Log-ish index mapping so low-mid ambient harmonics occupy rich visual width
    const binIndex = Math.min(bytes.length - 1, Math.floor(Math.pow(i / barCount, 1.35) * (bytes.length * 0.72)));
    const raw = bytes[binIndex] || 0;
    const norm = raw / 255;
    const barHeight = Math.max(2, norm * (h - 10));

    const x = startX + i * (barWidth + gap);
    const y = h - 4 - barHeight;

    const grad = spectrumCtx.createLinearGradient(0, y, 0, h - 4);
    grad.addColorStop(0, norm > 0.55 ? '#F59E0B' : '#7DD3FC');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.25)');

    spectrumCtx.fillStyle = audioEngine.isListening ? grad : 'rgba(148, 163, 184, 0.16)';
    spectrumCtx.fillRect(x, y, barWidth, barHeight);
  }

  requestAnimationFrame(renderSpectrumLoop);
}

// Periodic metric decay update
setInterval(updateMetricsUI, 1500);

globe.start();
feed.start();
syncAudioUI();
renderSpectrumLoop();
