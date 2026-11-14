import { GLOBAL_STORM_HOTSPOTS, getRegionName } from './world-data.js';

const DIRECT_WS_ENDPOINTS = [
  'wss://ws1.blitzortung.org/',
  'wss://ws7.blitzortung.org/',
  'wss://ws8.blitzortung.org/'
];

/**
 * Decodes Blitzortung's custom LZW-compressed JSON frame.
 * @param {string} data
 * @returns {string}
 */
export function decodeBlitzortungLZW(data) {
  if (!data || typeof data !== 'string') return '';
  const d = Array.from(data);
  if (d.length === 0) return '';

  const dictionary = Object.create(null);
  let c = d[0];
  let f = c;
  const out = [c];
  const base = 256;
  let nextCode = base;

  for (let i = 1; i < d.length; i++) {
    const ch = d[i];
    const code = ch.codePointAt(0);
    let entry;
    if (code < base) {
      entry = ch;
    } else if (dictionary[code] !== undefined) {
      entry = dictionary[code];
    } else {
      entry = f + c;
    }
    out.push(entry);
    c = Array.from(entry)[0] || '';
    dictionary[nextCode++] = f + c;
    f = entry;
  }

  return out.join('');
}

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Realistic meteorological storm generator for fallback, demo, and storm burst synthesis.
 */
class SimulatedStormEngine {
  constructor(onStrike) {
    this.onStrike = onStrike;
    this.running = false;
    this.timer = null;
    this.intensity = 1.0;
    this.activeCells = this._pickInitialCells();
    this.totalWeight = GLOBAL_STORM_HOTSPOTS.reduce((acc, h) => acc + h.weight, 0);
  }

  _pickInitialCells() {
    // Keep 3 active drifting supercells plus occasional global sporadic cells
    const shuffled = [...GLOBAL_STORM_HOTSPOTS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4).map((cell) => ({
      ...cell,
      driftLat: (Math.random() - 0.5) * 0.04,
      driftLon: (Math.random() - 0.5) * 0.06
    }));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._scheduleNext(350);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setIntensity(value) {
    this.intensity = Math.max(0.25, Math.min(3.0, Number(value) || 1.0));
  }

  _pickHotspot() {
    // 72% chance strike clusters inside one of the currently active storm cells
    if (Math.random() < 0.72 && this.activeCells.length > 0) {
      const cell = this.activeCells[Math.floor(Math.random() * this.activeCells.length)];
      cell.lat = Math.max(-58, Math.min(64, cell.lat + cell.driftLat));
      cell.lon = ((cell.lon + cell.driftLon + 540) % 360) - 180;
      if (Math.random() < 0.03) {
        this.activeCells = this._pickInitialCells();
      }
      return cell;
    }

    let r = Math.random() * this.totalWeight;
    for (const h of GLOBAL_STORM_HOTSPOTS) {
      r -= h.weight;
      if (r <= 0) return h;
    }
    return GLOBAL_STORM_HOTSPOTS[0];
  }

  createStrike(customCoords = null, source = 'simulated') {
    let lat;
    let lon;
    if (customCoords) {
      lat = customCoords.lat;
      lon = customCoords.lon;
    } else {
      const cell = this._pickHotspot();
      lat = Math.max(-75, Math.min(78, cell.lat + gaussianRandom() * (cell.spread * 0.42)));
      lon = cell.lon + gaussianRandom() * (cell.spread * 0.52);
      if (lon > 180) lon -= 360;
      if (lon < -180) lon += 360;
    }

    const pol = Math.random() < 0.14 ? 1 : -1;
    const sigCount = 4 + Math.floor(Math.random() * 8);
    const sig = [];
    const arcCount = Math.min(5, sigCount);
    for (let i = 0; i < arcCount; i++) {
      const angle = (Math.PI * 2 * i) / arcCount + (Math.random() - 0.5) * 0.7;
      const dist = 3.5 + Math.random() * 11;
      let sLat = Math.max(-80, Math.min(82, lat + Math.sin(angle) * dist));
      let sLon = lon + Math.cos(angle) * dist;
      if (sLon > 180) sLon -= 360;
      if (sLon < -180) sLon += 360;
      sig.push({ lat: sLat, lon: sLon, sta: 100 + Math.floor(Math.random() * 900) });
    }

    return {
      source,
      time: Date.now(),
      lat,
      lon,
      alt: 0,
      pol,
      mds: Math.round(1400 + Math.random() * 5800),
      mcg: Math.round(80 + Math.random() * 220),
      sigCount,
      sig,
      region: getRegionName(lat, lon)
    };
  }

  triggerBurst(count = 14) {
    const cell = this._pickHotspot();
    for (let i = 0; i < count; i++) {
      const delay = i * (65 + Math.random() * 95);
      setTimeout(() => {
        const lat = Math.max(-75, Math.min(78, cell.lat + gaussianRandom() * (cell.spread * 0.35)));
        let lon = cell.lon + gaussianRandom() * (cell.spread * 0.45);
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;
        this.onStrike(this.createStrike({ lat, lon }, 'burst'));
      }, delay);
    }
  }

  _scheduleNext(overrideDelay = null) {
    if (!this.running) return;
    // Ambient pacing: ~0.9 to 2.2 strikes/sec depending on intensity, with occasional double-strikes
    const baseMs = (620 + Math.random() * 1150) / this.intensity;
    const delay = overrideDelay !== null ? overrideDelay : baseMs;
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.onStrike(this.createStrike(null, 'simulated'));
      if (Math.random() < 0.22) {
        setTimeout(() => {
          if (this.running) this.onStrike(this.createStrike(null, 'simulated'));
        }, 90 + Math.random() * 110);
      }
      this._scheduleNext();
    }, delay);
  }
}

export class BlitzortungClient {
  constructor({ onStrike, onStatusChange } = {}) {
    this.onStrike = onStrike || (() => {});
    this.onStatusChange = onStatusChange || (() => {});

    this.mode = 'auto'; // 'auto' | 'live' | 'simulated'
    this.sse = null;
    this.ws = null;
    this.wsEndpointIdx = 0;
    this.wsRetryTimer = null;
    this.autoFallbackTimer = null;

    this.relayConnected = false;
    this.relayHost = null;
    this.directConnected = false;
    this.directHost = null;
    this.liveStrikesReceived = 0;
    this.lastLiveStrikeAt = 0;

    this.dedupCache = new Map();
    this.simEngine = new SimulatedStormEngine((strike) => {
      this._emitStrike(strike);
    });
  }

  start() {
    this._applyMode();
  }

  destroy() {
    this._stopNetwork();
    this.simEngine.stop();
    if (this.autoFallbackTimer) {
      clearTimeout(this.autoFallbackTimer);
      this.autoFallbackTimer = null;
    }
  }

  setMode(mode) {
    if (!['auto', 'live', 'simulated'].includes(mode)) return;
    this.mode = mode;
    this._applyMode();
  }

  triggerBurst(count = 14) {
    this.simEngine.triggerBurst(count);
  }

  createManualStrike(lat, lon) {
    const strike = this.simEngine.createStrike({ lat, lon }, 'manual');
    this._emitStrike(strike);
    return strike;
  }

  _applyMode() {
    if (this.autoFallbackTimer) {
      clearTimeout(this.autoFallbackTimer);
      this.autoFallbackTimer = null;
    }

    if (this.mode === 'simulated') {
      this._stopNetwork();
      this.simEngine.start();
      this._notifyStatus();
      return;
    }

    // 'auto' or 'live'
    this._startNetwork();

    if (this.mode === 'live') {
      this.simEngine.stop();
      this._notifyStatus();
      return;
    }

    // In 'auto' mode, engage simulated atmospheric stream after 3.5s if no live packet has arrived yet.
    // The moment any live Blitzortung packet arrives, simulation pauses automatically.
    const recentlyLive = Date.now() - this.lastLiveStrikeAt < 12000;
    if (!recentlyLive) {
      this.autoFallbackTimer = setTimeout(() => {
        if (this.mode === 'auto' && Date.now() - this.lastLiveStrikeAt > 3500) {
          this.simEngine.start();
          this._notifyStatus();
        }
      }, 3500);
    } else {
      this.simEngine.stop();
    }

    this._notifyStatus();
  }

  _startNetwork() {
    if (!this.sse) {
      this._connectSSE();
    }
    if (!this.ws && !this.wsRetryTimer) {
      this._connectDirectWS();
    }
  }

  _stopNetwork() {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    if (this.wsRetryTimer) {
      clearTimeout(this.wsRetryTimer);
      this.wsRetryTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.relayConnected = false;
    this.directConnected = false;
  }

  _connectSSE() {
    try {
      const sse = new EventSource('/api/stream');
      this.sse = sse;

      sse.addEventListener('status', (ev) => {
        try {
          const data = JSON.parse(ev.data);
          this.relayConnected = Boolean(data.connected);
          this.relayHost = data.upstreamHost || null;
          this._notifyStatus();
        } catch {
          // ignore
        }
      });

      sse.addEventListener('strike', (ev) => {
        try {
          const strike = JSON.parse(ev.data);
          this._handleLiveStrike(strike, 'blitzortung-relay');
        } catch {
          // ignore
        }
      });

      sse.onerror = () => {
        this.relayConnected = false;
        this._notifyStatus();
      };
    } catch {
      this.relayConnected = false;
    }
  }

  _connectDirectWS() {
    if (this.mode === 'simulated') return;
    const url = DIRECT_WS_ENDPOINTS[this.wsEndpointIdx % DIRECT_WS_ENDPOINTS.length];
    this.wsEndpointIdx += 1;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.directConnected = true;
        this.directHost = new URL(url).host;
        try {
          ws.send(JSON.stringify({ a: 111 }));
        } catch {
          // ignore
        }
        this._notifyStatus();
      };

      ws.onmessage = (event) => {
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;

        let text = raw.trim();
        if (!text.startsWith('{') && !text.startsWith('[')) {
          text = decodeBlitzortungLZW(raw).trim();
        }
        if (!text.startsWith('{') && !text.startsWith('[')) return;

        try {
          const parsed = JSON.parse(text);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of list) {
            const normalized = this._normalizeDirectStrike(item);
            if (normalized) {
              this._handleLiveStrike(normalized, 'blitzortung-ws');
            }
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        this.directConnected = false;
        this._notifyStatus();
      };

      ws.onclose = () => {
        this.ws = null;
        this.directConnected = false;
        this._notifyStatus();
        if (this.mode !== 'simulated' && !this.wsRetryTimer) {
          this.wsRetryTimer = setTimeout(() => {
            this.wsRetryTimer = null;
            this._connectDirectWS();
          }, 6000);
        }
      };
    } catch {
      this.directConnected = false;
      this._notifyStatus();
    }
  }

  _normalizeDirectStrike(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.lat == null || raw.lon == null) return null;
    const lat = Number(raw.lat);
    const lon = Number(raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

    let timeMs = Date.now();
    if (typeof raw.time === 'number' && raw.time > 1e15) {
      timeMs = Math.round(raw.time / 1e6);
    } else if (typeof raw.time === 'number' && raw.time > 1e12) {
      timeMs = Math.round(raw.time / 1e3);
    } else if (typeof raw.time === 'number' && raw.time > 1e9) {
      timeMs = Math.round(raw.time);
    }

    const sig = Array.isArray(raw.sig)
      ? raw.sig.slice(0, 12)
          .filter((s) => s && s.lat != null && s.lon != null)
          .map((s) => ({
            lat: Number(s.lat),
            lon: Number(s.lon),
            sta: s.sta ?? null
          }))
          .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      : [];

    return {
      source: 'blitzortung',
      time: timeMs,
      lat,
      lon,
      alt: Number.isFinite(Number(raw.alt)) ? Number(raw.alt) : 0,
      pol: Number.isFinite(Number(raw.pol)) ? Number(raw.pol) : 0,
      mds: Number.isFinite(Number(raw.mds)) ? Number(raw.mds) : 4000,
      mcg: Number.isFinite(Number(raw.mcg)) ? Number(raw.mcg) : (Number.isFinite(Number(raw.scs)) ? Number(raw.scs) : 180),
      sigCount: Array.isArray(raw.sig) ? raw.sig.length : 0,
      sig
    };
  }

  _handleLiveStrike(strike, sourceTag) {
    if (this.mode === 'simulated') return;

    // Deduplicate identical strike delivered via both SSE relay & direct WS
    const key = `${strike.lat.toFixed(3)}:${strike.lon.toFixed(3)}`;
    const now = Date.now();
    const prev = this.dedupCache.get(key);
    if (prev && now - prev < 5000) {
      return;
    }
    this.dedupCache.set(key, now);
    if (this.dedupCache.size > 400) {
      for (const [k, ts] of this.dedupCache) {
        if (now - ts > 6000) this.dedupCache.delete(k);
      }
    }

    this.liveStrikesReceived += 1;
    this.lastLiveStrikeAt = now;

    if (this.simEngine.running) {
      this.simEngine.stop();
    }

    if (this.mode === 'auto') {
      if (this.autoFallbackTimer) clearTimeout(this.autoFallbackTimer);
      this.autoFallbackTimer = setTimeout(() => {
        if (this.mode === 'auto' && Date.now() - this.lastLiveStrikeAt > 15000) {
          this.simEngine.start();
          this._notifyStatus();
        }
      }, 15500);
    }

    const enriched = {
      ...strike,
      source: sourceTag,
      region: strike.region || getRegionName(strike.lat, strike.lon)
    };
    this._emitStrike(enriched);
    this._notifyStatus();
  }

  _emitStrike(strike) {
    this.onStrike(strike);
  }

  _notifyStatus() {
    const isReceivingLive =
      this.mode !== 'simulated' &&
      (this.relayConnected || this.directConnected) &&
      (this.liveStrikesReceived > 0 && Date.now() - this.lastLiveStrikeAt < 15000);

    let state = 'connecting';
    let label = 'CONNECTING BLITZORTUNG';
    let detail = 'Handshaking upstream nodes...';

    if (this.mode === 'simulated') {
      state = 'simulated';
      label = 'SYNTHETIC STORM FEED';
      detail = 'Simulated climatological storm cells';
    } else if (isReceivingLive) {
      state = 'live';
      const host = this.directConnected ? this.directHost : this.relayHost;
      label = 'LIVE BLITZORTUNG';
      detail = host ? `Streaming from ${host}` : 'Live LZW telemetry active';
    } else if (this.simEngine.running) {
      state = 'fallback';
      label = 'STANDBY STORM SIM';
      detail = (this.relayConnected || this.directConnected)
        ? 'Connected — awaiting live packets'
        : 'Upstream blocked/offline — storm sim active';
    } else if (this.relayConnected || this.directConnected) {
      state = 'connected';
      const host = this.directConnected ? this.directHost : this.relayHost;
      label = 'LINK ESTABLISHED';
      detail = `Listening on ${host || 'Blitzortung'}`;
    } else if (this.mode === 'live') {
      state = 'offline';
      label = 'AWAITING LIVE STREAM';
      detail = 'Retrying Blitzortung WebSockets...';
    }

    this.onStatusChange({
      mode: this.mode,
      state,
      label,
      detail,
      relayConnected: this.relayConnected,
      directConnected: this.directConnected,
      simRunning: this.simEngine.running,
      liveStrikesReceived: this.liveStrikesReceived
    });
  }
}
