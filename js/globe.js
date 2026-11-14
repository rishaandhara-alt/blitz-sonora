import { WORLD_POLYGONS, generateLandDots, computeLandDotMetadata } from './world-data.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Astronomical subsolar point (where the sun is directly overhead) for a UTC instant.
 * Low-precision solar ephemeris (Astronomical Almanac), accurate to ~0.01° — plenty for display.
 */
export function computeSubsolarPoint(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0; // days since J2000.0
  const L = (280.46 + 0.9856474 * n) % 360; // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG2RAD; // mean anomaly
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG2RAD; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * DEG2RAD; // obliquity of the ecliptic

  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * RAD2DEG;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * RAD2DEG;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360; // Greenwich mean sidereal time

  let lon = ra - gmst;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: dec, lon };
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class LightningGlobe {
  constructor(canvas, { onManualStrike, onHoverCoords } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onManualStrike = onManualStrike || (() => {});
    this.onHoverCoords = onHoverCoords || (() => {});

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.cx = 0;
    this.cy = 0;
    this.baseRadius = 260;

    // Camera state
    this.rotLon = -25 * DEG2RAD; // Center initially over Atlantic / Americas / Europe
    this.rotLat = 20 * DEG2RAD;
    this.velLon = 0;
    this.velLat = 0;
    this.zoom = 1.0;
    this.targetZoom = 1.0;

    this.autoRotate = true;
    this.followStrikes = false;
    this.showArcs = true;
    this.targetRotLon = null;
    this.targetRotLat = null;

    // Pointer interaction
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.lastPointerX = 0;
    this.lastPointerY = 0;
    this.dragMoved = false;
    this.hoverPoint = null;

    // Visual data
    this.landDots = generateLandDots(4200);
    this.landMeta = computeLandDotMetadata(this.landDots);

    // Realistic sun (astronomical subsolar point, day/night terminator, city lights)
    this.showSun = false;
    this.subsolar = computeSubsolarPoint(new Date());
    this.sunWorld = this._latLonToVec(this.subsolar.lat, this.subsolar.lon);
    this.sunView = null;
    this._lastSunCalc = 0;
    this._shadeCanvas = document.createElement('canvas');
    this._shadeCtx = this._shadeCanvas.getContext('2d');
    this._shadeSize = 0;
    this._shadeImg = null;
    this._pendingCityLights = null;
    this.stars = this._createStars(180);
    this.strikes = [];
    this.maxActiveStrikes = 260;
    this.rafId = null;

    this._bindEvents();
    this.resize();
  }

  _createStars(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        nx: Math.random(),
        ny: Math.random(),
        r: 0.45 + Math.random() * 1.15,
        alpha: 0.14 + Math.random() * 0.42,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.1
      });
    }
    return stars;
  }

  start() {
    if (this.rafId) return;
    const loop = (now) => {
      this._update(now);
      this._render(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.cx = this.width * 0.5;
    this.cy = this.height * 0.485;
    this.baseRadius = Math.min(this.width, this.height) * 0.34;
  }

  addStrike(strike, noteInfo) {
    const vec = this._latLonToVec(strike.lat, strike.lon);
    const stations = Array.isArray(strike.sig)
      ? strike.sig.slice(0, 6).map((s) => ({
          lat: s.lat,
          lon: s.lon,
          vec: this._latLonToVec(s.lat, s.lon)
        }))
      : [];

    const entry = {
      ...strike,
      noteInfo,
      vec,
      stations,
      createdAt: performance.now(),
      duration: 5600
    };

    this.strikes.push(entry);
    if (this.strikes.length > this.maxActiveStrikes) {
      this.strikes.splice(0, this.strikes.length - this.maxActiveStrikes);
    }

    if (this.followStrikes && !this.isDragging) {
      this.focusOn(strike.lat, strike.lon);
    }
  }

  focusOn(latDeg, lonDeg) {
    this.targetRotLon = lonDeg * DEG2RAD;
    this.targetRotLat = Math.max(-72, Math.min(72, latDeg)) * DEG2RAD;
  }

  getScreenPan(latDeg, lonDeg) {
    const p = this._projectLatLon(latDeg, lonDeg);
    return Math.max(-0.85, Math.min(0.85, p.x * 0.92));
  }

  _bindEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.dragMoved = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.velLon = 0;
      this.velLat = 0;
      this.targetRotLon = null;
      this.targetRotLat = null;
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;

        if (Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY) > 4) {
          this.dragMoved = true;
        }

        const sensitivity = 0.0046 / Math.sqrt(this.zoom);
        this.velLon = -dx * sensitivity;
        this.velLat = dy * sensitivity;
        this.rotLon += this.velLon;
        this.rotLat = Math.max(-1.32, Math.min(1.32, this.rotLat + this.velLat));
      } else {
        const coords = this._screenToLatLon(e.clientX, e.clientY);
        this.hoverPoint = coords;
        this.onHoverCoords(coords);
        this.canvas.style.cursor = coords ? 'crosshair' : 'grab';
      }
    });

    const endDrag = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.canvas.style.cursor = this.hoverPoint ? 'crosshair' : 'grab';

      if (!this.dragMoved) {
        const coords = this._screenToLatLon(e.clientX, e.clientY);
        if (coords) {
          const pan = this.getScreenPan(coords.lat, coords.lon);
          this.onManualStrike(coords.lat, coords.lon, pan);
        }
      }
    };

    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverPoint = null;
      this.onHoverCoords(null);
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0011);
        this.targetZoom = Math.max(0.65, Math.min(2.35, this.targetZoom * factor));
      },
      { passive: false }
    );

    window.addEventListener('resize', () => this.resize());
  }

  _update(now) {
    // Smooth zoom
    this.zoom += (this.targetZoom - this.zoom) * 0.14;

    if (!this.isDragging) {
      if (this.targetRotLon !== null && this.targetRotLat !== null) {
        // Shortest angular interpolation on longitude
        let dLon = this.targetRotLon - this.rotLon;
        while (dLon > Math.PI) dLon -= Math.PI * 2;
        while (dLon < -Math.PI) dLon += Math.PI * 2;
        this.rotLon += dLon * 0.065;
        this.rotLat += (this.targetRotLat - this.rotLat) * 0.065;

        if (Math.abs(dLon) < 0.003 && Math.abs(this.targetRotLat - this.rotLat) < 0.003) {
          this.targetRotLon = null;
          this.targetRotLat = null;
        }
      } else {
        this.rotLon += this.velLon;
        this.rotLat = Math.max(-1.32, Math.min(1.32, this.rotLat + this.velLat));
        this.velLon *= 0.93;
        this.velLat *= 0.93;

        if (this.autoRotate && Math.abs(this.velLon) < 0.001) {
          this.rotLon += 0.00085;
        }
      }
    }

    // Expire completed strike ripples
    while (this.strikes.length > 0 && now - this.strikes[0].createdAt > this.strikes[0].duration) {
      this.strikes.shift();
    }

    // Track the real sun (recomputed once per second; the terminator moves 0.25°/min)
    if (this.showSun && now - this._lastSunCalc > 1000) {
      this._updateSunPosition(now);
    }
  }

  setShowSun(enabled) {
    this.showSun = !!enabled;
    if (this.showSun) {
      this._updateSunPosition(performance.now());
      const sv = this._rotateVec(this.sunWorld);
      if (sv.z > -0.12) {
        this.targetRotLon = (((this.subsolar.lon - 108 + 540) % 360) - 180) * DEG2RAD;
        this.targetRotLat = Math.max(-42, Math.min(42, -this.subsolar.lat * 0.35)) * DEG2RAD;
      }
    }
  }

  _updateSunPosition(now) {
    this._lastSunCalc = now;
    this.subsolar = computeSubsolarPoint(new Date());
    this.sunWorld = this._latLonToVec(this.subsolar.lat, this.subsolar.lon);
  }

  _latLonToVec(latDeg, lonDeg) {
    const phi = latDeg * DEG2RAD;
    const lam = lonDeg * DEG2RAD;
    const cosPhi = Math.cos(phi);
    return [
      cosPhi * Math.sin(lam),
      Math.sin(phi),
      cosPhi * Math.cos(lam)
    ];
  }

  _rotateVec(vec) {
    const [vx, vy, vz] = vec;
    const cosLon = Math.cos(this.rotLon);
    const sinLon = Math.sin(this.rotLon);
    const cosLat = Math.cos(this.rotLat);
    const sinLat = Math.sin(this.rotLat);

    // Rotate around Y by -rotLon
    const x1 = vx * cosLon - vz * sinLon;
    const z1 = vx * sinLon + vz * cosLon;
    const y1 = vy;

    // Rotate around X by rotLat
    const y2 = y1 * cosLat - z1 * sinLat;
    const z2 = y1 * sinLat + z1 * cosLat;

    return { x: x1, y: y2, z: z2 };
  }

  _projectLatLon(latDeg, lonDeg) {
    const phi = latDeg * DEG2RAD;
    const dLon = lonDeg * DEG2RAD - this.rotLon;
    const cosPhi = Math.cos(phi);
    const x0 = cosPhi * Math.sin(dLon);
    const y0 = Math.sin(phi);
    const z0 = cosPhi * Math.cos(dLon);

    const cosLat = Math.cos(this.rotLat);
    const sinLat = Math.sin(this.rotLat);
    const y = y0 * cosLat - z0 * sinLat;
    const z = y0 * sinLat + z0 * cosLat;
    return { x: x0, y, z };
  }

  _screenToLatLon(clientX, clientY) {
    const R = this.baseRadius * this.zoom;
    const nx = (clientX - this.cx) / R;
    const ny = -(clientY - this.cy) / R;
    const r2 = nx * nx + ny * ny;
    if (r2 > 1.0) return null;

    const nz = Math.sqrt(Math.max(0, 1.0 - r2));
    const cosLat = Math.cos(this.rotLat);
    const sinLat = Math.sin(this.rotLat);

    const y0 = ny * cosLat + nz * sinLat;
    const z0 = -ny * sinLat + nz * cosLat;
    const x0 = nx;

    const lat = Math.asin(Math.max(-1, Math.min(1, y0))) * RAD2DEG;
    let lon = (this.rotLon + Math.atan2(x0, z0)) * RAD2DEG;
    lon = ((lon + 540) % 360) - 180;
    return { lat, lon };
  }

  _render(now) {
    const ctx = this.ctx;
    const R = this.baseRadius * this.zoom;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // 1. Deep Atmospheric Void Background
    const bgGrad = ctx.createRadialGradient(
      this.cx,
      this.cy,
      R * 0.25,
      this.cx,
      this.cy,
      Math.max(this.width, this.height) * 0.85
    );
    bgGrad.addColorStop(0, '#0D1426');
    bgGrad.addColorStop(0.55, '#070A12');
    bgGrad.addColorStop(1, '#04060B');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Real sun geometry in view space (+z faces the camera)
    let sun = null;
    if (this.showSun) {
      const sv = this._rotateVec(this.sunWorld);
      this.sunView = sv;
      sun = { view: sv, screen: null, visibility: 0, limbProximity: 0 };
      if (sv.z < 0.42) {
        // Stereographic celestial sky-dome projection (smooth across terminator & behind limb)
        const cosTheta = Math.max(-1, Math.min(1, -sv.z));
        const theta = Math.acos(cosTheta);
        const xyLen = Math.hypot(sv.x, sv.y);
        const rSky = R * 1.48 * Math.tan(theta * 0.5);
        const ux = xyLen > 1e-5 ? sv.x / xyLen : 1;
        const uy = xyLen > 1e-5 ? -sv.y / xyLen : 0;
        const sx = this.cx + ux * rSky;
        const sy = this.cy + uy * rSky;
        const margin = R * 0.8;
        if (
          Math.abs(sx - this.cx) < this.width * 0.5 + margin &&
          Math.abs(sy - this.cy) < this.height * 0.5 + margin
        ) {
          sun.screen = { x: sx, y: sy, dist: rSky, ux, uy, theta };
          sun.visibility = smoothstep(R * 0.95, R * 1.06, rSky);
          const lp = (rSky - R) / (R * 0.085);
          sun.limbProximity = Math.exp(-(lp * lp)) * smoothstep(0.35, -0.05, sv.z);
        }
      }
    }

    // Subtle deep-space starfield (washed out by solar glare when the sun is in frame)
    const tSec = now * 0.001;
    const starDim = sun ? 1 - 0.65 * sun.visibility : 1;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const sx = s.nx * this.width;
      const sy = s.ny * this.height;
      const dx = sx - this.cx;
      const dy = sy - this.cy;
      if (dx * dx + dy * dy < R * R * 1.02) continue;
      const twinkle = 0.6 + 0.4 * Math.sin(tSec * s.speed + s.phase);
      ctx.fillStyle = `rgba(203, 213, 225, ${(s.alpha * twinkle * starDim).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (sun) {
      // Sun disc + corona drawn before the globe so Earth occludes the inner corona & photosphere
      if (sun.screen) this._drawSunDisc(ctx, R, sun, now);
      // 2. Directional Atmospheric Rayleigh/Twilight Halo
      this._drawOuterAtmosphere(ctx, R, sun);
    } else {
      // 2. Outer Atmospheric Fresnel Halo (Default Observatory Mode)
      const haloGrad = ctx.createRadialGradient(this.cx, this.cy, R * 0.92, this.cx, this.cy, R * 1.24);
      haloGrad.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
      haloGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.06)');
      haloGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, R * 1.24, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Globe Body Sphere + Specular Shading
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2);
    ctx.clip();

    if (sun) {
      // Base abyssal night ocean
      ctx.fillStyle = '#03060f';
      ctx.fillRect(this.cx - R - 2, this.cy - R - 2, R * 2 + 4, R * 2 + 4);

      // Continuous per-pixel sunlit ocean, Cox-Munk glint, twilight ozone & Rayleigh limb
      this._drawSunShading(ctx, R, sun.view);

      // Back-hemisphere coastlines & graticule
      this._drawCoastlines(ctx, R, false);
      this._drawGraticule(ctx, R);

      // Continents & coastlines drawn after ocean shading so glint stays off land
      this._drawLandDots(ctx, R);
      this._drawCoastlines(ctx, R, true);

      // Directional inner atmospheric rim
      this._drawDirectionalInnerRim(ctx, R, sun.view);
    } else {
      const sphereGrad = ctx.createRadialGradient(
        this.cx - R * 0.28,
        this.cy - R * 0.32,
        R * 0.1,
        this.cx,
        this.cy,
        R * 1.05
      );
      sphereGrad.addColorStop(0, '#131B2E');
      sphereGrad.addColorStop(0.58, '#0B0E17');
      sphereGrad.addColorStop(1, '#06080F');
      ctx.fillStyle = sphereGrad;
      ctx.fillRect(this.cx - R - 2, this.cy - R - 2, R * 2 + 4, R * 2 + 4);

      // 4. Back-Hemisphere Ghosted Coastlines
      this._drawCoastlines(ctx, R, false);

      // 5. Graticule (15° Latitude & Longitude lines + Highlighted Equator & Tropics)
      this._drawGraticule(ctx, R);

      // 6. Front-Hemisphere Stippled Land Dots + Vector Coastlines
      this._drawLandDots(ctx, R);
      this._drawCoastlines(ctx, R, true);

      // Subtle inner rim vignette for spherical depth
      const rimGrad = ctx.createRadialGradient(this.cx, this.cy, R * 0.78, this.cx, this.cy, R);
      rimGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      rimGrad.addColorStop(0.92, 'rgba(56, 189, 248, 0.06)');
      rimGrad.addColorStop(1, 'rgba(125, 211, 252, 0.24)');
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore(); // end sphere clip

    if (sun) {
      this._drawDirectionalHorizonStroke(ctx, R, sun.view);
      this._drawLimbGlow(ctx, R, sun);
      this._drawTerminatorAndZenith(ctx, R, sun.view);
    } else {
      // Crisp outer horizon ring
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.22)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 7. Live Lightning Strikes, Spherical Shockwaves, Spikes & Detector Arcs
    this._drawStrikes(ctx, R, now);

    // Foreground solar glare bloom & coated-lens ghost reflections
    if (sun && sun.screen && (sun.visibility > 0.01 || sun.limbProximity > 0.05)) {
      this._drawSolarGlareVeil(ctx, R, sun);
    }

    // 8. Hover Reticle on Globe Surface
    if (this.hoverPoint && !this.isDragging) {
      const p = this._projectLatLon(this.hoverPoint.lat, this.hoverPoint.lon);
      if (p.z > 0) {
        const hx = this.cx + p.x * R;
        const hy = this.cy - p.y * R;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  _drawGraticule(ctx, R) {
    // Meridians every 30°
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      let started = false;
      for (let lat = -84; lat <= 84; lat += 6) {
        const p = this._projectLatLon(lat, lon);
        if (p.z >= 0) {
          const sx = this.cx + p.x * R;
          const sy = this.cy - p.y * R;
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        } else {
          started = false;
        }
      }
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.065)';
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    // Parallels every 15° + Tropics ±23.5°
    const latitudes = [-60, -45, -30, -23.5, -15, 0, 15, 23.5, 30, 45, 60];
    for (const lat of latitudes) {
      const isEquator = lat === 0;
      const isTropic = Math.abs(lat) === 23.5;

      ctx.save();
      if (isEquator) {
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 1;
      } else if (isTropic) {
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
        ctx.lineWidth = 0.85;
      } else {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.065)';
        ctx.lineWidth = 0.7;
      }

      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 5) {
        const p = this._projectLatLon(lat, lon);
        if (p.z >= 0) {
          const sx = this.cx + p.x * R;
          const sy = this.cy - p.y * R;
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawLandDots(ctx, R) {
    const dotSize = Math.max(1.0, Math.min(1.65, R * 0.0044));

    if (!this.showSun) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.24)';
      for (let i = 0; i < this.landDots.length; i++) {
        const [lon, lat] = this.landDots[i];
        const p = this._projectLatLon(lat, lon);
        if (p.z <= 0.03) continue;
        const sx = this.cx + p.x * R;
        const sy = this.cy - p.y * R;
        ctx.fillRect(sx - dotSize * 0.5, sy - dotSize * 0.5, dotSize, dotSize);
      }
      return;
    }

    // Sun mode: continuous biome terrain illumination + population-weighted city lights
    const [sxw, syw, szw] = this.sunWorld;
    const sprawlCities = [];
    const coreCities = [];
    const hubHalos = [];
    const nightPts = [];
    const halfDot = dotSize * 0.5;

    for (let i = 0; i < this.landDots.length; i++) {
      const [lon, lat] = this.landDots[i];
      const p = this._projectLatLon(lat, lon);
      if (p.z <= 0.02) continue;

      const meta = this.landMeta[i];
      const v = meta.vec;
      const d = v[0] * sxw + v[1] * syw + v[2] * szw; // cos(solar zenith angle)
      const limb = smoothstep(0.02, 0.18, p.z);
      const sx = this.cx + p.x * R;
      const sy = this.cy - p.y * R;

      if (d > -0.08) {
        const irr = 0.22 + 0.78 * Math.pow(Math.max(0, (d + 0.08) / 1.08), 0.68);
        let r = meta.dayRgb[0] * irr;
        let g = meta.dayRgb[1] * irr;
        let b = meta.dayRgb[2] * irr;

        if (d < 0.14) {
          const aq = (d - 0.03) / 0.06;
          const alpenglow = Math.exp(-(aq * aq)) * 0.45;
          r = r * (1 - alpenglow) + 255 * alpenglow;
          g = g * (1 - alpenglow) + 138 * alpenglow;
          b = b * (1 - alpenglow) + 72 * alpenglow;
        }

        const alpha = (0.34 + 0.44 * irr) * limb;
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha.toFixed(2)})`;
        ctx.fillRect(sx - halfDot, sy - halfDot, dotSize, dotSize);
      } else {
        nightPts.push(sx - halfDot, sy - halfDot);
      }

      if (d < -0.01 && meta.urban > 0.08) {
        const nightFactor = smoothstep(-0.01, -0.15, d) * limb;
        if (meta.urban > 0.48) {
          coreCities.push(sx, sy, nightFactor * meta.urban);
          if (meta.urban > 0.72) {
            hubHalos.push(sx, sy, nightFactor * meta.urban);
          }
        } else {
          sprawlCities.push(sx, sy, nightFactor * (meta.urban / 0.48));
        }
      }
    }

    if (nightPts.length > 0) {
      ctx.fillStyle = 'rgba(18, 28, 46, 0.55)';
      for (let k = 0; k < nightPts.length; k += 2) {
        ctx.fillRect(nightPts[k], nightPts[k + 1], dotSize, dotSize);
      }
    }

    // Additive night-side city clusters & metropolitan blooms
    if (sprawlCities.length > 0 || coreCities.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let k = 0; k < hubHalos.length; k += 3) {
        const hx = hubHalos[k];
        const hy = hubHalos[k + 1];
        const intensity = hubHalos[k + 2];
        const rad = dotSize * (4.0 + intensity * 3.5);
        const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, rad);
        halo.addColorStop(0, `rgba(255, 198, 110, ${(0.28 * intensity).toFixed(3)})`);
        halo.addColorStop(0.5, `rgba(255, 145, 52, ${(0.1 * intensity).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(hx, hy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      const sprawlSize = dotSize * 1.1;
      for (let k = 0; k < sprawlCities.length; k += 3) {
        const a = 0.25 + 0.5 * sprawlCities[k + 2];
        ctx.fillStyle = `rgba(255, 158, 61, ${a.toFixed(2)})`;
        ctx.fillRect(
          sprawlCities[k] - sprawlSize * 0.5,
          sprawlCities[k + 1] - sprawlSize * 0.5,
          sprawlSize,
          sprawlSize
        );
      }

      const coreSize = dotSize * 1.25;
      for (let k = 0; k < coreCities.length; k += 3) {
        const a = 0.45 + 0.52 * coreCities[k + 2];
        ctx.fillStyle = `rgba(255, 233, 176, ${a.toFixed(2)})`;
        ctx.fillRect(
          coreCities[k] - coreSize * 0.5,
          coreCities[k + 1] - coreSize * 0.5,
          coreSize,
          coreSize
        );
      }

      ctx.restore();
    }
  }

  _ensureShadeBuffers(size) {
    if (this._shadeSize === size) return;
    this._shadeSize = size;
    this._shadeCanvas.width = size;
    this._shadeCanvas.height = size;
    this._shadeImg = this._shadeCtx.createImageData(size, size);
  }

  _drawSunShading(ctx, R, sv) {
    const N = Math.max(112, Math.min(260, Math.round((R * 2 * this.dpr) / 3.5)));
    this._ensureShadeBuffers(N);
    const data = this._shadeImg.data;

    // Blinn-Phong half vector between sun and viewer (0,0,1)
    let hx = sv.x;
    let hy = sv.y;
    let hz = sv.z + 1;
    const hLen = Math.hypot(hx, hy, hz) || 1;
    hx /= hLen;
    hy /= hLen;
    hz /= hLen;

    let o = 0;
    for (let j = 0; j < N; j++) {
      const py = 1 - ((j + 0.5) / N) * 2;
      for (let i = 0; i < N; i++, o += 4) {
        const px = ((i + 0.5) / N) * 2 - 1;
        const r2 = px * px + py * py;
        if (r2 >= 1.0) {
          data[o] = 0;
          data[o + 1] = 0;
          data[o + 2] = 0;
          data[o + 3] = 0;
          continue;
        }

        const r = Math.sqrt(r2);
        const nz = Math.sqrt(1 - r2);
        const d = px * sv.x + py * sv.y + nz * sv.z; // cos(solar zenith)
        const fres = Math.pow(1 - nz, 2.4);

        // Ocean diffuse ramp: deep night (3,7,16) -> marine (12,48,92) -> tropical sapphire (24,92,148)
        const day = smoothstep(-0.08, 0.85, d);
        let rr, gg, bb;
        if (day < 0.5) {
          const u = day * 2;
          rr = 3 + 9 * u;
          gg = 7 + 41 * u;
          bb = 16 + 76 * u;
        } else {
          const u = (day - 0.5) * 2;
          rr = 12 + 12 * u;
          gg = 48 + 44 * u;
          bb = 92 + 56 * u;
        }

        // Cox-Munk two-lobe ocean specular sun-glint
        const glintVis = smoothstep(-0.04, 0.2, d);
        if (glintVis > 0.001) {
          const ndh = Math.max(0, px * hx + py * hy + nz * hz);
          const gBroad = Math.pow(ndh, 26) * 0.3 * glintVis;
          const gCore = Math.pow(ndh, 145) * 0.78 * glintVis;
          const gTot = gBroad + gCore;
          if (gTot > 0.001) {
            const highSun = smoothstep(0.02, 0.28, d);
            const sr = 255;
            const sg = 185 + 59 * highSun;
            const sb = 115 + 107 * highSun;
            rr += sr * gTot;
            gg += sg * gTot;
            bb += sb * gTot;
          }
        }

        // Twilight Chappuis/Rayleigh terminator belt
        const tw1 = (d - 0.01) / 0.085;
        const twWarm = Math.exp(-(tw1 * tw1));
        const tw2 = (d + 0.08) / 0.09;
        const twDeep = Math.exp(-(tw2 * tw2));
        const twWeight = 0.22 + 0.58 * fres;
        rr += (248 * twWarm * 0.48 + 118 * twDeep * 0.32) * twWeight;
        gg += (112 * twWarm * 0.48 + 42 * twDeep * 0.32) * twWeight;
        bb += (48 * twWarm * 0.48 + 96 * twDeep * 0.32) * twWeight;

        // Rayleigh atmospheric blue limb scatter on sunlit hemisphere
        const rayleigh = fres * smoothstep(-0.12, 0.42, d);
        rr += 68 * rayleigh * 0.85;
        gg += 162 * rayleigh * 0.85;
        bb += 255 * rayleigh * 0.85;

        data[o] = rr > 255 ? 255 : rr;
        data[o + 1] = gg > 255 ? 255 : gg;
        data[o + 2] = bb > 255 ? 255 : bb;
        data[o + 3] = Math.round(255 * smoothstep(1.0, 0.975, r));
      }
    }

    this._shadeCtx.putImageData(this._shadeImg, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this._shadeCanvas, this.cx - R, this.cy - R, R * 2, R * 2);
    ctx.restore();
  }

  _drawOuterAtmosphere(ctx, R, sun) {
    const sv = sun.view;
    const xyLen = Math.hypot(sv.x, sv.y) || 1;
    const dx = sv.x / xyLen;
    const dy = -sv.y / xyLen;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Subtle upper-atmosphere night-side airglow
    const baseAirglow = ctx.createRadialGradient(this.cx, this.cy, R * 0.95, this.cx, this.cy, R * 1.18);
    baseAirglow.addColorStop(0, 'rgba(56, 189, 248, 0.045)');
    baseAirglow.addColorStop(0.55, 'rgba(56, 189, 248, 0.015)');
    baseAirglow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = baseAirglow;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R * 1.18, 0, Math.PI * 2);
    ctx.fill();

    // Directional Rayleigh blue sky scatter on the sunlit limb
    const dayBias = Math.max(0.15, (sv.z + 1) * 0.5);
    const sx = this.cx + dx * R * 0.92;
    const sy = this.cy + dy * R * 0.92;
    const rayGrad = ctx.createRadialGradient(sx, sy, R * 0.05, sx, sy, R * 1.35);
    rayGrad.addColorStop(0, `rgba(72, 178, 255, ${(0.22 * dayBias).toFixed(3)})`);
    rayGrad.addColorStop(0.45, `rgba(56, 152, 238, ${(0.09 * dayBias).toFixed(3)})`);
    rayGrad.addColorStop(1, 'rgba(56, 152, 238, 0)');
    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R * 1.28, 0, Math.PI * 2);
    ctx.fill();

    // Chappuis crimson-orange refraction glow along the terminator limb
    const tx = -dy;
    const ty = dx;
    const termShift = sv.z * R * 0.55;
    for (const side of [-1, 1]) {
      const gx = this.cx + tx * R * 0.95 * side - dx * termShift * 0.35;
      const gy = this.cy + ty * R * 0.95 * side - dy * termShift * 0.35;
      const twGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.65);
      twGrad.addColorStop(0, 'rgba(251, 130, 62, 0.14)');
      twGrad.addColorStop(0.4, 'rgba(244, 114, 72, 0.05)');
      twGrad.addColorStop(1, 'rgba(244, 114, 72, 0)');
      ctx.fillStyle = twGrad;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, R * 1.26, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawDirectionalInnerRim(ctx, R, sv) {
    const xyLen = Math.hypot(sv.x, sv.y) || 1;
    const dx = sv.x / xyLen;
    const dy = -sv.y / xyLen;

    ctx.save();
    // Day-weighted upper-troposphere Fresnel scatter
    const dayRim = ctx.createRadialGradient(
      this.cx + dx * R * 0.25,
      this.cy + dy * R * 0.25,
      R * 0.72,
      this.cx,
      this.cy,
      R
    );
    dayRim.addColorStop(0, 'rgba(72, 178, 255, 0)');
    dayRim.addColorStop(0.86, 'rgba(72, 178, 255, 0.04)');
    dayRim.addColorStop(1, 'rgba(135, 206, 255, 0.22)');
    ctx.fillStyle = dayRim;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawDirectionalHorizonStroke(ctx, R, sv) {
    const xyLen = Math.hypot(sv.x, sv.y) || 1;
    const dx = sv.x / xyLen;
    const dy = -sv.y / xyLen;
    const grad = ctx.createLinearGradient(
      this.cx + dx * R,
      this.cy + dy * R,
      this.cx - dx * R,
      this.cy - dy * R
    );
    grad.addColorStop(0, 'rgba(135, 206, 255, 0.42)');
    grad.addColorStop(0.48, 'rgba(251, 152, 82, 0.28)');
    grad.addColorStop(0.75, 'rgba(71, 85, 105, 0.14)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.22)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawSunDisc(ctx, R, sun, now) {
    const { x, y } = sun.screen;
    const coreR = Math.max(9, R * 0.045);
    const t = now * 0.0004;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 1. Multi-layered outer coronal aureole
    const aureole = ctx.createRadialGradient(x, y, 0, x, y, coreR * 32);
    aureole.addColorStop(0, 'rgba(255, 245, 224, 0.42)');
    aureole.addColorStop(0.08, 'rgba(255, 222, 168, 0.2)');
    aureole.addColorStop(0.28, 'rgba(255, 192, 130, 0.065)');
    aureole.addColorStop(0.6, 'rgba(255, 168, 110, 0.018)');
    aureole.addColorStop(1, 'rgba(255, 150, 95, 0)');
    ctx.fillStyle = aureole;
    ctx.beginPath();
    ctx.arc(x, y, coreR * 32, 0, Math.PI * 2);
    ctx.fill();

    // 2. Tilted elliptical K-corona streamer belt
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.34 + 0.03 * Math.sin(t * 0.7));
    ctx.scale(2.8, 0.85);
    const kCorona = ctx.createRadialGradient(0, 0, coreR * 0.3, 0, 0, coreR * 6.8);
    kCorona.addColorStop(0, 'rgba(255, 244, 225, 0.22)');
    kCorona.addColorStop(0.35, 'rgba(255, 218, 175, 0.08)');
    kCorona.addColorStop(1, 'rgba(255, 195, 140, 0)');
    ctx.fillStyle = kCorona;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Twelve softly breathing coronal plumes
    ctx.lineCap = 'round';
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + 0.14;
      const pulse = 0.88 + 0.12 * Math.sin(t + k * 1.37);
      const len = coreR * (5.5 + (k % 3) * 2.8) * pulse;
      const ex = x + Math.cos(ang) * len;
      const ey = y + Math.sin(ang) * len;
      const pg = ctx.createLinearGradient(x, y, ex, ey);
      pg.addColorStop(0, 'rgba(255, 248, 232, 0.22)');
      pg.addColorStop(0.35, 'rgba(255, 226, 180, 0.07)');
      pg.addColorStop(1, 'rgba(255, 200, 150, 0)');
      ctx.strokeStyle = pg;
      ctx.lineWidth = coreR * (0.28 + (k % 2) * 0.16);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // 4. Primary 4-point + secondary 4-point Fraunhofer diffraction spikes
    for (let k = 0; k < 4; k++) {
      const isPrimary = k < 2;
      const ang = isPrimary ? k * (Math.PI * 0.5) + 0.12 : (k - 2) * (Math.PI * 0.5) + Math.PI * 0.25 + 0.12;
      const len = coreR * (isPrimary ? 18 : 10);
      const sg = ctx.createLinearGradient(
        x - Math.cos(ang) * len,
        y - Math.sin(ang) * len,
        x + Math.cos(ang) * len,
        y + Math.sin(ang) * len
      );
      sg.addColorStop(0, 'rgba(255, 245, 225, 0)');
      sg.addColorStop(0.5, isPrimary ? 'rgba(255, 250, 238, 0.34)' : 'rgba(255, 240, 215, 0.16)');
      sg.addColorStop(1, 'rgba(255, 245, 225, 0)');
      ctx.strokeStyle = sg;
      ctx.lineWidth = isPrimary ? 1.35 : 0.85;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Horizontal anamorphic streak
    const streakLen = coreR * 22;
    const hStreak = ctx.createLinearGradient(x - streakLen, y, x + streakLen, y);
    hStreak.addColorStop(0, 'rgba(200, 226, 255, 0)');
    hStreak.addColorStop(0.5, 'rgba(235, 244, 255, 0.16)');
    hStreak.addColorStop(1, 'rgba(200, 226, 255, 0)');
    ctx.strokeStyle = hStreak;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - streakLen, y);
    ctx.lineTo(x + streakLen, y);
    ctx.stroke();

    // 5. Photosphere with Eddington limb darkening
    const disc = ctx.createRadialGradient(x, y, 0, x, y, coreR * 1.9);
    disc.addColorStop(0, 'rgba(255, 255, 254, 1)');
    disc.addColorStop(0.4, 'rgba(255, 251, 238, 0.99)');
    disc.addColorStop(0.52, 'rgba(255, 230, 178, 0.78)');
    disc.addColorStop(0.68, 'rgba(255, 198, 128, 0.25)');
    disc.addColorStop(1, 'rgba(255, 180, 110, 0)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, coreR * 1.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawLimbGlow(ctx, R, sun) {
    const sv = sun.view;
    const behind = Math.max(0, -sv.z);
    if (behind < 0.02 && sun.limbProximity < 0.05) return;

    const dLen = Math.hypot(sv.x, sv.y) || 1;
    const dx = sv.x / dLen;
    const dy = -sv.y / dLen;

    ctx.save();
    // Annulus clip: only the atmosphere shell around the limb
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R * 1.34, 0, Math.PI * 2);
    ctx.arc(this.cx, this.cy, R * 0.94, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    // Directional forward-scattering crescent where sunlight grazes the limb
    if (behind >= 0.02) {
      const k = Math.pow(behind, 0.7) * (1 - smoothstep(0.9, 1.0, behind) * 0.4);
      const gx = this.cx + dx * R;
      const gy = this.cy + dy * R;
      const dir = ctx.createRadialGradient(gx, gy, 0, gx, gy, R * 0.85);
      dir.addColorStop(0, `rgba(255, 226, 180, ${(0.48 * k).toFixed(3)})`);
      dir.addColorStop(0.25, `rgba(255, 168, 108, ${(0.2 * k).toFixed(3)})`);
      dir.addColorStop(0.6, `rgba(120, 180, 255, ${(0.07 * k).toFixed(3)})`);
      dir.addColorStop(1, 'rgba(120, 180, 255, 0)');
      ctx.fillStyle = dir;
      ctx.fillRect(this.cx - R * 1.4, this.cy - R * 1.4, R * 2.8, R * 2.8);
    }

    // Full "eclipse ring" when the sun sits almost directly behind Earth
    const ringK = smoothstep(0.88, 1.0, behind);
    if (ringK > 0.01) {
      const ring = ctx.createRadialGradient(this.cx, this.cy, R * 0.97, this.cx, this.cy, R * 1.18);
      ring.addColorStop(0, `rgba(255, 236, 205, ${(0.52 * ringK).toFixed(3)})`);
      ring.addColorStop(0.3, `rgba(255, 165, 105, ${(0.22 * ringK).toFixed(3)})`);
      ring.addColorStop(1, 'rgba(255, 145, 85, 0)');
      ctx.fillStyle = ring;
      ctx.fillRect(this.cx - R * 1.4, this.cy - R * 1.4, R * 2.8, R * 2.8);
    }

    // Diamond Ring chromospheric/refraction flare at the limb contact point
    if (sun.limbProximity > 0.05) {
      const lx = this.cx + dx * R * 1.01;
      const ly = this.cy + dy * R * 1.01;
      const lp = sun.limbProximity;
      const dRing = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.28);
      dRing.addColorStop(0, `rgba(255, 255, 252, ${(0.95 * lp).toFixed(3)})`);
      dRing.addColorStop(0.18, `rgba(255, 224, 165, ${(0.55 * lp).toFixed(3)})`);
      dRing.addColorStop(0.5, `rgba(255, 148, 92, ${(0.18 * lp).toFixed(3)})`);
      dRing.addColorStop(1, 'rgba(255, 120, 70, 0)');
      ctx.fillStyle = dRing;
      ctx.beginPath();
      ctx.arc(lx, ly, R * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawTerminatorAndZenith(ctx, R) {
    ctx.save();
    ctx.setLineDash([4, 6]);
    this._drawSphericalRing(
      ctx,
      R,
      this.sunWorld,
      Math.PI * 0.5,
      'rgba(251, 191, 36, 0.16)',
      0.85
    );
    ctx.setLineDash([]);

    const p = this._projectLatLon(this.subsolar.lat, this.subsolar.lon);
    if (p.z > 0.04) {
      const zx = this.cx + p.x * R;
      const zy = this.cy - p.y * R;
      const a = smoothstep(0.04, 0.22, p.z) * 0.85;
      ctx.fillStyle = `rgba(253, 224, 130, ${a.toFixed(3)})`;
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☉', zx, zy);
    }
    ctx.restore();
  }

  _drawSolarGlareVeil(ctx, R, sun) {
    const pos = sun.screen;
    const vis = sun.visibility;
    const glareStrength = Math.max(vis, sun.limbProximity * 0.75);
    if (glareStrength <= 0.01) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Foreground glare bloom bleeding softly across Earth's horizon
    const bloomR = R * 0.9;
    const bloom = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, bloomR);
    bloom.addColorStop(0, `rgba(255, 245, 225, ${(0.22 * glareStrength).toFixed(3)})`);
    bloom.addColorStop(0.25, `rgba(255, 210, 155, ${(0.085 * glareStrength).toFixed(3)})`);
    bloom.addColorStop(0.65, `rgba(255, 175, 115, ${(0.025 * glareStrength).toFixed(3)})`);
    bloom.addColorStop(1, 'rgba(255, 160, 100, 0)');
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, bloomR, 0, Math.PI * 2);
    ctx.fill();

    // Coated-lens internal ghost reflections
    if (vis > 0.01) {
      const vx = this.cx - pos.x;
      const vy = this.cy - pos.y;
      const ghosts = [
        { t: 0.55, r: R * 0.055, c: '255, 210, 150', a: 0.075 },
        { t: 1.25, r: R * 0.095, c: '140, 200, 255', a: 0.055 },
        { t: 1.62, r: R * 0.038, c: '255, 180, 120', a: 0.085 },
        { t: 2.12, r: R * 0.145, c: '160, 255, 210', a: 0.035 }
      ];
      for (const g of ghosts) {
        const gx = pos.x + vx * g.t;
        const gy = pos.y + vy * g.t;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, g.r);
        grad.addColorStop(0, `rgba(${g.c}, 0)`);
        grad.addColorStop(0.7, `rgba(${g.c}, ${(g.a * vis).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${g.c}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, g.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  _drawCoastlines(ctx, R, frontSide) {
    if (this.showSun && frontSide) {
      const [sxw, syw, szw] = this.sunWorld;
      const buckets = [
        { style: 'rgba(186, 218, 242, 0.42)', segs: [] }, // sunlit
        { style: 'rgba(251, 156, 82, 0.36)', segs: [] },  // twilight
        { style: 'rgba(71, 85, 105, 0.2)', segs: [] }     // night
      ];

      for (let i = 0; i < WORLD_POLYGONS.length; i++) {
        const ring = WORLD_POLYGONS[i];
        let prev = null;
        for (let j = 0; j < ring.length; j++) {
          const [lon, lat] = ring[j];
          const p = this._projectLatLon(lat, lon);
          if (p.z >= -0.02) {
            const sx = this.cx + p.x * R;
            const sy = this.cy - p.y * R;
            if (prev) {
              const midLat = (prev.lat + lat) * 0.5 * DEG2RAD;
              const midLon = (prev.lon + lon) * 0.5 * DEG2RAD;
              const cPhi = Math.cos(midLat);
              const d =
                cPhi * Math.sin(midLon) * sxw +
                Math.sin(midLat) * syw +
                cPhi * Math.cos(midLon) * szw;
              const b = d > 0.08 ? 0 : d > -0.08 ? 1 : 2;
              buckets[b].segs.push(prev.sx, prev.sy, sx, sy);
            }
            prev = { sx, sy, lat, lon };
          } else {
            prev = null;
          }
        }
      }

      ctx.lineWidth = 0.95;
      for (const bucket of buckets) {
        if (bucket.segs.length === 0) continue;
        ctx.strokeStyle = bucket.style;
        ctx.beginPath();
        for (let k = 0; k < bucket.segs.length; k += 4) {
          ctx.moveTo(bucket.segs[k], bucket.segs[k + 1]);
          ctx.lineTo(bucket.segs[k + 2], bucket.segs[k + 3]);
        }
        ctx.stroke();
      }
      return;
    }

    ctx.strokeStyle = frontSide
      ? 'rgba(148, 163, 184, 0.34)'
      : 'rgba(148, 163, 184, 0.055)';
    ctx.lineWidth = frontSide ? 0.95 : 0.65;

    for (let i = 0; i < WORLD_POLYGONS.length; i++) {
      const ring = WORLD_POLYGONS[i];
      ctx.beginPath();
      let drawing = false;
      for (let j = 0; j < ring.length; j++) {
        const [lon, lat] = ring[j];
        const p = this._projectLatLon(lat, lon);
        const visible = frontSide ? p.z >= -0.02 : p.z < 0;
        if (visible) {
          const sx = this.cx + p.x * R;
          const sy = this.cy - p.y * R;
          if (!drawing) {
            ctx.moveTo(sx, sy);
            drawing = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        } else {
          drawing = false;
        }
      }
      ctx.stroke();
    }
  }

  _drawStrikes(ctx, R, now) {
    const newestThreshold = Math.max(0, this.strikes.length - 3);

    for (let i = 0; i < this.strikes.length; i++) {
      const s = this.strikes[i];
      const age = now - s.createdAt;
      const t = Math.min(1, age / s.duration);
      const pv = this._rotateVec(s.vec);

      // Skip strikes far behind the horizon, except subtle limb halo near terminator
      if (pv.z < -0.06) continue;

      const limbFade = pv.z < 0.12 ? Math.max(0, (pv.z + 0.06) / 0.18) : 1.0;
      const sx = this.cx + pv.x * R;
      const sy = this.cy - pv.y * R;

      const isPositive = Number(s.pol) > 0;
      const isBurstOrManual = s.source === 'manual' || s.source === 'burst';
      const primaryRgb = isPositive
        ? '245, 158, 11' // Warm Amber (+CG)
        : isBurstOrManual
        ? '125, 211, 252' // Bright Ice Cyan
        : '56, 189, 248'; // Phosphor Cyan (-CG)

      // 7a. Geodesic detector station triangulation arcs (first 1.8s)
      if (this.showArcs && age < 1800 && s.stations.length > 0) {
        const arcAlpha = (1 - age / 1800) * 0.38 * limbFade;
        this._drawStationArcs(ctx, R, s.vec, s.stations, arcAlpha, primaryRgb);
      }

      // 7b. Spherical surface shockwave ripples (3 staggered rings over 5.6s)
      const ringCount = 3;
      for (let rIdx = 0; rIdx < ringCount; rIdx++) {
        const delayFrac = rIdx * 0.12;
        if (t <= delayFrac) continue;
        const rt = Math.min(1, (t - delayFrac) / (1 - delayFrac));
        const maxAngleRad = (0.075 + rIdx * 0.04) * Math.pow(rt, 0.62);
        const alpha = (1 - rt) * (0.58 - rIdx * 0.14) * limbFade;
        if (alpha > 0.01) {
          this._drawSphericalRing(
            ctx,
            R,
            s.vec,
            maxAngleRad,
            `rgba(${primaryRgb}, ${alpha.toFixed(3)})`,
            1.35 - rIdx * 0.25
          );
        }
      }

      // 7c. 3D Vertical Ionospheric Bolt Spike (first 650ms)
      if (age < 650 && pv.z > 0) {
        const spikeT = age / 650;
        const spikeHeight = (0.08 + 0.08 * (1 - spikeT)) * R * (1 - spikeT * 0.6);
        const ex = this.cx + pv.x * (R + spikeHeight);
        const ey = this.cy - pv.y * (R + spikeHeight);
        const spikeAlpha = (1 - spikeT) * 0.9 * limbFade;

        const spikeGrad = ctx.createLinearGradient(sx, sy, ex, ey);
        spikeGrad.addColorStop(0, `rgba(255, 255, 255, ${spikeAlpha.toFixed(3)})`);
        spikeGrad.addColorStop(0.5, `rgba(${primaryRgb}, ${(spikeAlpha * 0.8).toFixed(3)})`);
        spikeGrad.addColorStop(1, `rgba(${primaryRgb}, 0)`);

        ctx.strokeStyle = spikeGrad;
        ctx.lineWidth = 2.0 * (1 - spikeT * 0.5);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }

      // 7d. Glowing core flash node + night-side cloud-top illumination
      const coreAlpha = Math.pow(1 - t, 1.35) * limbFade;
      const coreRadius = age < 220 ? 3.8 + (1 - age / 220) * 5.2 : 2.2 + (1 - t) * 2.2;

      if (this.showSun && age < 900) {
        const solarDot =
          s.vec[0] * this.sunWorld[0] +
          s.vec[1] * this.sunWorld[1] +
          s.vec[2] * this.sunWorld[2];
        if (solarDot < -0.04) {
          const nightFade = Math.min(1, (-solarDot - 0.04) / 0.16);
          const flashFade = Math.pow(1 - age / 900, 1.8);
          const cloudR = coreRadius * 6.5;
          const cloudAlpha = 0.34 * nightFade * flashFade * limbFade;
          const cloudFlash = ctx.createRadialGradient(sx, sy, 0, sx, sy, cloudR);
          cloudFlash.addColorStop(0, `rgba(215, 232, 255, ${cloudAlpha.toFixed(3)})`);
          cloudFlash.addColorStop(0.35, `rgba(${primaryRgb}, ${(cloudAlpha * 0.65).toFixed(3)})`);
          cloudFlash.addColorStop(1, `rgba(${primaryRgb}, 0)`);
          ctx.fillStyle = cloudFlash;
          ctx.beginPath();
          ctx.arc(sx, sy, cloudR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, coreRadius * 3.4);
      glow.addColorStop(0, `rgba(255, 255, 255, ${(coreAlpha * 0.95).toFixed(3)})`);
      glow.addColorStop(0.28, `rgba(${primaryRgb}, ${(coreAlpha * 0.72).toFixed(3)})`);
      glow.addColorStop(1, `rgba(${primaryRgb}, 0)`);

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, coreRadius * 3.4, 0, Math.PI * 2);
      ctx.fill();

      // 7e. Micro telemetry tag on the 3 freshest front-facing strikes
      if (i >= newestThreshold && pv.z > 0.25 && age < 3200 && s.noteInfo) {
        const labelAlpha = Math.min(1, (1 - age / 3200) * 1.4) * 0.85;
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillStyle = `rgba(226, 232, 240, ${labelAlpha.toFixed(3)})`;
        ctx.fillText(
          `${s.noteInfo.noteName} · ${s.lat.toFixed(1)}°`,
          sx + 10,
          sy - 6
        );
      }
    }
  }

  _drawSphericalRing(ctx, R, centerVec, angularRadius, strokeStyle, lineWidth) {
    const [nx, ny, nz] = centerVec;
    // Construct orthonormal tangent basis around unit normal N
    const refX = Math.abs(ny) > 0.92 ? 1 : 0;
    const refY = Math.abs(ny) > 0.92 ? 0 : 1;
    const refZ = 0;

    // T1 = normalize(cross(ref, N))
    let t1x = refY * nz - refZ * ny;
    let t1y = refZ * nx - refX * nz;
    let t1z = refX * ny - refY * nx;
    const t1Len = Math.hypot(t1x, t1y, t1z) || 1;
    t1x /= t1Len;
    t1y /= t1Len;
    t1z /= t1Len;

    // T2 = cross(N, T1)
    const t2x = ny * t1z - nz * t1y;
    const t2y = nz * t1x - nx * t1z;
    const t2z = nx * t1y - ny * t1x;

    const cosA = Math.cos(angularRadius);
    const sinA = Math.sin(angularRadius);

    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    const segments = 28;
    let drawing = false;
    for (let k = 0; k <= segments; k++) {
      const th = (k / segments) * Math.PI * 2;
      const cosT = Math.cos(th);
      const sinT = Math.sin(th);

      const px = nx * cosA + (t1x * cosT + t2x * sinT) * sinA;
      const py = ny * cosA + (t1y * cosT + t2y * sinT) * sinA;
      const pz = nz * cosA + (t1z * cosT + t2z * sinT) * sinA;

      const pv = this._rotateVec([px, py, pz]);
      if (pv.z >= -0.03) {
        const sx = this.cx + pv.x * R;
        const sy = this.cy - pv.y * R;
        if (!drawing) {
          ctx.moveTo(sx, sy);
          drawing = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      } else {
        drawing = false;
      }
    }
    ctx.stroke();
  }

  _drawStationArcs(ctx, R, strikeVec, stations, alpha, rgb) {
    if (alpha <= 0.01) return;
    ctx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 0.85;

    for (let s = 0; s < stations.length; s++) {
      const stVec = stations[s].vec;
      const dot = Math.max(
        -1,
        Math.min(1, strikeVec[0] * stVec[0] + strikeVec[1] * stVec[1] + strikeVec[2] * stVec[2])
      );
      const omega = Math.acos(dot);
      if (omega < 0.01 || omega > 1.6) continue;

      const sinOmega = Math.sin(omega);
      ctx.beginPath();
      let drawing = false;
      const steps = 14;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        const w1 = Math.sin((1 - f) * omega) / sinOmega;
        const w2 = Math.sin(f * omega) / sinOmega;
        const elev = 1 + 0.035 * Math.sin(f * Math.PI);

        const px = (strikeVec[0] * w1 + stVec[0] * w2) * elev;
        const py = (strikeVec[1] * w1 + stVec[1] * w2) * elev;
        const pz = (strikeVec[2] * w1 + stVec[2] * w2) * elev;

        const pv = this._rotateVec([px, py, pz]);
        if (pv.z >= -0.02) {
          const sx = this.cx + pv.x * R;
          const sy = this.cy - pv.y * R;
          if (!drawing) {
            ctx.moveTo(sx, sy);
            drawing = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        } else {
          drawing = false;
        }
      }
      ctx.stroke();
    }
  }
}
