import { CELL, Cover, GRASS_MAX, H, HILL_MAX, MOUNT_MAX, SAND_BAND, W } from './constants';
import type { World } from './World';

/** Texture size in pixels: every world cell is a CELL×CELL pixel-art tile. */
export const PW = W * CELL;
export const PH = H * CELL;

type RGB = readonly [number, number, number];

const DEEP: RGB = [22, 48, 98];
const SHALLOW: RGB = [52, 118, 178];
const FOAM: RGB = [196, 228, 240];
const SAND: RGB = [226, 208, 146];
const GRASS_LO: RGB = [110, 176, 76];
const GRASS_HI: RGB = [66, 124, 56];
const HILL_LO: RGB = [136, 128, 84];
const HILL_HI: RGB = [120, 104, 80];
const ROCK: RGB = [112, 106, 110];
const PEAK: RGB = [232, 238, 246];
const SNOW: RGB = [236, 242, 250];
const ICE: RGB = [190, 220, 238];
const ASH: RGB = [62, 58, 56];
const SOIL: RGB = [122, 86, 54];
const SOIL_DARK: RGB = [96, 66, 42];
const SPROUT: RGB = [120, 180, 70];
const CROP: RGB = [96, 158, 58];
const RIPE: RGB = [222, 190, 72];
const RIPE_HEAD: RGB = [244, 216, 110];

// 8×8 sprites. '.' = transparent (ground shows through).
const ROUND_TREE =
  '..gGGg..' +
  '.gGGLGg.' +
  'gGGLLGGg' +
  'gGGGGGGg' +
  'gGGGGGgg' +
  '.gggggg.' +
  '...tt...' +
  '...tt...';
const PINE_TREE =
  '...g....' +
  '..gLg...' +
  '..gGg...' +
  '.gLGGg..' +
  '.gGGGg..' +
  'gGGGGGg.' +
  'gggggggg' +
  '...t....';
const PALM =
  '.gg..gg.' +
  'gGGggGGg' +
  'g..GG..g' +
  '...tL...' +
  '....t...' +
  '....t...' +
  '...t....' +
  '...t....';
const PALM_COLORS: Record<string, RGB> = {
  g: [36, 104, 48],
  G: [72, 152, 62],
  t: [140, 102, 62],
  L: [110, 78, 40],
};
const TREE_COLORS: Record<string, RGB> = {
  g: [26, 68, 34],
  G: [44, 110, 50],
  L: [80, 152, 70],
  t: [92, 62, 38],
};
const PINE_COLORS: Record<string, RGB> = {
  g: [20, 58, 40],
  G: [34, 94, 58],
  L: [60, 128, 78],
  t: [92, 62, 38],
};

let r = 0;
let g = 0;
let b = 0;
const set = (c: RGB) => {
  r = c[0];
  g = c[1];
  b = c[2];
};
const mix = (a: RGB, c: RGB, t: number) => {
  r = a[0] + (c[0] - a[0]) * t;
  g = a[1] + (c[1] - a[1]) * t;
  b = a[2] + (c[2] - a[2]) * t;
};
const mixTo = (c: RGB, t: number) => {
  r += (c[0] - r) * t;
  g += (c[1] - g) * t;
  b += (c[2] - b) * t;
};
const mul = (k: number) => {
  r *= k;
  g *= k;
  b *= k;
};
const step = (t: number, n: number) => Math.floor(Math.min(0.999, Math.max(0, t)) * n) / (n - 1);

/** 4×4 Bayer matrix for ordered dithering (0..1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

function hash(x: number, y: number, s: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Cheap per-pixel noise byte (0..255) for texture details. */
const nb = (x: number, y: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 7) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) & 255;
};

export class WorldRenderer {
  frame = 0;

  constructor() {
    if (CELL !== 8) throw new Error('Sprites are authored for CELL = 8');
  }

  /** Paint the world-pixel rectangle (x0, y0, pw × ph) into `out` (pw × ph RGBA). */
  paint(w: World, roof: (owner: number) => number, x0: number, y0: number, pw: number, ph: number, out: Uint8ClampedArray) {
    this.renderRows(w, roof, x0, y0, pw, ph, out);
  }

  /** Overview: one pixel per cell for cell rows [r0, r1), into `out` (W × H RGBA). */
  overview(w: World, color: (owner: number) => number, r0: number, r1: number, out: Uint8ClampedArray) {
    const sea = w.seaLevel;
    for (let y = r0; y < r1; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const h = w.height[i];
        const snow = w.snow[i];
        if (h < sea) {
          mix(SHALLOW, DEEP, step((sea - h) / 0.13, 5));
          if (snow > 0.4) set(ICE);
        } else {
          const dh = h - sea;
          if (dh < SAND_BAND) set(SAND);
          else if (h < GRASS_MAX) mix(GRASS_LO, GRASS_HI, step((dh - SAND_BAND) / (GRASS_MAX - sea - SAND_BAND), 5));
          else if (h < HILL_MAX) set(HILL_LO);
          else if (h < MOUNT_MAX) set(ROCK);
          else set(PEAK);
          switch (w.cover[i]) {
            case Cover.FOREST:
              set(TREE_COLORS.G);
              if ((x + y) & 1) mul(0.8);
              break;
            case Cover.FARM:
              set(w.timer[i] > 0.8 ? RIPE : CROP);
              break;
            case Cover.HOUSE: {
              const c = color(w.owner[i]);
              r = (c >> 16) & 255;
              g = (c >> 8) & 255;
              b = c & 255;
              break;
            }
            case Cover.FIRE:
            case Cover.LAVA:
              set([255, 120, 24]);
              break;
            case Cover.ASH:
            case Cover.BASALT:
              set(ASH);
              break;
            default:
              if (w.road[i]) set([120, 112, 100]);
          }
          if (snow > 0.4 && w.cover[i] !== Cover.HOUSE) mixTo(SNOW, 0.8);
          const hn = x > 0 && y > 0 ? w.height[i - W - 1] : h;
          mul(1 + Math.max(-0.25, Math.min(0.25, (h - hn) * 6)));
        }
        const o = i * 4;
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        out[o + 3] = 255;
      }
    }
  }

  private renderRows(w: World, roof: (owner: number) => number, x0: number, y0: number, pw: number, ph: number, out: Uint8ClampedArray) {
    const y1 = Math.min(PH, y0 + ph);
    const x1 = Math.min(PW, x0 + pw);
    const hgt = w.height;
    const snowA = w.snow;
    const cover = w.cover;
    const sea = w.seaLevel;
    const frame = this.frame;

    for (let Y = y0; Y < y1; Y++) {
      const cy = (Y / CELL) | 0;
      const ly = Y - cy * CELL;
      const v = (Y + 0.5) / CELL - 0.5;
      let ra = Math.floor(v);
      let fy = v - ra;
      let rb = ra + 1;
      if (ra < 0) {
        ra = 0;
        fy = 0;
      }
      if (rb >= H) rb = H - 1;
      const rowA = ra * W;
      const rowB = rb * W;

      for (let X = x0; X < x1; X++) {
        const cx = (X / CELL) | 0;
        const lx = X - cx * CELL;
        const i = cy * W + cx;
        const u = (X + 0.5) / CELL - 0.5;
        let ca = Math.floor(u);
        let fx = u - ca;
        let cb = ca + 1;
        if (ca < 0) {
          ca = 0;
          fx = 0;
        }
        if (cb >= W) cb = W - 1;

        // Bilinear height between cell centres → smooth coastlines and slopes.
        const h00 = hgt[rowA + ca];
        const h10 = hgt[rowA + cb];
        const h01 = hgt[rowB + ca];
        const h11 = hgt[rowB + cb];
        const top = h00 + (h10 - h00) * fx;
        const bot = h01 + (h11 - h01) * fx;
        const hp = top + (bot - top) * fy;
        const s00 = snowA[rowA + ca];
        const s10 = snowA[rowA + cb];
        const s01 = snowA[rowB + ca];
        const s11 = snowA[rowB + cb];
        const sTop = s00 + (s10 - s00) * fx;
        const snow = sTop + (s01 + (s11 - s01) * fx - sTop) * fy;
        const n = nb(X, Y) / 255;
        // Covered land cells (trees, houses...) always draw whole, even where the smoothed coast dips.
        const land = hp >= sea || (cover[i] !== Cover.NONE && hgt[i] >= sea);
        const c = land ? cover[i] : Cover.NONE;

        if (!land && w.road[i]) {
          // A bridge: planks (wood), slabs (stone) or a steel deck, with railings.
          const rd = w.road[i];
          const deck: RGB = rd === 1 ? [138, 98, 58] : rd === 2 ? [150, 144, 132] : [92, 96, 104];
          set(deck);
          if (rd === 1 && (X + Y) % 3 === 0) mul(0.8);
          const edgeX = lx === 0 || lx === 7;
          const edgeY = ly === 0 || ly === 7;
          if (edgeX !== edgeY) set(rd === 3 ? [180, 60, 50] : [90, 62, 36]);
        } else if (!land) {
          const depth = sea - hp;
          if (depth < 0.004) set(FOAM);
          else {
            mix(SHALLOW, DEEP, step(depth / 0.13, 5));
            // Drifting wave glints.
            if (depth > 0.012 && ((X + frame) % 11 === 0) && n > 0.93) mixTo(FOAM, 0.5);
          }
          if (snow > 0.08 && bayer(X, Y) < snow * 1.25 - 0.1) {
            set(ICE);
            if (n > 0.94) mul(0.86); // cracks
          }
        } else {
          // Terrain bands, terraced for a crisp pixel look.
          const dh = hp - sea;
          if (dh < SAND_BAND) set(SAND);
          else if (hp < GRASS_MAX) mix(GRASS_LO, GRASS_HI, step((dh - SAND_BAND) / (GRASS_MAX - sea - SAND_BAND), 5));
          else if (hp < HILL_MAX) mix(HILL_LO, HILL_HI, step((hp - GRASS_MAX) / (HILL_MAX - GRASS_MAX), 3));
          else if (hp < MOUNT_MAX) set(ROCK);
          else set(PEAK);

          // Hillshade: light from the top-left.
          const gx = h10 - h00 + (h11 - h01 - (h10 - h00)) * fy;
          const gy = h01 - h00 + (h11 - h10 - (h01 - h00)) * fx;
          let light = 1 + Math.max(-0.32, Math.min(0.32, (gx + gy) * 3.5));
          light = Math.round(light * 12) / 12 + (n - 0.5) * 0.06;
          mul(light);

          let snowK = 1;
          const rd = w.road[i];
          if (c === Cover.NONE && rd) {
            if (rd === 1) set(n > 0.85 ? [128, 98, 64] : [156, 124, 84]);
            else if (rd === 2) set(n > 0.9 ? [128, 124, 116] : n > 0.45 ? [158, 152, 140] : [150, 144, 132]);
            else set(n > 0.94 ? [96, 96, 100] : [66, 66, 72]);
            mul(light);
            snowK = 0.4;
          } else if (c === Cover.NONE) {
            // Little details: grass tufts and flowers, shells on sand, pebbles on hills, rock strata.
            if (dh < SAND_BAND) {
              if (n > 0.975) mul(1.15);
              else if (n < 0.02) mul(0.8);
            } else if (hp < GRASS_MAX) {
              if (n > 0.96) mul(0.82);
              else if (n < 0.012 && w.latChill[i] < 6) {
                const f = hash(X, Y, 3);
                set(f < 0.33 ? [230, 80, 80] : f < 0.66 ? [240, 220, 90] : [240, 240, 240]);
              }
            } else if (hp < HILL_MAX) {
              if (n > 0.95) set([128, 124, 120]);
            } else if (hp < MOUNT_MAX && (Y + Math.floor(hp * 260)) % 5 === 0) mul(0.88);
          }
          switch (c) {
            case Cover.FOREST: {
              mul(0.72); // forest floor
              const chillHere = w.latChill[i] + Math.max(0, hgt[i] - 0.6) * 40;
              const palm = chillHere < 2 && hgt[i] < sea + SAND_BAND * 3;
              const pine = !palm && (chillHere > 8 || w.jitter[i] < 0.5);
              if (palm) {
                const ch = PALM[ly * 8 + lx];
                if (ch !== '.') set(PALM_COLORS[ch]);
                snowK = 0;
                break;
              }
              const shift = ((w.jitter[i] * 7) | 0) % 3 - 1;
              const sx = lx - shift;
              const ch = sx >= 0 && sx < 8 ? (pine ? PINE_TREE : ROUND_TREE)[ly * 8 + sx] : '.';
              if (ch !== '.') {
                set((pine ? PINE_COLORS : TREE_COLORS)[ch]);
                if (ch === 'G' || ch === 'L') mul(1 + (n - 0.5) * 0.12);
                snowK = ch === 't' ? 0 : 0.7;
              } else snowK = 0.5;
              break;
            }
            case Cover.HOUSE: {
              // The building itself is a sprite; here we only paint its yard.
              const era = Math.floor(w.timer[i]);
              if (era <= 1) set(n > 0.8 ? [128, 100, 66] : [146, 116, 78]);
              else if (era <= 3) set(lx % 4 === 0 || ly % 4 === 0 ? [146, 140, 128] : n > 0.5 ? [164, 158, 146] : [158, 152, 140]);
              else set(n > 0.9 ? [140, 140, 144] : [158, 158, 160]);
              mul(light);
              snowK = 0.6;
              break;
            }
            case Cover.LAVA: {
              const heat = Math.min(1, w.timer[i] / 12);
              const f = hash(X >> 1, Y >> 1, frame >> 1);
              if (f > heat * 0.9 + 0.15) set([62, 34, 28]);
              else if (f < heat * 0.4) set([255, 214, 90]);
              else set(f < heat * 0.7 ? [255, 120, 24] : [204, 46, 14]);
              snowK = 0;
              break;
            }
            case Cover.BASALT:
              set(n > 0.85 ? [74, 70, 76] : [48, 46, 52]);
              mul(light);
              break;
            case Cover.FARM: {
              const growth = w.timer[i];
              if (roof(w.owner[i]) === 1) {
                // Asian rice paddy: flooded field with dykes and rows of rice.
                if (lx === 7 || ly === 7) set([120, 100, 62]);
                else if (growth < 0.8) {
                  set([86, 132, 150]);
                  if ((lx + (ly >> 1)) % 2 === 0 && growth > 0.1) set(growth < 0.4 ? [130, 190, 80] : [88, 160, 60]);
                } else set(n > 0.6 ? [236, 206, 96] : [214, 182, 70]);
                break;
              }
              if (lx === 7 || ly === 7) set(SOIL_DARK);
              else if (ly % 2 === 0) set(SOIL);
              else if (growth < 0.25) set(lx % 2 === 0 ? SPROUT : SOIL);
              else if (growth < 0.8) set(CROP);
              else set(n > 0.6 ? RIPE_HEAD : RIPE);
              if (ly % 2 === 1 && growth >= 0.25) mul(0.92 + n * 0.16);
              break;
            }
            case Cover.FIRE: {
              set([48, 30, 24]);
              const f = hash(X, Y, frame);
              const width = 0.8 + (ly / 7) * 2.8;
              const tall = 7 - ly < 4 + f * 4;
              if (Math.abs(lx - 3.5) < width * (0.6 + f * 0.6) && tall) {
                const heat = (ly / 7) * (0.4 + f * 0.6);
                set(heat > 0.55 ? [255, 222, 90] : heat > 0.3 ? [255, 140, 30] : [214, 44, 22]);
              }
              snowK = 0;
              break;
            }
            case Cover.ASH:
              mixTo(ASH, 0.85);
              if (n > 0.86) mul(0.6);
              else if (n < 0.05 && w.timer[i] > 25) set([200, 70, 30]);
              break;
          }

          if (snowK > 0 && snow > 0.08 && bayer(X, Y) < snow * 1.25 - 0.1) {
            r += (SNOW[0] * light - r) * snowK;
            g += (SNOW[1] * light - g) * snowK;
            b += (SNOW[2] * light - b) * snowK;
          }
        }

        const o = ((Y - y0) * pw + (X - x0)) * 4;
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        out[o + 3] = 255;
      }
    }
  }
}
