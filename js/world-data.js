/**
 * World vector coastline polygons, Fibonacci stipple matrix generator,
 * geographic region classifier, and meteorological lightning hotspots.
 */

export const WORLD_POLYGONS = [
  // North America + Central America
  [
    [-168, 65.6], [-162, 66.5], [-166, 68.5], [-156.5, 71.3], [-141, 70.0],
    [-133, 69.5], [-125, 70.0], [-110, 68.5], [-96, 69.5], [-85, 69.5],
    [-81, 63.0], [-78, 53.0], [-82, 51.5], [-86, 56.0], [-93, 58.8],
    [-95, 62.5], [-90, 63.8], [-78, 62.5], [-66, 60.5], [-64, 58.0],
    [-55.6, 52.0], [-60, 46.0], [-66, 44.5], [-70, 41.8], [-74, 40.5],
    [-75.5, 35.5], [-81, 31.0], [-80.2, 25.3], [-82.5, 27.8], [-84, 30.0],
    [-89, 29.0], [-94, 29.5], [-97.2, 26.0], [-96, 19.2], [-90.5, 21.3],
    [-87, 21.4], [-88.2, 16.0], [-83.5, 15.0], [-83, 10.5], [-78.5, 8.8],
    [-77.5, 7.5], [-80, 8.4], [-85, 10.5], [-92, 14.5], [-98, 16.0],
    [-105.5, 20.5], [-110, 23.0], [-114, 31.5], [-117, 32.5], [-122.4, 37.8],
    [-124.5, 42.8], [-124.7, 48.3], [-130, 54.0], [-136, 58.0], [-146, 60.5],
    [-152, 59.5], [-160, 55.5], [-164, 54.8], [-162, 58.5], [-166, 60.0],
    [-165, 63.5], [-168, 65.6]
  ],
  // Greenland
  [
    [-72, 77.5], [-62, 81.5], [-34, 83.4], [-18, 81.5], [-19, 75.0],
    [-23, 70.0], [-36, 65.5], [-44, 60.0], [-51, 64.0], [-53, 69.5],
    [-57, 74.5], [-68, 76.2], [-72, 77.5]
  ],
  // Baffin Island
  [
    [-86, 73.5], [-77, 72.5], [-68, 69.0], [-63, 65.0], [-66, 62.5],
    [-74, 64.5], [-78, 66.5], [-82, 70.0], [-86, 73.5]
  ],
  // Victoria Island
  [
    [-118, 71.5], [-108, 72.5], [-103, 69.5], [-108, 68.7], [-115, 69.5], [-118, 71.5]
  ],
  // Cuba
  [
    [-84.8, 21.8], [-82.0, 23.1], [-77.5, 21.6], [-74.2, 20.2], [-77.5, 19.8],
    [-81.5, 22.0], [-84.8, 21.8]
  ],
  // Hispaniola
  [
    [-74.4, 18.5], [-71.5, 19.9], [-68.4, 18.6], [-71.2, 17.6], [-74.4, 18.5]
  ],
  // South America
  [
    [-77.5, 7.5], [-75.5, 10.5], [-71.5, 12.2], [-66.0, 10.6], [-61.8, 10.0],
    [-56.0, 6.0], [-50.0, 1.5], [-48.0, -1.0], [-41.0, -2.8], [-35.2, -5.8],
    [-34.8, -8.2], [-38.5, -13.0], [-40.0, -20.5], [-43.2, -23.0], [-48.5, -26.5],
    [-50.5, -30.5], [-53.5, -34.0], [-57.5, -38.0], [-62.0, -40.5], [-65.0, -43.5],
    [-67.5, -47.0], [-68.5, -52.5], [-67.0, -55.0], [-71.5, -54.5], [-74.8, -50.0],
    [-73.5, -43.5], [-71.8, -36.5], [-71.5, -30.0], [-70.5, -20.0], [-75.5, -15.0],
    [-77.5, -11.5], [-81.3, -4.7], [-79.8, -2.2], [-78.5, 3.8], [-77.5, 7.5]
  ],
  // Africa
  [
    [-5.8, 35.8], [3.0, 36.8], [10.5, 37.2], [11.5, 33.0], [20.0, 32.5],
    [25.0, 31.6], [32.5, 31.3], [34.5, 28.0], [38.0, 21.5], [43.3, 12.6],
    [51.3, 11.8], [49.0, 6.0], [41.5, -1.5], [40.5, -10.5], [35.0, -18.5],
    [35.4, -24.0], [31.5, -29.8], [26.0, -34.0], [18.4, -34.4], [15.0, -26.0],
    [12.0, -17.0], [13.2, -9.0], [11.5, -4.0], [9.3, 4.0], [3.5, 6.4],
    [-3.0, 5.1], [-8.0, 4.5], [-13.5, 9.0], [-17.5, 14.7], [-16.5, 21.0],
    [-13.0, 27.5], [-9.5, 31.5], [-5.8, 35.8]
  ],
  // Madagascar
  [
    [49.3, -12.0], [50.4, -15.5], [47.5, -24.5], [44.0, -25.2], [43.3, -21.0],
    [45.0, -16.0], [49.3, -12.0]
  ],
  // Great Britain & Ireland
  [
    [-5.5, 50.1], [-3.0, 51.3], [-4.8, 53.3], [-3.5, 55.0], [-6.0, 56.5],
    [-5.0, 58.6], [-2.0, 57.7], [-1.5, 55.0], [1.7, 52.5], [1.4, 51.1],
    [-2.0, 50.6], [-5.5, 50.1]
  ],
  [
    [-10.2, 51.8], [-9.5, 54.3], [-6.2, 55.2], [-6.0, 53.0], [-7.5, 52.0], [-10.2, 51.8]
  ],
  // Iceland
  [
    [-24.0, 65.5], [-18.5, 66.2], [-13.6, 65.2], [-16.0, 63.8], [-22.5, 63.9], [-24.0, 65.5]
  ],
  // Eurasia (Europe + Asia contiguous mainland)
  [
    [-9.4, 38.7], [-9.0, 43.0], [-2.0, 43.4], [-4.5, 48.3], [2.0, 51.0],
    [8.5, 54.0], [8.2, 57.0], [10.5, 57.7], [12.5, 55.7], [10.8, 59.5],
    [5.0, 60.5], [7.0, 63.5], [15.0, 68.5], [25.0, 71.0], [31.0, 70.0],
    [40.0, 67.5], [44.0, 65.5], [58.0, 69.5], [68.0, 71.5], [74.0, 72.8],
    [88.0, 73.5], [104.0, 77.5], [115.0, 73.5], [135.0, 71.5], [158.0, 70.5],
    [178.0, 66.5], [170.0, 60.5], [162.5, 53.0], [156.7, 51.0], [159.0, 59.0],
    [143.0, 59.0], [136.0, 55.0], [141.0, 52.0], [135.0, 43.5], [129.0, 35.1],
    [126.5, 37.5], [122.0, 39.0], [119.5, 35.0], [121.8, 31.2], [120.5, 27.0],
    [114.2, 22.3], [108.5, 21.5], [109.2, 13.0], [105.0, 8.6], [100.5, 13.5],
    [103.8, 1.3], [100.2, 5.4], [98.3, 11.0], [96.5, 16.5], [92.2, 21.0],
    [86.5, 20.0], [80.2, 13.0], [77.5, 8.1], [72.8, 19.0], [68.8, 23.0],
    [61.5, 25.2], [56.3, 26.8], [51.0, 29.8], [56.2, 25.5], [59.8, 22.5],
    [52.0, 15.5], [44.0, 12.8], [39.0, 21.0], [34.8, 29.5], [32.5, 31.3],
    [36.0, 36.5], [27.0, 37.0], [26.2, 40.5], [23.8, 38.0], [21.5, 37.0],
    [19.5, 40.5], [14.0, 45.5], [12.5, 44.0], [16.0, 41.0], [18.4, 40.0],
    [15.6, 38.0], [12.0, 42.0], [8.5, 44.4], [4.5, 43.3], [0.0, 39.0],
    [-5.3, 36.1], [-9.4, 38.7]
  ],
  // Sri Lanka
  [
    [80.0, 9.7], [81.8, 7.6], [80.6, 6.0], [79.8, 7.3], [80.0, 9.7]
  ],
  // Japan
  [
    [130.5, 31.5], [131.0, 34.0], [135.5, 34.5], [139.8, 35.4], [141.0, 38.5],
    [141.5, 41.5], [145.5, 43.5], [142.0, 45.4], [139.8, 42.5], [137.0, 37.0],
    [132.0, 34.8], [130.5, 31.5]
  ],
  // Taiwan
  [
    [121.5, 25.2], [121.6, 23.0], [120.8, 22.0], [120.1, 23.5], [121.5, 25.2]
  ],
  // Philippines
  [
    [120.0, 18.4], [122.4, 17.5], [124.0, 13.0], [126.4, 7.5], [124.0, 6.2],
    [122.0, 8.0], [120.0, 14.5], [120.0, 18.4]
  ],
  // Sumatra
  [
    [95.3, 5.5], [99.5, 3.0], [104.5, -2.5], [105.8, -5.8], [102.0, -4.0],
    [97.5, 1.5], [95.3, 5.5]
  ],
  // Java
  [
    [105.5, -6.1], [114.5, -7.8], [114.0, -8.7], [106.0, -7.2], [105.5, -6.1]
  ],
  // Borneo
  [
    [109.5, 1.5], [115.0, 5.0], [118.5, 6.5], [117.5, 1.0], [116.0, -3.5],
    [111.5, -3.3], [109.0, -1.0], [109.5, 1.5]
  ],
  // Sulawesi
  [
    [119.2, -5.5], [121.0, -1.0], [125.0, 1.5], [122.5, -1.5], [122.5, -4.8],
    [119.2, -5.5]
  ],
  // New Guinea
  [
    [131.0, -1.5], [136.0, -2.5], [141.0, -2.6], [148.0, -8.5], [150.5, -10.5],
    [143.5, -8.8], [138.0, -8.2], [133.5, -4.2], [131.0, -1.5]
  ],
  // Australia
  [
    [113.5, -22.0], [122.0, -17.5], [130.5, -12.4], [136.5, -12.3], [136.0, -15.5],
    [141.0, -17.5], [142.5, -10.8], [145.5, -15.5], [150.5, -22.5], [153.6, -28.2],
    [151.2, -34.0], [149.8, -37.5], [144.8, -38.4], [138.5, -35.5], [135.5, -34.8],
    [129.0, -31.8], [121.8, -33.9], [115.1, -34.3], [115.5, -31.5], [113.5, -22.0]
  ],
  // Tasmania
  [
    [144.7, -40.8], [148.3, -41.2], [147.5, -43.5], [145.2, -42.5], [144.7, -40.8]
  ],
  // New Zealand
  [
    [172.7, -34.4], [178.5, -37.7], [175.3, -41.4], [172.8, -40.8], [174.3, -36.8],
    [172.7, -34.4]
  ],
  [
    [174.0, -41.5], [170.5, -45.8], [166.5, -46.2], [168.5, -43.5], [172.5, -40.8],
    [174.0, -41.5]
  ]
];

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isLandPoint(lat, lon) {
  if (lat < -60 || lat > 83) return false;
  for (let p = 0; p < WORLD_POLYGONS.length; p++) {
    if (pointInRing(lon, lat, WORLD_POLYGONS[p])) return true;
  }
  return false;
}

/**
 * Generates an evenly distributed spherical Fibonacci lattice filtered to land polygons.
 * @param {number} totalSamples
 * @returns {Array<[number, number]>} Array of [lon, lat] degrees
 */
export function generateLandDots(totalSamples = 4200) {
  const dots = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < totalSamples; i++) {
    const y = 1 - (i / (totalSamples - 1)) * 2;
    const lat = (Math.asin(y) * 180) / Math.PI;
    if (lat < -58 || lat > 82) continue;
    const theta = goldenAngle * i;
    let lon = (((theta * 180) / Math.PI) % 360) - 180;
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    if (isLandPoint(lat, lon)) {
      dots.push([lon, lat]);
    }
  }
  return dots;
}

/**
 * Major global metropolitan & industrial corridors [lon, lat, radiusDeg, intensity]
 * used to place realistic night-side city lights instead of uniform noise.
 */
export const POPULATION_CENTERS = [
  // North America
  [-74.0, 40.7, 5.5, 1.0],   // BosWash / NYC
  [-87.6, 41.9, 5.0, 0.85],  // Great Lakes / Chicago
  [-84.4, 33.7, 4.5, 0.72],  // US Southeast / Atlanta
  [-96.8, 32.8, 4.8, 0.78],  // Texas Triangle
  [-118.2, 34.1, 4.5, 0.92], // Southern California
  [-122.4, 37.8, 3.5, 0.78], // Bay Area
  [-122.3, 47.6, 3.2, 0.55], // Cascadia
  [-79.4, 43.7, 4.0, 0.72],  // Toronto / Montreal
  [-99.1, 19.4, 4.2, 0.92],  // Mexico Valley
  // South America
  [-74.1, 4.7, 3.6, 0.7],    // Bogota
  [-46.6, -23.5, 5.0, 0.95], // Sao Paulo / Rio
  [-58.4, -34.6, 4.2, 0.82], // Buenos Aires / Montevideo
  [-70.7, -33.4, 3.0, 0.58], // Santiago
  [-77.0, -12.0, 3.0, 0.55], // Lima
  // Europe
  [-0.1, 51.5, 4.2, 0.95],   // UK / London
  [2.3, 48.9, 4.5, 0.9],     // Paris
  [6.5, 51.2, 5.2, 0.95],    // Benelux / Rhine-Ruhr
  [-3.7, 40.4, 3.8, 0.72],   // Madrid / Iberia
  [9.2, 45.5, 4.2, 0.88],    // Po Valley / Northern Italy
  [12.5, 41.9, 3.5, 0.7],    // Rome / Naples
  [13.4, 52.5, 4.8, 0.82],   // Berlin / Central Europe
  [21.0, 52.2, 4.5, 0.7],    // Warsaw / Vistula
  [37.6, 55.8, 5.2, 0.88],   // Moscow
  [30.3, 59.9, 3.5, 0.6],    // St. Petersburg
  [29.0, 41.0, 4.2, 0.85],   // Istanbul / Marmara
  // Africa & Middle East
  [31.2, 30.0, 4.2, 0.96],   // Cairo / Nile Delta
  [3.4, 6.5, 4.5, 0.82],     // Lagos / Gulf of Guinea
  [-7.6, 33.6, 3.5, 0.62],   // Maghreb Coast
  [28.0, -26.2, 4.0, 0.72],  // Johannesburg / Gauteng
  [36.8, -1.3, 3.5, 0.56],   // Nairobi / Lake Victoria
  [51.4, 35.7, 4.2, 0.76],   // Tehran
  [55.3, 25.3, 3.8, 0.78],   // Persian Gulf / Dubai
  [46.7, 24.7, 3.5, 0.65],   // Riyadh
  // South & Southeast Asia
  [77.2, 28.6, 6.0, 1.0],    // Delhi / Indo-Gangetic Plain
  [72.9, 19.1, 5.0, 0.94],   // Mumbai / West India
  [77.6, 13.0, 4.8, 0.82],   // Bangalore / Chennai
  [88.4, 22.6, 5.2, 0.9],    // Kolkata / Dhaka
  [100.5, 13.8, 4.2, 0.78],  // Bangkok
  [103.8, 1.3, 3.8, 0.76],   // Singapore / Malacca
  [106.8, -6.2, 4.8, 0.92],  // Jakarta / Java
  [121.0, 14.6, 3.8, 0.82],  // Manila
  // East Asia & Oceania
  [113.3, 23.1, 5.2, 0.98],  // Pearl River Delta / HK
  [121.5, 31.2, 5.5, 1.0],   // Shanghai / Yangtze
  [116.4, 39.9, 5.8, 0.98],  // Beijing / Bohai
  [104.1, 30.7, 4.8, 0.76],  // Sichuan Basin
  [127.0, 37.6, 4.0, 0.92],  // Seoul
  [139.7, 35.7, 5.2, 1.0],   // Tokyo / Tokaido
  [151.2, -33.9, 4.0, 0.72]  // Sydney / Melbourne
];

const DEG2RAD_WD = Math.PI / 180;

function isAridBiome(lat, lon) {
  if (lat >= 15 && lat <= 33 && lon >= -17 && lon <= 35) return true;   // Sahara
  if (lat >= 14 && lat <= 32 && lon > 35 && lon <= 60) return true;     // Arabian Desert
  if (lat >= 36 && lat <= 47 && lon >= 55 && lon <= 110) return true;   // Central Asia / Gobi
  if (lat >= -31 && lat <= -19 && lon >= 114 && lon <= 142) return true; // Australian Outback
  if (lat >= 24 && lat <= 37 && lon >= -118 && lon <= -102) return true; // Sonora / SW US
  if ((lat >= -27 && lat <= -15 && lon >= -72 && lon <= -66) ||
      (lat >= -50 && lat <= -38 && lon >= -71 && lon <= -64)) return true; // Atacama / Patagonia
  return false;
}

/**
 * Precomputes 3D unit vectors, day-side biome RGB albedos, and realistic
 * population-weighted urban night light densities for every land dot.
 * @param {Array<[number, number]>} dots
 * @returns {Array<{ vec: [number, number, number], dayRgb: [number, number, number], urban: number }>}
 */
export function computeLandDotMetadata(dots) {
  const meta = new Array(dots.length);

  for (let i = 0; i < dots.length; i++) {
    const [lon, lat] = dots[i];
    const phi = lat * DEG2RAD_WD;
    const lam = lon * DEG2RAD_WD;
    const cosPhi = Math.cos(phi);
    const vec = [
      cosPhi * Math.sin(lam),
      Math.sin(phi),
      cosPhi * Math.cos(lam)
    ];

    // Biome classification for sunlit terrain albedo
    let dayRgb;
    const absLat = Math.abs(lat);
    const isGreenland = lat > 59 && lon >= -73 && lon <= -12;
    if (absLat > 64 || isGreenland) {
      dayRgb = [216, 228, 240];
    } else if (isAridBiome(lat, lon)) {
      dayRgb = [214, 184, 138];
    } else if (absLat < 14) {
      dayRgb = [112, 162, 124];
    } else {
      dayRgb = [152, 178, 148];
    }

    // Urban density from real metropolitan hubs (Gaussian falloff in degrees)
    let urbanSum = 0;
    for (let c = 0; c < POPULATION_CENTERS.length; c++) {
      const [clon, clat, radiusDeg, intensity] = POPULATION_CENTERS[c];
      let dLon = Math.abs(lon - clon);
      if (dLon > 180) dLon = 360 - dLon;
      const dLat = lat - clat;
      const distSq = (dLon * cosPhi) * (dLon * cosPhi) + dLat * dLat;
      const rSq = radiusDeg * radiusDeg;
      if (distSq < rSq * 5.5) {
        urbanSum += intensity * Math.exp(-distSq / rSq);
      }
    }

    // Slight coastal/habitable belt affinity so sparse coastlines connect hubs
    const coastalProbe =
      !isPointDeepInland(lat, lon) && absLat < 58 && !isAridBiome(lat, lon) && !isGreenland;
    if (coastalProbe && urbanSum > 0.03) {
      urbanSum += 0.08;
    }

    // Deterministic per-dot hash jitter for organic city clusters and corridor filaments
    const h = (((i * 2654435761) >>> 0) % 1000) / 1000;
    let urban = 0;
    if (urbanSum > 0.06) {
      const scaled = urbanSum * (0.65 + 0.55 * h);
      urban = Math.max(0, Math.min(1, scaled));
    } else if (coastalProbe && h > 0.91) {
      urban = 0.14 + 0.14 * ((h - 0.91) / 0.09);
    }

    meta[i] = { vec, dayRgb, urban };
  }

  return meta;
}

function isPointDeepInland(lat, lon) {
  // Check 4 cardinal points ~2.2 degrees away; if all are land, point is deep inland
  const step = 2.2;
  return (
    isLandPoint(lat + step, lon) &&
    isLandPoint(lat - step, lon) &&
    isLandPoint(lat, lon + step) &&
    isLandPoint(lat, lon - step)
  );
}

/**
 * Human-readable meteorological/geographic region name for telemetry display.
 */
export function getRegionName(lat, lon) {
  if (lat >= 23 && lat <= 50 && lon >= -126 && lon <= -65) {
    if (lon < -104) return 'WESTERN CORDILLERA';
    if (lon < -88) return lat > 32 ? 'GREAT PLAINS' : 'GULF COAST';
    return lat > 39 ? 'GREAT LAKES' : 'EASTERN SEABOARD';
  }
  if (lat >= 8 && lat < 28 && lon >= -108 && lon <= -60) {
    return lon < -84 ? 'MESOAMERICA' : 'CARIBBEAN BASIN';
  }
  if (lat >= 50 && lat <= 75 && lon >= -168 && lon <= -52) {
    return 'BOREAL NORTH AMERICA';
  }
  if (lat >= -56 && lat < 13 && lon >= -82 && lon <= -34) {
    if (lat > -12 && lon > -74 && lon < -48) return 'AMAZONAS';
    if (lat < -25) return 'PAMPAS / PARANÁ';
    return 'SOUTH AMERICA';
  }
  if (lat >= 35 && lat <= 72 && lon >= -12 && lon <= 40) {
    if (lat < 45 && lon > -6 && lon < 30) return 'MEDITERRANEAN';
    if (lat > 55) return 'SCANDINAVIA';
    return 'CENTRAL EUROPE';
  }
  if (lat >= -35 && lat < 35 && lon >= -18 && lon <= 52) {
    if (lat >= -10 && lat <= 10 && lon >= 10 && lon <= 32) return 'CONGO BASIN';
    if (lat > 12) return 'SAHEL / SAHARA';
    return 'SOUTHERN AFRICA';
  }
  if (lat >= 12 && lat <= 42 && lon >= 34 && lon <= 62) {
    return 'ARABIAN PENINSULA';
  }
  if (lat >= 6 && lat <= 36 && lon > 62 && lon <= 95) {
    return lat < 23 ? 'DECCAN / BAY OF BENGAL' : 'HIMALAYAN FOOTHILLS';
  }
  if (lat >= -11 && lat <= 24 && lon > 95 && lon <= 145) {
    return lat < 5 ? 'MARITIME CONTINENT' : 'INDOCHINA SEA';
  }
  if (lat > 24 && lat <= 55 && lon > 95 && lon <= 150) {
    return lon > 126 ? 'SEA OF JAPAN' : 'EAST ASIA';
  }
  if (lat > 50 && lon > 40 && lon <= 180) {
    return 'SIBERIA';
  }
  if (lat >= -47 && lat <= -11 && lon >= 112 && lon <= 179) {
    return lon > 160 ? 'TASMAN / CORAL SEA' : 'AUSTRALIAN OUTBACK';
  }
  if (lat > 0 && lon > -65 && lon < -10) return 'NORTH ATLANTIC';
  if (lat <= 0 && lon > -50 && lon < 15) return 'SOUTH ATLANTIC';
  if (lat < 25 && lon >= 45 && lon < 105) return 'INDIAN OCEAN';
  if (lat > 0) return 'NORTH PACIFIC';
  return 'SOUTHERN OCEAN';
}

/**
 * Active global storm cells used by simulation & pre-stream warmup.
 * Weight reflects climatological lightning density (NASA LIS/OTD hotspots).
 */
export const GLOBAL_STORM_HOTSPOTS = [
  { name: 'LAKE MARACAIBO', lat: 9.8, lon: -71.6, spread: 4.5, weight: 1.5 },
  { name: 'CONGO BASIN', lat: -1.5, lon: 22.0, spread: 10.0, weight: 2.0 },
  { name: 'AMAZONAS', lat: -5.5, lon: -61.0, spread: 9.0, weight: 1.4 },
  { name: 'GREAT PLAINS', lat: 36.2, lon: -96.5, spread: 8.5, weight: 1.2 },
  { name: 'GULF STREAM', lat: 28.5, lon: -79.0, spread: 6.5, weight: 1.0 },
  { name: 'MALACCA STRAIT', lat: 2.8, lon: 101.2, spread: 6.0, weight: 1.6 },
  { name: 'JAVA SEA', lat: -6.2, lon: 108.5, spread: 5.5, weight: 1.3 },
  { name: 'BAY OF BENGAL', lat: 19.5, lon: 88.0, spread: 6.5, weight: 1.1 },
  { name: 'MEDITERRANEAN', lat: 39.2, lon: 14.5, spread: 6.0, weight: 0.9 },
  { name: 'CENTRAL EUROPE', lat: 47.8, lon: 12.2, spread: 6.5, weight: 0.8 },
  { name: 'PARANÁ BASIN', lat: -27.0, lon: -57.5, spread: 7.0, weight: 1.2 },
  { name: 'CORAL SEA', lat: -16.0, lon: 148.5, spread: 7.0, weight: 0.9 },
  { name: 'SOUTH CHINA SEA', lat: 18.0, lon: 114.5, spread: 7.0, weight: 1.0 },
  { name: 'CAPE AGULHAS', lat: -31.5, lon: 27.0, spread: 5.5, weight: 0.7 }
];
