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
} from './constants';
import { fbm, rng } from './noise';

export type WorldEvent =
  | { type: 'flood' | 'burn' | 'quake'; i: number; owner: number; what: 'house' | 'farm' }
  | { type: 'lightning'; x: number; y: number }
  | { type: 'impact'; x: number; y: number; r: number; kind: 'meteor' | 'quake' | 'volcano' };

const WEATHER_TEMP: Record<Weather, number> = { sun: 24, rain: 14, storm: 10, snow: -10, drought: 36 };
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
  /** Permanent climate offset per cell from latitude (poles are colder). */
  latChill = new Float32Array(N);

  seaLevel = BASE_SEA;
  /** Average temperature across regions (for display). */
  temperature = 20;
  /** The most common weather (for display). */
  weather: Weather = 'sun';
  regionWeather: Weather[] = new Array(RN).fill('sun');
  regionTemp = new Float32Array(RN).fill(20);
  /** Seconds until each region's weather changes on its own. */
  regionTimer = new Float32Array(RN);
  autoWeather = true;
  weatherTimer = 60;
  time = 0;
  dayLength = 120;
  events: WorldEvent[] = [];
  fireCount = 0;
  /** Centres of the great islands (cells), for spreading out the first clans. */
  islands: { x: number; y: number; r: number }[] = [];
  phase = 0;
  vents: Vent[] = [];

  generate(seed: number) {
    const r = rng(seed);
    const s = Math.floor(r() * 1e6);
    this.cover.fill(Cover.NONE);
    this.snow.fill(0);
    this.timer.fill(0);
    this.owner.fill(-1);
    this.building.fill(0);
    this.road.fill(0);
    this.events.length = 0;
    this.vents.length = 0;
    this.phase = 0;
    this.fireCount = 0;
    this.regionTemp.fill(20);
    this.regionTimer.fill(0);
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
    // Place 5–7 great islands, spread out across the ocean.
    const islands: { x: number; y: number; rx: number; ry: number; cos: number; sin: number }[] = [];
    const count = 5 + Math.floor(r() * 3);
    for (let tries = 0; islands.length < count && tries < 400; tries++) {
      const rx = W * (0.09 + r() * 0.08);
      const ry0 = rx * 0.95;
      // Keep the whole island (plus its ragged coast) well inside the map, ringed by open sea.
      const x = rx * 1.4 + 60 + r() * (W - 2 * (rx * 1.4 + 60));
      const y = ry0 * 1.4 + 50 + r() * (H - 2 * (ry0 * 1.4 + 50));
      if (x < 0 || y < 0 || x > W || y > H) continue;
      if (islands.some((o) => Math.hypot(o.x - x, o.y - y) < (o.rx + rx) * 0.75)) continue;
      const ang = r() * Math.PI;
      islands.push({ x, y, rx, ry: rx * (0.55 + r() * 0.4), cos: Math.cos(ang), sin: Math.sin(ang) });
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
        const isles = smooth(0.66, 0.73, fbm(x / 26, y / 26, s + 91, 4)) * edge * smooth(0.6, 0.2, mainland);
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

  /** Set the weather everywhere. */
  setWeather(w: Weather) {
    this.weather = w;
    this.weatherTimer = 50 + rand() * 60;
    for (let r = 0; r < RN; r++) this.setRegionWeather(r, w);
  }

  setRegionWeather(r: number, w: Weather, duration = 50 + rand() * 60) {
    if (r < 0 || r >= RN) return;
    this.regionWeather[r] = w;
    this.regionTimer[r] = duration;
  }

  /** Set the weather in every region touched by a circle (cells). */
  paintWeather(x: number, y: number, radius: number, w: Weather, temp?: number) {
    for (let ry = 0; ry < RH; ry++) {
      for (let rx = 0; rx < RW; rx++) {
        const cx = Math.max(rx * 64, Math.min(x, rx * 64 + 63));
        const cy = Math.max(ry * 64, Math.min(y, ry * 64 + 63));
        if (Math.hypot(cx - x, cy - y) > radius) continue;
        this.setRegionWeather(ry * RW + rx, w, 90 + rand() * 60);
        if (temp !== undefined) this.regionTemp[ry * RW + rx] = Math.max(this.regionTemp[ry * RW + rx], temp);
      }
    }
  }

  weatherAt(i: number): Weather {
    return this.regionWeather[regionOf(i % W, Math.floor(i / W))];
  }
  rainingAt(i: number) {
    const w = this.weatherAt(i);
    return w === 'rain' || w === 'storm';
  }

  /** Weather a region drifts to: often its neighbour's (fronts travel), else what its climate favours. */
  private nextWeather(r: number): Weather {
    const rx = r % RW;
    const ry = Math.floor(r / RW);
    if (rand() < 0.45) {
      const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
      const nx = rx + dx;
      const ny = ry + dy;
      if (nx >= 0 && ny >= 0 && nx < RW && ny < RH) return this.regionWeather[ny * RW + nx];
    }
    const cold = ry / RH < 0.3;
    const hot = ry / RH > 0.75;
    const roll = rand();
    if (cold) return roll < 0.35 ? 'snow' : roll < 0.65 ? 'sun' : roll < 0.85 ? 'rain' : 'storm';
    if (hot) return roll < 0.45 ? 'sun' : roll < 0.6 ? 'drought' : roll < 0.85 ? 'rain' : 'storm';
    return roll < 0.5 ? 'sun' : roll < 0.75 ? 'rain' : roll < 0.88 ? 'storm' : roll < 0.95 ? 'snow' : 'drought';
  }

  isWater(i: number) {
    return this.height[i] < this.seaLevel;
  }
  isIce(i: number) {
    return this.isWater(i) && this.snow[i] > 0.5;
  }
  canWalk(i: number) {
    if (this.isWater(i)) return this.isIce(i);
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
  private destroy(i: number, type: 'flood' | 'burn' | 'quake') {
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
    const night = 1 - this.daylight();
    const counts: Record<string, number> = {};
    let sumTemp = 0;
    let sumSea = 0;
    for (let r = 0; r < RN; r++) {
      if (this.autoWeather) {
        this.regionTimer[r] -= dt;
        if (this.regionTimer[r] <= 0) this.setRegionWeather(r, this.nextWeather(r));
      }
      const wr = this.regionWeather[r];
      this.regionTemp[r] += (WEATHER_TEMP[wr] - night * 6 - this.regionTemp[r]) * 0.02;
      sumTemp += this.regionTemp[r];
      sumSea += WEATHER_SEA[wr];
      counts[wr] = (counts[wr] ?? 0) + 1;
      // Lightning in stormy regions.
      if (wr === 'storm' && rand() < 0.02) this.strikeIn(r);
    }
    this.temperature = sumTemp / RN;
    this.weather = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'sun') as Weather;
    this.seaLevel += (BASE_SEA + (sumSea / RN) * 1.2 - this.seaLevel) * 0.008;

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
      const wr = this.regionWeather[regionOf(jx, jy)];
      const raining = wr === 'rain' || wr === 'storm';
      const snowing = wr === 'snow';
      const drought = wr === 'drought';
      const temp = this.airTemp(x, y) - this.latChill[i] - (h > 0.6 ? (h - 0.6) * 40 : 0);

      if (h < sea) {
        if (c !== Cover.NONE) {
          this.destroy(i, 'flood');
          this.cover[i] = Cover.NONE;
        }
        this.road[i] = 0;
        // Shallow water freezes first; open ocean only in deep cold.
        if (temp < -2 && (h > sea - 0.06 || temp < -14)) this.snow[i] = Math.min(1, this.snow[i] + 0.06 * (h > sea - 0.06 ? 1 : 0.3));
        else if (temp > 0) this.snow[i] = Math.max(0, this.snow[i] - 0.12);
        continue;
      }

      if (snowing || temp < -4) this.snow[i] = Math.min(1, this.snow[i] + 0.024 + rand() * 0.024);
      else if (temp > 1) this.snow[i] = Math.max(0, this.snow[i] - 0.016 * (temp / 10) - (raining ? 0.04 : 0));

      switch (c) {
        case Cover.FIRE: {
          fires++;
          this.timer[i] -= dt;
          if (raining && rand() < 0.3) this.timer[i] = 0;
          for (let k = 0; k < 8; k++) {
            const j = i + NEIGHBORS[(rand() * 4) | 0];
            if (j < 0 || j >= N || !this.canBurn(j)) continue;
            const p = (raining ? 0.06 : 0.35) * (this.snow[j] > 0.3 ? 0.1 : 1);
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
          if ((wr === 'sun' && temp > 22 && rand() < 0.000016) || (drought && rand() < 0.0004)) this.ignite(i);
          break;
      }
    }
    this.fireCount = fires * 4;
  }

  private strikeIn(r: number) {
    const rx = (r % RW) * 64;
    const ry = Math.floor(r / RW) * 64;
    for (let tries = 0; tries < 10; tries++) {
      const x = rx + Math.floor(rand() * 64);
      const y = ry + Math.floor(rand() * 64);
      if (x >= W || y >= H) continue;
      const i = y * W + x;
      if (this.isWater(i)) continue;
      const tall = this.cover[i] === Cover.FOREST || this.cover[i] === Cover.HOUSE || this.height[i] > HILL_MAX;
      if (!tall && tries < 6) continue;
      this.events.push({ type: 'lightning', x: i % W, y: Math.floor(i / W) });
      if (this.canBurn(i)) this.ignite(i);
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
