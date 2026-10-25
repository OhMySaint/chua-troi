import { rand } from '../sim/rand';
import {
  BASE_SEA,
  Cover,
  GRASS_MAX,
  H,
  HILL_MAX,
  MOUNT_MAX,
  N,
  SAND_BAND,
  RH,
  RW,
  W,
  type Weather,
  regionOf,
  RS,
} from './constants';
import { fbm, rng } from './noise';

export type WorldEvent =
  | { type: 'flood' | 'burn' | 'quake' | 'slide'; i: number; owner: number; what: 'house' | 'farm' }
  | { type: 'lightning'; x: number; y: number }
  | { type: 'emerge'; x: number; y: number; x0: number; y0: number; x1: number; y1: number; cells: number }
  | { type: 'impact'; x: number; y: number; r: number; kind: 'meteor' | 'quake' | 'volcano' };

const WEATHER_TEMP: Record<Weather, number> = { sun: 24, rain: 14, storm: 10, snow: -10, drought: 36 };
const WEATHERS: Weather[] = ['sun', 'rain', 'storm', 'snow', 'drought'];
/** Weather is resolved on blocks of WB × WB cells. */
const WB = 16;
const WBW = Math.ceil(W / WB);
const WBH = Math.ceil(H / WB);
/** How many weather systems the sky holds at once, left to itself. */
const MAX_SYSTEMS = 11;

/** A travelling patch of weather: a rain front, a storm cell, a snowfall, a heat dome. */
export interface WeatherSystem {
  x: number;
  y: number;
  r: number;
  kind: Weather;
  vx: number;
  vy: number;
  life: number;
  age: number;
  /** Fixed per system, shapes its ragged edge. */
  seed: number;
}

const WEATHER_SEA: Record<Weather, number> = { sun: 0, rain: 0.015, storm: 0.045, snow: -0.01, drought: -0.008 };
const RN = RW * RH;
const NEIGHBORS = [1, -1, W, -W];

interface Vent {
  i: number;
  t: number;
}

export class World {
  height = new Float32Array(N);
  cover = new Uint8Array(N);
  /** Snow depth on land, ice thickness on water (0..1). */
  snow = new Float32Array(N);
  /** Per-cover timer: fire burn time, ash regrow, farm growth, lava heat, basalt weathering. */
  timer = new Float32Array(N);
  /** Village id owning a house/farm, -1 otherwise. */
  owner = new Int16Array(N).fill(-1);
  jitter = new Float32Array(N);
  /** Building kind on HOUSE cells (index into SPECIAL_KINDS; 0 = dwelling). */
  building = new Uint8Array(N);
  /** Road surface (Road.*). */
  road = new Uint8Array(N);
  // ---- A world that grows: lands beyond the first rise from the sea as people multiply ----
  /** The land each cell will become (heights as generated). */
  targetH = new Float32Array(N);
  /** Landmass id per cell (-1 for sea). */
  landId = new Int16Array(N).fill(-1);
  /** 1 once a landmass has risen (or is rising). */
  landUp: number[] = [];
  /** Distance of each landmass from the cradle of humanity. */
  landDist: number[] = [];
  /** Bounding boxes of landmasses [x0, y0, x1, y1]. */
  landBox: number[][] = [];
  /** Landmasses rising right now. */
  rising: number[] = [];
  /** Whether this world grows at all. */
  grows = false;
  /** How far from the cradle the world reaches (cells). */
  reach = 0;
  /** Population the world reach is computed from (set by the simulation). */
  people = 0;
  origin = { x: W / 2, y: H / 2 };
  private landCells: Int32Array = new Int32Array(0);
  private landStart: number[] = [];
  /** 1 where the road is a bridge deliberately built over water. */
  bridge = new Uint8Array(N);
  /** Permanent climate offset per cell from latitude (poles are colder). */
  latChill = new Float32Array(N);

  seaLevel = BASE_SEA;
  /** Average temperature across regions (for display). */
  temperature = 20;
  /** The most common weather (for display). */
  weather: Weather = 'sun';
  /** The prevailing weather of each region (derived from the systems each tick). */
  regionWeather: Weather[] = new Array(RN).fill('sun');
  regionTemp = new Float32Array(RN).fill(20);
  /** Climate per region, from the land itself: 0 temperate, 1 cold, 2 maritime, 3 arid, 4 highland. */
  regionClimate = new Uint8Array(RN);
  /** Weather systems drifting across the map with the wind. */
  systems: WeatherSystem[] = [];
  /** Weather on each WB×WB block (index into WEATHERS), rebuilt from the systems. */
  private wgrid = new Uint8Array(WBW * WBH);
  private regionTarget = new Float32Array(RN).fill(24);
  private sumSea = 0;
  autoWeather = true;
  weatherTimer = 60;
  time = 0;
  dayLength = 120;
  events: WorldEvent[] = [];
  fireCount = 0;
  layout: 'random' | 'halves' = 'random';
  /** Centres of the great islands (cells), for spreading out the first clans. */
  islands: { x: number; y: number; r: number }[] = [];
  phase = 0;
  vents: Vent[] = [];

  generate(seed: number, layout: 'random' | 'halves' = 'random', grows = false) {
    this.layout = layout;
    const r = rng(seed);
    const s = Math.floor(r() * 1e6);
    this.cover.fill(Cover.NONE);
    this.snow.fill(0);
    this.timer.fill(0);
    this.owner.fill(-1);
    this.building.fill(0);
    this.road.fill(0);
    this.bridge.fill(0);
    this.events.length = 0;
    this.vents.length = 0;
    this.phase = 0;
    this.fireCount = 0;
    this.regionTemp.fill(20);
    this.systems = [];
    this.autoWeather = true;
    this.seaLevel = BASE_SEA;
    this.temperature = 20;
    this.setWeather('sun');
    this.time = this.dayLength * 0.3;

    // Terrain detail: hills plus ridged mountain chains, normalised to 0..1.
    const detail = new Float32Array(N);
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const base = fbm(x / 52, y / 52, s, 6);
        const ridge = 1 - Math.abs(fbm(x / 36, y / 36, s + 50, 4) * 2 - 1);
        const v = base * 0.75 + ridge * ridge * 0.45 * base;
        detail[y * W + x] = v;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    // Great landmasses. 'halves': two balanced continents, one per god; 'random': 3–5 continents.
    const islands: { x: number; y: number; rx: number; ry: number; cos: number; sin: number }[] = [];
    if (layout === 'halves') {
      for (const side of [0, 1]) {
        islands.push({ x: W * (side ? 0.735 : 0.265), y: H * (0.5 + (r() - 0.5) * 0.06), rx: W * 0.2, ry: H * 0.36, cos: 1, sin: 0 });
        // A satellite land so each continent has varied coasts.
        islands.push({ x: W * (side ? 0.8 : 0.2) + (r() - 0.5) * 60, y: H * (r() < 0.5 ? 0.24 : 0.76), rx: W * 0.08, ry: H * 0.12, cos: Math.cos(r() * 3), sin: Math.sin(r() * 3) });
      }
    } else {
      const count = 3 + Math.floor(r() * 3);
      for (let tries = 0; islands.length < count && tries < 600; tries++) {
        const rx = W * (0.14 + r() * 0.08);
        const ry0 = rx * 0.8;
        // Keep the whole continent (plus its ragged coast) inside the map, ringed by open sea.
        const x = rx * 1.15 + 50 + r() * (W - 2 * (rx * 1.15 + 50));
        const y = ry0 * 1.15 + 40 + r() * (H - 2 * (ry0 * 1.15 + 40));
        if (x < 0 || y < 0 || x > W || y > H) continue;
        if (islands.some((o) => Math.hypot(o.x - x, o.y - y) < (o.rx + rx) * 0.7)) continue;
        const ang = r() * Math.PI;
        islands.push({ x, y, rx, ry: rx * (0.6 + r() * 0.35), cos: Math.cos(ang), sin: Math.sin(ang) });
      }
    }
    this.islands = islands.map((o) => ({ x: o.x, y: o.y, r: o.rx }));
    const smooth = (a: number, b: number, v: number) => {
      const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const t = (detail[i] - min) / (max - min);
        // Several great islands with warped, ragged coasts...
        const warp = (fbm(x / 140, y / 140, s + 3, 4) - 0.5) * 0.7;
        let mainland = 0;
        for (const isl of islands) {
          const dx = x - isl.x;
          const dy = y - isl.y;
          const u = (dx * isl.cos + dy * isl.sin) / isl.rx;
          const v = (-dx * isl.sin + dy * isl.cos) / isl.ry;
          mainland = Math.max(mainland, smooth(1.0, 0.62, Math.sqrt(u * u + v * v) + warp));
        }
        // ...and scattered islets out at sea, to be discovered by ship.
        const nx = (x / W) * 2 - 1;
        const ny = (y / H) * 2 - 1;
        const edge = smooth(1.05, 0.85, Math.max(Math.abs(nx), Math.abs(ny)));
        const isles = smooth(0.71, 0.76, fbm(x / 30, y / 30, s + 91, 4)) * edge * smooth(0.6, 0.2, mainland);
        // A guaranteed band of open ocean along every edge of the map.
        const border = Math.min(x, y, W - 1 - x, H - 1 - y);
        const land = Math.max(mainland, isles * 0.95) * smooth(16, 56, border);
        this.height[i] = clamp01(land * (0.43 + t * 0.56) + (1 - land) * (0.12 + t * 0.22));
        this.jitter[i] = r();
        // The north of the island is cold, the south warm; ragged noisy edge instead of a straight line.
        const lat = (y / H) + (fbm(x / 18, y / 18, s + 77, 3) - 0.5) * 0.12;
        const north = Math.max(0, (0.42 - lat) / 0.42);
        const south = Math.max(0, (lat - 0.93) / 0.07);
        this.latChill[i] = north * north * 30 + south * 10;
      }
    }

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.isFertile(i) && fbm(x / 16, y / 16, s + 33, 3) > 0.54 && r() < 0.85) {
          this.cover[i] = Cover.FOREST;
        }
        if (this.chill(i) > 18 && this.height[i] >= this.seaLevel) this.snow[i] = 1;
      }
    }

    this.carveRivers(r, 90);
    this.grows = grows;
    this.rising = [];
    if (grows) this.sinkTheFarLands();
    this.surveyClimate();
  }

  /** Label landmasses, keep the greatest one (and what lies close by), and sink the rest beneath the sea. */
  private sinkTheFarLands() {
    const sea = this.seaLevel;
    this.targetH.set(this.height);
    this.landId.fill(-1);
    const sizes: number[] = [];
    const stack = new Int32Array(N);
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (this.landId[i] >= 0 || this.height[i] < sea) continue;
      let top = 0;
      stack[top++] = i;
      this.landId[i] = n;
      let size = 0;
      while (top) {
        const j = stack[--top];
        size++;
        const x = j % W;
        for (const k of [j - 1, j + 1, j - W, j + W]) {
          if (k < 0 || k >= N || this.landId[k] >= 0 || this.height[k] < sea) continue;
          if ((k === j - 1 && x === 0) || (k === j + 1 && x === W - 1)) continue;
          this.landId[k] = n;
          stack[top++] = k;
        }
      }
      sizes.push(size);
      n++;
      if (n >= 32000) break; // (never in practice) ids must fit the save format
    }
    this.indexLands(n);
    const box = this.landBox;
    const sum = Array.from({ length: n }, () => [0, 0]);
    for (let i = 0; i < N; i++) {
      const c = this.landId[i];
      if (c < 0) continue;
      sum[c][0] += i % W;
      sum[c][1] += (i / W) | 0;
    }
    // The cradle: the centre of the greatest landmass.
    let big = 0;
    for (let c = 1; c < n; c++) if (sizes[c] > sizes[big]) big = c;
    this.origin = { x: sum[big][0] / sizes[big], y: sum[big][1] / sizes[big] };
    this.landDist = box.map((b) => {
      const dx = Math.max(b[0] - this.origin.x, 0, this.origin.x - b[2]);
      const dy = Math.max(b[1] - this.origin.y, 0, this.origin.y - b[3]);
      return Math.hypot(dx, dy);
    });
    this.landUp = sizes.map((_, c) => (c === big || this.landDist[c] < 25 ? 1 : 0));
    this.reach = 25;
    // Sink everything else: shallow seas where lands will one day rise.
    for (let c = 0; c < n; c++) {
      if (this.landUp[c]) continue;
      for (let k = this.landStart[c]; k < this.landStart[c + 1]; k++) {
        const i = this.landCells[k];
        this.height[i] = sea - 0.02 - Math.min(0.03, (this.targetH[i] - sea) * 0.1);
        this.cover[i] = Cover.NONE;
        this.snow[i] = 0;
      }
    }
  }

  /** Group cells by landmass and find each one's bounds (also after loading a save). */
  indexLands(n = this.landUp.length) {
    const count = new Int32Array(n + 1);
    for (let i = 0; i < N; i++) if (this.landId[i] >= 0) count[this.landId[i] + 1]++;
    for (let k = 1; k <= n; k++) count[k] += count[k - 1];
    this.landStart = Array.from(count);
    const fill = count.slice();
    this.landCells = new Int32Array(count[n]);
    const box = Array.from({ length: n }, () => [W, H, 0, 0]);
    for (let i = 0; i < N; i++) {
      const c = this.landId[i];
      if (c < 0) continue;
      this.landCells[fill[c]++] = i;
      const x = i % W;
      const y = (i / W) | 0;
      const b = box[c];
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
    this.landBox = box;
  }

  /** The world reaches further as humanity grows; lands within reach rise from the sea. */
  private growTick() {
    if (!this.grows || !this.landUp.length) return;
    this.reach = Math.max(this.reach, 25 + 16 * Math.sqrt(this.people));
    for (let c = 0; c < this.landUp.length; c++) {
      if (this.landUp[c] || this.landDist[c] > this.reach) continue;
      this.landUp[c] = 1;
      this.rising.push(c);
    }
    for (const c of [...this.rising]) {
      let done = true;
      for (let k = this.landStart[c]; k < this.landStart[c + 1]; k++) {
        const i = this.landCells[k];
        const t = this.targetH[i];
        if (this.height[i] < t) {
          this.height[i] = Math.min(t, this.height[i] + 0.006);
          done = false;
        }
      }
      if (!done) continue;
      this.rising = this.rising.filter((x) => x !== c);
      // Risen land greens over: forests return where the soil is good.
      for (let k = this.landStart[c]; k < this.landStart[c + 1]; k++) {
        const i = this.landCells[k];
        if (this.isFertile(i) && this.jitter[i] > 0.45 && this.cover[i] === Cover.NONE) this.cover[i] = Cover.FOREST;
        if (this.chill(i) > 18) this.snow[i] = 1;
      }
      const b = this.landBox[c];
      this.events.push({ type: 'emerge', x: (b[0] + b[2]) >> 1, y: (b[1] + b[3]) >> 1, x0: b[0], y0: b[1], x1: b[2], y1: b[3], cells: this.landStart[c + 1] - this.landStart[c] });
      this.surveyClimate();
    }
  }

  private carveRivers(r: () => number, count: number) {
    const orig = this.height.slice();
    for (let n = 0; n < count; n++) {
      let cur = -1;
      for (let tries = 0; tries < 400 && cur < 0; tries++) {
        const i = Math.floor(r() * N);
        if (orig[i] > 0.7 && orig[i] < MOUNT_MAX) cur = i;
      }
      if (cur < 0) continue;
      const visited = new Set<number>();
      for (let step = 0; step < 600; step++) {
        visited.add(cur);
        this.height[cur] = Math.min(this.height[cur], this.seaLevel - 0.015);
        this.cover[cur] = Cover.NONE;
        if (orig[cur] < this.seaLevel) break;
        let best = -1;
        let bestH = Infinity;
        for (const o of NEIGHBORS) {
          const j = cur + o;
          if (j < 0 || j >= N || visited.has(j)) continue;
          if (Math.abs((j % W) - (cur % W)) > 1) continue;
          const hj = orig[j] + r() * 0.01;
          if (hj < bestH) {
            bestH = hj;
            best = j;
          }
        }
        if (best < 0) break;
        cur = best;
      }
    }
  }

  /** Set the weather everywhere: a blanket of one kind (or clear skies) that holds while auto weather is off. */
  setWeather(w: Weather) {
    this.weather = w;
    this.weatherTimer = 50 + rand() * 60;
    this.systems = [];
    if (w !== 'sun') {
      for (let y = 100; y < H; y += 200) {
        for (let x = 100; x < W; x += 200) this.systems.push({ x, y, r: 175, kind: w, vx: 0, vy: 0, life: 1e9, age: 1e3, seed: (x * 7 + y * 13) % 997 });
      }
    }
    this.rebuildWeather();
  }

  /** The god's brush: clear the skies here, then (unless it is sun) set down a new system of that kind. */
  paintWeather(x: number, y: number, radius: number, w: Weather, temp?: number) {
    for (const s of this.systems) {
      if (Math.hypot(s.x - x, s.y - y) < radius + s.r * 0.5) s.life = Math.min(s.life, 5);
    }
    if (w !== 'sun') {
      const [vx, vy] = this.wind(y);
      this.systems.push({ x, y, r: radius, kind: w, vx: vx * 0.25, vy: vy * 0.25, life: 120 + rand() * 60, age: 12, seed: Math.floor(rand() * 997) });
    }
    if (temp !== undefined) {
      for (let ry = 0; ry < RH; ry++) {
        for (let rx = 0; rx < RW; rx++) {
          if (Math.hypot(rx * RS + RS / 2 - x, ry * RS + RS / 2 - y) > radius + RS / 2) continue;
          this.regionTemp[ry * RW + rx] = Math.max(this.regionTemp[ry * RW + rx], temp);
        }
      }
    }
    this.rebuildWeather();
  }

  /** Prevailing wind at a latitude (cells/s): westerlies in the north, trade winds in the south. */
  private wind(y: number): [number, number] {
    const lat = y / H;
    const dir = lat < 0.45 ? 1 : lat > 0.6 ? -1 : rand() < 0.5 ? 1 : -1;
    return [dir * (0.6 + rand() * 1.0), (rand() - 0.5) * 0.6];
  }

  /** A new system, born where the climate favours it. */
  private spawnSystem() {
    const x = rand() * W;
    const y = rand() * H;
    const kind = this.climateWeather(regionOf(Math.min(W - 1, x | 0), Math.min(H - 1, y | 0)));
    if (kind === 'sun') return;
    let [vx, vy] = this.wind(y);
    const big = kind === 'drought' ? 1.6 : kind === 'storm' ? 0.7 : 1;
    if (kind === 'drought') {
      vx *= 0.2;
      vy *= 0.2;
    } else if (kind === 'storm') {
      vx *= 1.4;
    }
    this.systems.push({
      x,
      y,
      r: (45 + rand() * 60) * big,
      kind,
      vx,
      vy,
      life: (90 + rand() * 130) * (kind === 'drought' ? 1.6 : 1),
      age: 0,
      seed: Math.floor(rand() * 997),
    });
  }

  /** Move, age and spawn systems, then resolve the weather on every block. */
  private weatherTick(dt: number) {
    if (this.autoWeather) {
      for (const s of this.systems) {
        if (s.life > 1e6) s.life = 40 + rand() * 60; // a god's blanket lifts once the sky runs itself again
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        s.age += dt;
      }
      this.systems = this.systems.filter((s) => s.life > 0 && s.x > -s.r && s.x < W + s.r && s.y > -s.r && s.y < H + s.r);
      if (this.systems.length < MAX_SYSTEMS && rand() < 0.03) this.spawnSystem();
    }
    this.rebuildWeather();
    // Lightning under storm cells.
    for (const s of this.systems) {
      if (s.kind === 'storm' && rand() < 0.005 * this.strength(s) * (s.r / 50)) this.strikeIn(s.x, s.y, s.r * 0.6);
    }
  }

  /** 0→1 as a system builds, 1→0 as it dies away. */
  private strength(s: WeatherSystem) {
    return Math.max(0, Math.min(1, s.age / 12, s.life / 8));
  }

  /** Resolve each block's weather from the systems over it; summarise per region. */
  rebuildWeather() {
    const g = this.wgrid;
    g.fill(0);
    const sev = [0, 2, 4, 3, 1]; // which kind wins where systems overlap
    for (const s of this.systems) {
      const k = this.strength(s);
      if (k <= 0) continue;
      const r = s.r * (0.35 + 0.65 * k);
      const kind = WEATHERS.indexOf(s.kind);
      const bx0 = Math.max(0, Math.floor((s.x - r * 1.2) / WB));
      const bx1 = Math.min(WBW - 1, Math.floor((s.x + r * 1.2) / WB));
      const by0 = Math.max(0, Math.floor((s.y - r * 1.2) / WB));
      const by1 = Math.min(WBH - 1, Math.floor((s.y + r * 1.2) / WB));
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const dx = bx * WB + WB / 2 - s.x;
          const dy = by * WB + WB / 2 - s.y;
          // A lumpy edge: the reach varies with direction, fixed per system.
          const ang = Math.atan2(dy, dx);
          const reach = r * (0.82 + 0.13 * Math.sin(ang * 3 + s.seed) + 0.08 * Math.sin(ang * 5 + s.seed * 1.7));
          const d = Math.hypot(dx, dy);
          if (d > reach) continue;
          let kk = kind;
          // A storm's rim is ordinary rain; rain falls as snow where it is freezing.
          if (kk === 2 && d > reach * 0.65) kk = 1;
          if (kk === 1 && this.regionTemp[regionOf(Math.min(W - 1, bx * WB), Math.min(H - 1, by * WB))] - this.latChill[Math.min(H - 1, by * WB + 8) * W + Math.min(W - 1, bx * WB + 8)] < -1) kk = 3;
          const i = by * WBW + bx;
          if (sev[kk] > sev[g[i]]) g[i] = kk;
        }
      }
    }
    // Per region: the prevailing kind and the temperature it pulls towards.
    let sea = 0;
    const per = RS / WB;
    for (let ry = 0; ry < RH; ry++) {
      for (let rx = 0; rx < RW; rx++) {
        const counts = [0, 0, 0, 0, 0];
        let temp = 0;
        let n = 0;
        for (let by = ry * per; by < Math.min(WBH, ry * per + per); by++) {
          for (let bx = rx * per; bx < Math.min(WBW, rx * per + per); bx++) {
            const k = g[by * WBW + bx];
            counts[k]++;
            temp += WEATHER_TEMP[WEATHERS[k]];
            sea += WEATHER_SEA[WEATHERS[k]];
            n++;
          }
        }
        const r = ry * RW + rx;
        let best = 0;
        for (let k = 1; k < 5; k++) if (counts[k] * 2 > counts[best] && counts[k] > counts[best] * 0.5 && counts[k] >= n * 0.3) best = counts[k] > counts[best] || best === 0 ? k : best;
        this.regionWeather[r] = WEATHERS[best];
        this.regionTarget[r] = n ? temp / n : 24;
      }
    }
    this.sumSea = sea / (WBW * WBH);
  }

  /** Weather at cell (x, y). */
  weatherXY(x: number, y: number): Weather {
    const bx = Math.max(0, Math.min(WBW - 1, (x / WB) | 0));
    const by = Math.max(0, Math.min(WBH - 1, (y / WB) | 0));
    return WEATHERS[this.wgrid[by * WBW + bx]];
  }
  weatherAt(i: number): Weather {
    return this.weatherXY(i % W, Math.floor(i / W));
  }
  rainingAt(i: number) {
    const w = this.weatherAt(i);
    return w === 'rain' || w === 'storm';
  }

  /** Classify each region's climate from its latitude, how much sea it has, and its altitude. */
  private surveyClimate() {
    for (let ry = 0; ry < RH; ry++) {
      for (let rx = 0; rx < RW; rx++) {
        let sea = 0;
        let high = 0;
        let chill = 0;
        let n = 0;
        for (let y = ry * 64; y < Math.min(H, ry * 64 + 64); y += 4) {
          for (let x = rx * 64; x < Math.min(W, rx * 64 + 64); x += 4) {
            const i = y * W + x;
            n++;
            if (this.height[i] < this.seaLevel) sea++;
            else if (this.height[i] > HILL_MAX) high++;
            chill += this.latChill[i];
          }
        }
        const r = ry * RW + rx;
        chill /= n;
        sea /= n;
        high /= n;
        this.regionClimate[r] = chill > 8 ? 1 : high > 0.25 ? 4 : sea > 0.55 ? 2 : sea < 0.08 && ry / RH > 0.45 ? 3 : 0;
      }
    }
  }

  /** What weather a region's climate tends to brew. */
  private climateWeather(r: number): Weather {
    const roll = rand();
    switch (this.regionClimate[r]) {
      case 1: // cold north
        return roll < 0.4 ? 'snow' : roll < 0.7 ? 'sun' : roll < 0.88 ? 'rain' : 'storm';
      case 2: // maritime: wet and stormy
        return roll < 0.35 ? 'sun' : roll < 0.7 ? 'rain' : roll < 0.95 ? 'storm' : 'snow';
      case 3: // arid interior
        return roll < 0.55 ? 'sun' : roll < 0.85 ? 'drought' : roll < 0.97 ? 'rain' : 'storm';
      case 4: // highlands: snow even in temperate latitudes
        return roll < 0.4 ? 'sun' : roll < 0.65 ? 'snow' : roll < 0.9 ? 'rain' : 'storm';
      default:
        return roll < 0.5 ? 'sun' : roll < 0.78 ? 'rain' : roll < 0.9 ? 'storm' : roll < 0.96 ? 'drought' : 'snow';
    }
  }

  isWater(i: number) {
    return this.height[i] < this.seaLevel;
  }
  isIce(i: number) {
    return this.isWater(i) && this.snow[i] > 0.5;
  }
  canWalk(i: number) {
    if (this.isWater(i)) return this.isIce(i) || this.road[i] > 0; // ice, or a bridge
    const c = this.cover[i];
    return c !== Cover.FIRE && c !== Cover.LAVA;
  }
  isDanger(i: number) {
    const c = this.cover[i];
    return c === Cover.FIRE || c === Cover.LAVA;
  }
  isFertile(i: number) {
    const h = this.height[i];
    return h >= this.seaLevel + SAND_BAND && h < GRASS_MAX;
  }
  canBurn(i: number) {
    if (this.isWater(i)) return false;
    const c = this.cover[i];
    return c === Cover.FOREST || c === Cover.HOUSE || (c === Cover.FARM && this.timer[i] > 0.3);
  }
  /** How much colder than the global temperature a cell is (latitude + altitude). */
  chill(i: number) {
    return this.latChill[i] + Math.max(0, this.height[i] - 0.6) * 40;
  }
  /** Temperature felt at a cell. */
  localTemp(i: number) {
    return this.tempAt(i);
  }
  get raining() {
    return this.weather === 'rain' || this.weather === 'storm';
  }
  /** Air temperature at cell (x, y), blended smoothly between region centres. */
  airTemp(x: number, y: number) {
    const fx = (x - 32) / 64;
    const fy = (y - 32) / 64;
    const x0 = Math.max(0, Math.min(RW - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(RH - 1, Math.floor(fy)));
    const x1 = Math.min(RW - 1, x0 + 1);
    const y1 = Math.min(RH - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, fx - x0));
    const ty = Math.max(0, Math.min(1, fy - y0));
    const t = this.regionTemp;
    const a = t[y0 * RW + x0] + (t[y0 * RW + x1] - t[y0 * RW + x0]) * tx;
    const b = t[y1 * RW + x0] + (t[y1 * RW + x1] - t[y1 * RW + x0]) * tx;
    return a + (b - a) * ty;
  }
  /** Temperature felt at a cell (air minus latitude and altitude chill). */
  tempAt(i: number) {
    return this.airTemp(i % W, Math.floor(i / W)) - this.chill(i);
  }

  /** 0 at midnight, 1 at noon. */
  daylight() {
    const phase = (this.time % this.dayLength) / this.dayLength;
    return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  }

  /** Remove a house/farm, telling its village why. */
  private destroy(i: number, type: 'flood' | 'burn' | 'quake' | 'slide') {
    const c = this.cover[i];
    this.building[i] = 0;
    if ((c === Cover.HOUSE || c === Cover.FARM) && this.owner[i] >= 0) {
      this.events.push({ type, i, owner: this.owner[i], what: c === Cover.HOUSE ? 'house' : 'farm' });
    }
    this.owner[i] = -1;
  }

  ignite(i: number) {
    const c = this.cover[i];
    if (c === Cover.FIRE || c === Cover.LAVA) return;
    this.destroy(i, 'burn');
    this.cover[i] = Cover.FIRE;
    this.timer[i] = c === Cover.NONE ? 1.5 : 3 + rand() * 4;
  }

  private setLava(i: number, heat: number) {
    if (this.cover[i] === Cover.LAVA) {
      this.timer[i] = Math.max(this.timer[i], heat);
      return;
    }
    this.destroy(i, 'burn');
    this.cover[i] = Cover.LAVA;
    this.timer[i] = heat;
    this.snow[i] = 0;
  }

  tick(dt: number) {
    this.time += dt;
    this.growTick();
    const night = 1 - this.daylight();
    this.weatherTick(dt);
    const counts: Record<string, number> = {};
    let sumTemp = 0;
    for (let r = 0; r < RN; r++) {
      const wr = this.regionWeather[r];
      this.regionTemp[r] += (this.regionTarget[r] - night * 6 - this.regionTemp[r]) * 0.02;
      sumTemp += this.regionTemp[r];
      counts[wr] = (counts[wr] ?? 0) + 1;
    }
    this.temperature = sumTemp / RN;
    const rainy = Object.entries(counts).filter(([k]) => k !== 'sun').sort((a, b) => b[1] - a[1])[0];
    this.weather = (rainy && rainy[1] > RN * 0.25 ? rainy[0] : 'sun') as Weather;
    this.seaLevel += (BASE_SEA + this.sumSea * 1.2 - this.seaLevel) * 0.008;

    for (const v of this.vents) {
      v.t -= dt;
      this.setLava(v.i, 14);
      for (const o of NEIGHBORS) if (rand() < 0.5) this.setLava(v.i + o, 12);
    }
    this.vents = this.vents.filter((v) => v.t > 0);

    const sea = this.seaLevel;
    let fires = 0;

    // Each tick updates a quarter of the map (rotating), with 4× the time step: same behaviour, 4× cheaper.
    this.phase = (this.phase + 1) & 3;
    dt *= 4;
    for (let i = this.phase; i < N; i += 4) {
      const h = this.height[i];
      const c = this.cover[i];
      const x = i % W;
      const y = (i / W) | 0;
      // Weather is sampled at a jittered point so region edges come out ragged, not square.
      const jx = Math.max(0, Math.min(W - 1, x + ((this.jitter[i] - 0.5) * 40) | 0));
      const jy = Math.max(0, Math.min(H - 1, y + ((this.jitter[(i * 7) % N] - 0.5) * 40) | 0));
      const wr = WEATHERS[this.wgrid[((jy / WB) | 0) * WBW + ((jx / WB) | 0)]];
      const raining = wr === 'rain' || wr === 'storm';
      const snowing = wr === 'snow';
      const drought = wr === 'drought';
      const temp = this.airTemp(x, y) - this.latChill[i] - (h > 0.6 ? (h - 0.6) * 40 : 0);

      if (h < sea) {
        if (c !== Cover.NONE) {
          this.destroy(i, 'flood');
          this.cover[i] = Cover.NONE;
        }
        // A street the sea swallowed is gone; only real bridges stand over water.
        if (this.road[i] && !this.bridge[i]) this.road[i] = 0;
        // Shallow water freezes first; open ocean only in deep cold.
        if (temp < -2 && (h > sea - 0.06 || temp < -14)) this.snow[i] = Math.min(1, this.snow[i] + 0.06 * (h > sea - 0.06 ? 1 : 0.3));
        else if (temp > 0) this.snow[i] = Math.max(0, this.snow[i] - 0.12);
        continue;
      }

      if (snowing || temp < -4) this.snow[i] = Math.min(1, this.snow[i] + 0.024 + rand() * 0.024);
      else if (temp > 1) this.snow[i] = Math.max(0, this.snow[i] - 0.016 * (temp / 10) - (raining ? 0.04 : 0));

      // The land changed under it: homes slide off new mountainsides, fields on land too steep or barren fail.
      if ((c === Cover.HOUSE && h >= HILL_MAX + 0.03) || (c === Cover.FARM && !this.isFertile(i))) {
        this.destroy(i, 'slide');
        this.cover[i] = Cover.NONE;
        continue;
      }
      switch (c) {
        case Cover.FIRE: {
          fires++;
          this.timer[i] -= dt;
          if (raining && rand() < 0.3) this.timer[i] = 0;
          // Fire creeps slowly in ordinary weather, races in a drought, and barely moves in the rain.
          for (let k = 0; k < 3; k++) {
            const j = i + NEIGHBORS[(rand() * 4) | 0];
            if (j < 0 || j >= N || !this.canBurn(j)) continue;
            const p = (raining ? 0.01 : drought ? 0.16 : 0.05) * (this.snow[j] > 0.3 ? 0.1 : 1);
            if (rand() < p) this.ignite(j);
          }
          if (this.timer[i] <= 0) {
            this.cover[i] = Cover.ASH;
            this.timer[i] = 20 + rand() * 25;
          }
          break;
        }
        case Cover.LAVA: {
          fires++;
          this.timer[i] -= dt;
          const heat = this.timer[i];
          for (let k = 0; k < 4 && heat > 3; k++) {
            const j = i + NEIGHBORS[(rand() * 4) | 0];
            if (j >= 0 && j < N && this.cover[j] !== Cover.LAVA) {
              if (this.isWater(j)) {
                // Lava meets the sea: it hisses and freezes into brand-new land.
                this.height[j] = sea + 0.012;
                this.cover[j] = Cover.BASALT;
                this.timer[j] = 160;
                this.snow[j] = 0;
              } else if (this.height[j] <= h + 0.015 && rand() < 0.45) {
                this.setLava(j, heat - 1.2);
              } else if (this.canBurn(j)) this.ignite(j);
            }
          }
          if (heat <= 0) {
            this.cover[i] = Cover.BASALT;
            this.timer[i] = 140 + rand() * 60;
            this.height[i] = Math.min(1, h + 0.008);
          }
          break;
        }
        case Cover.BASALT:
          this.timer[i] -= dt * (raining ? 1.5 : 1);
          if (this.timer[i] <= 0) this.cover[i] = Cover.NONE;
          break;
        case Cover.ASH:
          this.timer[i] -= dt * (raining ? 2 : 1);
          if (this.timer[i] <= 0) this.cover[i] = Cover.NONE;
          break;
        case Cover.FARM:
          if (this.snow[i] > 0.4) this.timer[i] = 0;
          else if (temp > 3 && !drought) this.timer[i] = Math.min(1, this.timer[i] + dt * 0.025 * (raining ? 1.8 : 1));
          else if (drought && this.timer[i] > 0.2 && rand() < 0.02) this.timer[i] -= 0.1; // crops wither
          break;
        case Cover.NONE:
          if (this.isFertile(i) && this.snow[i] < 0.2 && temp > 2 && !this.road[i]) {
            const j = i + NEIGHBORS[(rand() * 4) | 0];
            if (j >= 0 && j < N && this.cover[j] === Cover.FOREST && rand() < 0.024 * (raining ? 3 : 1)) {
              this.cover[i] = Cover.FOREST;
            } else if (rand() < 0.00004) {
              this.cover[i] = Cover.FOREST;
            }
          }
          break;
        case Cover.FOREST:
          if ((wr === 'sun' && temp > 26 && rand() < 0.000001) || (drought && rand() < 0.00003)) this.ignite(i);
          break;
      }
    }
    this.fireCount = fires * 4;
  }

  private strikeIn(cx: number, cy: number, radius: number) {
    for (let tries = 0; tries < 10; tries++) {
      const x = Math.floor(cx + (rand() * 2 - 1) * radius);
      const y = Math.floor(cy + (rand() * 2 - 1) * radius);
      if (x < 0 || y < 0) continue;
      if (x >= W || y >= H) continue;
      const i = y * W + x;
      if (this.isWater(i)) continue;
      const tall = this.cover[i] === Cover.FOREST || this.cover[i] === Cover.HOUSE || this.height[i] > HILL_MAX;
      if (!tall && tries < 6) continue;
      this.events.push({ type: 'lightning', x: i % W, y: Math.floor(i / W) });
      // Most strikes only scorch; storm rain usually stops a fire before it starts.
      if (this.canBurn(i) && rand() < 0.3) this.ignite(i);
      return;
    }
  }

  // ---------- God tools ----------

  private brush(cx: number, cy: number, r: number, fn: (i: number, falloff: number) => void) {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) fn(y * W + x, 1 - d / (r + 0.001));
      }
    }
  }

  raise(cx: number, cy: number, r: number, amount: number) {
    this.brush(cx, cy, r, (i, f) => {
      this.height[i] = clamp01(this.height[i] + amount * (0.3 + 0.7 * f));
    });
  }

  smooth(cx: number, cy: number, r: number, k: number) {
    const src = new Map<number, number>();
    this.brush(cx, cy, r, (i) => {
      let sum = 0;
      let n = 0;
      for (const o of [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1]) {
        const j = i + o;
        if (j >= 0 && j < N) {
          sum += this.height[j];
          n++;
        }
      }
      src.set(i, sum / n);
    });
    for (const [i, avg] of src) this.height[i] += (avg - this.height[i]) * Math.min(1, k);
  }

  water(cx: number, cy: number, r: number) {
    this.brush(cx, cy, r, (i) => {
      this.height[i] = Math.min(this.height[i], this.seaLevel - 0.02);
    });
  }

  plantForest(cx: number, cy: number, r: number) {
    this.brush(cx, cy, r, (i) => {
      const c = this.cover[i];
      if (this.isWater(i) || this.height[i] >= MOUNT_MAX) return;
      if ((c === Cover.NONE || c === Cover.ASH) && rand() < 0.3) this.cover[i] = Cover.FOREST;
    });
  }

  setFire(cx: number, cy: number, r: number) {
    this.brush(cx, cy, r, (i) => {
      if (this.isWater(i) || rand() > 0.4) return;
      if (this.canBurn(i) || this.cover[i] === Cover.NONE) this.ignite(i);
    });
  }

  /** Raise a cone and open a vent that pours lava for a while. */
  volcano(cx: number, cy: number) {
    const r = 7;
    let peak = -1;
    let peakH = -1;
    this.brush(cx, cy, r, (i, f) => {
      this.height[i] = clamp01(Math.max(this.height[i], this.seaLevel + 0.05) + 0.3 * Math.pow(f, 1.6));
      if (this.height[i] > peakH) {
        peakH = this.height[i];
        peak = i;
      }
    });
    if (peak >= 0) this.vents.push({ i: peak, t: 25 });
    this.events.push({ type: 'impact', x: cx, y: cy, r, kind: 'volcano' });
  }

  /** A fault line: one side sinks, the other rises; houses near the epicentre collapse. */
  quake(cx: number, cy: number, r: number) {
    const a = rand() * Math.PI;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    this.brush(cx, cy, r * 1.6, (i, f) => {
      const x = (i % W) + 0.5 - cx;
      const y = Math.floor(i / W) + 0.5 - cy;
      const side = x * -dy + y * dx; // signed distance from the fault
      const along = Math.abs(x * dx + y * dy);
      if (Math.abs(side) < 0.8 && along < r * 1.4) this.height[i] = clamp01(this.height[i] - 0.07);
      else if (side > 0 && side < 4) this.height[i] = clamp01(this.height[i] + 0.04 * f);
      else if (side < 0 && side > -4) this.height[i] = clamp01(this.height[i] - 0.02 * f);
      const c = this.cover[i];
      if ((c === Cover.HOUSE && rand() < 0.45 * f + 0.1) || (c === Cover.FOREST && rand() < 0.08 * f)) {
        this.destroy(i, 'quake');
        this.cover[i] = Cover.ASH;
        this.timer[i] = 12;
      }
    });
    this.events.push({ type: 'impact', x: cx, y: cy, r, kind: 'quake' });
  }

  /** A crater with a raised rim; everything inside burns. */
  meteor(cx: number, cy: number, r: number) {
    this.brush(cx, cy, r + 3, (i) => {
      const d = Math.hypot((i % W) + 0.5 - cx, Math.floor(i / W) + 0.5 - cy);
      if (d < r) {
        this.height[i] = clamp01(this.height[i] - 0.14 * Math.sqrt(1 - d / r));
        this.destroy(i, 'burn');
        this.cover[i] = Cover.BASALT;
        this.timer[i] = 120;
        this.snow[i] = 0;
      } else if (d < r + 2) {
        this.height[i] = clamp01(this.height[i] + 0.04);
        if (this.canBurn(i) || this.cover[i] === Cover.NONE) this.ignite(i);
      } else if (this.canBurn(i) && rand() < 0.5) this.ignite(i);
    });
    this.events.push({ type: 'impact', x: cx, y: cy, r, kind: 'meteor' });
  }

  /** Blast a cell to scorched ash (nuclear fire): buildings, farms and forest are gone. */
  scorch(i: number) {
    if (this.cover[i] !== Cover.NONE) this.destroy(i, 'burn');
    this.cover[i] = Cover.ASH;
    this.timer[i] = 200 + rand() * 100;
    this.road[i] = 0;
  }

  /** Nearest cell (ring search) within r matching pred, or -1. */
  findNearest(x: number, y: number, r: number, pred: (i: number) => boolean): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < W && y < H && pred(y * W + x)) return y * W + x;
    for (let d = 1; d <= r; d++) {
      let best = -1;
      let bestD = Infinity;
      for (let dy = -d; dy <= d; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        const edge = Math.abs(dy) === d;
        for (let dx = -d; dx <= d; dx += edge ? 1 : 2 * d) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const i = yy * W + xx;
          if (!pred(i)) continue;
          const dd = dx * dx + dy * dy;
          if (dd < bestD) {
            bestD = dd;
            best = i;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
