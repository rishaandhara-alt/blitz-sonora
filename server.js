'use strict';

const http = require('http');
const tls = require('tls');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const UPSTREAM_HOSTS = [
  'ws1.blitzortung.org',
  'ws7.blitzortung.org',
  'ws8.blitzortung.org',
  'ws2.blitzortung.org'
];

/**
 * Decodes Blitzortung's custom LZW-compressed JSON frame.
 * @param {string} data
 * @returns {string}
 */
function decodeBlitzortungLZW(data) {
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

const sseClients = new Set();
const relayState = {
  connected: false,
  upstreamHost: null,
  totalRelayed: 0,
  lastStrikeTime: null,
  lastError: null,
  hostIndex: 0
};

let activeUpstreamSocket = null;
let reconnectTimer = null;
let heartbeatTimer = null;

function broadcastSSE(eventName, payload) {
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(msg);
    } catch {
      sseClients.delete(res);
    }
  }
}

function sendMaskedWSFrame(socket, opcode, payloadStr = '') {
  if (!socket || socket.destroyed) return;
  const payload = Buffer.from(payloadStr, 'utf8');
  const len = payload.length;
  const mask = crypto.randomBytes(4);

  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  const maskedPayload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    maskedPayload[i] = payload[i] ^ mask[i % 4];
  }

  socket.write(Buffer.concat([header, mask, maskedPayload]));
}

function normalizeStrike(raw) {
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

function handleUpstreamText(text) {
  let decoded = text;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    decoded = decodeBlitzortungLZW(text);
  }
  const clean = decoded.trim();
  if (!clean.startsWith('{') && !clean.startsWith('[')) return;

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    return;
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    const strike = normalizeStrike(item);
    if (!strike) continue;
    relayState.totalRelayed += 1;
    relayState.lastStrikeTime = Date.now();
    broadcastSSE('strike', strike);
  }
}

function scheduleReconnect(delayMs = 4500) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectUpstream();
  }, delayMs);
}

function connectUpstream() {
  if (activeUpstreamSocket && !activeUpstreamSocket.destroyed) {
    activeUpstreamSocket.destroy();
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  const host = UPSTREAM_HOSTS[relayState.hostIndex % UPSTREAM_HOSTS.length];
  relayState.hostIndex += 1;
  relayState.connected = false;
  relayState.upstreamHost = host;

  const wsKey = crypto.randomBytes(16).toString('base64');
  let handshakeComplete = false;
  let buffer = Buffer.alloc(0);
  let fragmentedChunks = [];
  let fragmentedOpcode = 0;

  const socket = tls.connect(
    {
      host,
      port: 443,
      servername: host,
      timeout: 10000
    },
    () => {
      const reqLines = [
        'GET / HTTP/1.1',
        `Host: ${host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${wsKey}`,
        'Sec-WebSocket-Version: 13',
        'Origin: https://map.blitzortung.org',
        'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        '',
        ''
      ];
      socket.write(reqLines.join('\r\n'));
    }
  );

  activeUpstreamSocket = socket;

  socket.on('timeout', () => {
    relayState.lastError = `Connection timeout (${host})`;
    socket.destroy();
  });

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    if (!handshakeComplete) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const headerStr = buffer.slice(0, headerEnd).toString('utf8');
      buffer = buffer.slice(headerEnd + 4);

      if (!/^HTTP\/1\.1 101/i.test(headerStr)) {
        relayState.lastError = `Handshake rejected by ${host}`;
        broadcastSSE('status', {
          connected: false,
          upstreamHost: host,
          lastError: relayState.lastError
        });
        socket.destroy();
        return;
      }

      handshakeComplete = true;
      relayState.connected = true;
      relayState.lastError = null;
      broadcastSSE('status', {
        connected: true,
        upstreamHost: host,
        totalRelayed: relayState.totalRelayed
      });

      // Mandatory Blitzortung subscription payload
      sendMaskedWSFrame(socket, 0x1, JSON.stringify({ a: 111 }));

      heartbeatTimer = setInterval(() => {
        if (socket.destroyed) return;
        sendMaskedWSFrame(socket, 0x9, 'ping');
      }, 25000);
    }

    // Parse RFC 6455 WebSocket frames
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < offset + 2) break;
        payloadLen = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (buffer.length < offset + 8) break;
        const bigLen = buffer.readBigUInt64BE(offset);
        payloadLen = Number(bigLen);
        offset += 8;
      }

      if (masked) {
        if (buffer.length < offset + 4) break;
        offset += 4;
      }

      if (buffer.length < offset + payloadLen) break;

      let payload = buffer.slice(offset, offset + payloadLen);
      if (masked) {
        const maskKey = buffer.slice(offset - 4, offset);
        const unmasked = Buffer.alloc(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          unmasked[i] = payload[i] ^ maskKey[i % 4];
        }
        payload = unmasked;
      }

      buffer = buffer.slice(offset + payloadLen);

      if (opcode === 0x8) {
        socket.end();
        break;
      } else if (opcode === 0x9) {
        sendMaskedWSFrame(socket, 0xA, payload.toString('utf8'));
      } else if (opcode === 0xA) {
        // Pong received
      } else if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        if (opcode !== 0x0) {
          fragmentedOpcode = opcode;
          fragmentedChunks = [payload];
        } else {
          fragmentedChunks.push(payload);
        }
        if (fin) {
          const fullPayload = Buffer.concat(fragmentedChunks);
          fragmentedChunks = [];
          if (fragmentedOpcode === 0x1 || fragmentedOpcode === 0x2) {
            handleUpstreamText(fullPayload.toString('utf8'));
          }
        }
      }
    }
  });

  socket.on('error', (err) => {
    relayState.connected = false;
    relayState.lastError = err.message;
    broadcastSSE('status', {
      connected: false,
      upstreamHost: host,
      lastError: err.message
    });
  });

  socket.on('close', () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    relayState.connected = false;
    broadcastSSE('status', {
      connected: false,
      upstreamHost: host,
      lastError: relayState.lastError
    });
    scheduleReconnect(5000);
  });
}

function serveStatic(req, res, pathname) {
  let relPath = pathname === '/' ? '/index.html' : pathname;
  try {
    relPath = decodeURIComponent(relPath);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(ROOT_DIR, safePath);

  if (!fullPath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(fullPath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  if (pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(
      JSON.stringify({
        connected: relayState.connected,
        upstreamHost: relayState.upstreamHost,
        totalRelayed: relayState.totalRelayed,
        lastStrikeTime: relayState.lastStrikeTime,
        lastError: relayState.lastError,
        sseClients: sseClients.size
      })
    );
    return;
  }

  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(': connected\n\n');
    res.write(
      `event: status\ndata: ${JSON.stringify({
        connected: relayState.connected,
        upstreamHost: relayState.upstreamHost,
        totalRelayed: relayState.totalRelayed,
        lastError: relayState.lastError
      })}\n\n`
    );

    sseClients.add(res);
    const keepalive = setInterval(() => {
      if (res.writableEnded) return;
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`FULGUR server listening on http://localhost:${PORT}`);
  connectUpstream();
});
