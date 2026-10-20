/**
 * Procedural pixel-art architecture. Every building is drawn into three canvases:
 *  - base:   the building itself
 *  - accent: white pixels that the scene tints with the owning nation's colour (doors, flags, awnings)
 *  - lights: window pixels that glow at night
 * All sprites are anchored at bottom-centre.
 */
import { rng } from '../world/noise';

export type Wall = 'straw' | 'mud' | 'wood' | 'log' | 'plaster' | 'timber' | 'stone' | 'brick' | 'glass' | 'concrete' | 'felt' | 'lattice';
export type Roof = 'cone' | 'thatch' | 'gable' | 'steep' | 'curved' | 'hip' | 'flat' | 'dome' | 'turf' | 'none';
export type Extra =
  | 'stilts'
  | 'pillars'
  | 'shutters'
  | 'balcony'
  | 'ac'
  | 'plants'
  | 'lanterns'
  | 'carving'
  | 'trapezoid'
  | 'band'
  | 'chimney'
  | 'dragon';

export interface Spec {
  w: number;
  floors: number;
  wall: Wall;
  roof: Roof;
  wallCol: string;
  roofCol: string;
  extras?: Extra[];
}

export const SPECIAL_KINDS = [
  'house',
  'granary',
  'market',
  'smithy',
  'barracks',
  'mill',
  'library',
  'factory',
  'school',
  'hospital',
  'office',
  'dock',
  'spaceport',
  // Added later: appended so the indices stored in saves stay valid.
  'monument',
  'theater',
  'bank',
  'powerplant',
  'university',
  'stadium',
  'airport',
  'park',
  'lab',
] as const;
export type Kind = (typeof SPECIAL_KINDS)[number];

export interface Art {
  base: HTMLCanvasElement;
  accent: HTMLCanvasElement;
  lights: HTMLCanvasElement;
  /** Chimney smoke sources, relative to the bottom-centre anchor. */
  smoke: [number, number][];
}

const S = (w: number, floors: number, wall: Wall, roof: Roof, wallCol: string, roofCol: string, extras: Extra[] = []): Spec => ({
  w,
  floors,
  wall,
  roof,
  wallCol,
  roofCol,
  extras,
});

/** House style per culture per era: stone, bronze, iron, medieval, industrial, modern, space age. */
export const HOUSE_SPECS: Record<string, Spec[]> = {
  lua_nuoc: [
    S(10, 1, 'straw', 'cone', '#b89a5a', '#c8a860'),
    S(12, 1, 'wood', 'thatch', '#8a6038', '#c4a45a', ['stilts']), // nhà sàn
    S(12, 1, 'wood', 'curved', '#9a6a3e', '#8a3a28', ['stilts', 'pillars']),
    S(13, 1, 'plaster', 'curved', '#e2d2aa', '#9a3a2a', ['pillars', 'lanterns']), // nhà ngói ba gian
    S(12, 2, 'plaster', 'hip', '#e8c860', '#a04a30', ['shutters', 'balcony']), // biệt thự kiểu Pháp
    S(8, 4, 'concrete', 'none', '#e8e0d0', '#888888', ['balcony', 'plants', 'ac']), // nhà ống
    S(10, 6, 'glass', 'none', '#6aa888', '#777777', ['balcony', 'plants']), // tháp vườn đứng
  ],
  hoa_ha: [
    S(10, 1, 'mud', 'cone', '#a08060', '#b89a5a'),
    S(12, 1, 'mud', 'gable', '#b08a62', '#7a6a5a'),
    S(13, 1, 'brick', 'curved', '#8a8a8a', '#4a4a52', ['pillars']),
    S(14, 2, 'plaster', 'curved', '#c84a3a', '#3a3a44', ['pillars', 'lanterns']),
    S(13, 2, 'brick', 'gable', '#7a6a62', '#4a4a52', ['shutters']), // thạch khố môn
    S(11, 5, 'glass', 'none', '#6a8aa8', '#777777', ['ac']),
    S(12, 7, 'glass', 'curved', '#b86a5a', '#e0b040'),
  ],
  dao_xa: [
    S(10, 1, 'straw', 'thatch', '#9a8050', '#b89a5a'),
    S(11, 1, 'wood', 'thatch', '#8a6038', '#b89a5a', ['stilts']),
    S(13, 1, 'timber', 'curved', '#ece6d8', '#3a3a44'),
    S(13, 2, 'lattice', 'curved', '#6a4428', '#2a2a32', ['lanterns']), // machiya
    S(13, 2, 'brick', 'hip', '#a45a42', '#3a3a44', ['shutters']), // Minh Trị
    S(11, 4, 'concrete', 'none', '#d8d8d4', '#777777', ['balcony', 'ac']),
    S(11, 6, 'glass', 'curved', '#c8d8e8', '#3a3a44'),
  ],
  nui_cao: [
    S(10, 1, 'stone', 'thatch', '#8a8478', '#a08a5a'),
    S(11, 1, 'mud', 'flat', '#b89a78', '#6a4a3a', ['trapezoid']),
    S(12, 1, 'plaster', 'flat', '#f0ece2', '#5a2a22', ['trapezoid', 'band']),
    S(13, 2, 'plaster', 'flat', '#f4f0e6', '#7a2a22', ['trapezoid', 'band']),
    S(13, 2, 'stone', 'flat', '#d8d0c0', '#7a2a22', ['trapezoid', 'band']),
    S(12, 4, 'concrete', 'flat', '#e8e4da', '#7a2a22', ['trapezoid', 'band', 'ac']),
    S(12, 5, 'concrete', 'flat', '#f4f0e6', '#7a2a22', ['trapezoid', 'band', 'plants']),
  ],
  thao_nguyen: [
    S(10, 1, 'felt', 'dome', '#e8e6dc', '#d8d4c8'),
    S(12, 1, 'felt', 'dome', '#f0eee4', '#c0392b'),
    S(13, 1, 'felt', 'dome', '#f4f2ea', '#d8a030'),
    S(14, 1, 'felt', 'dome', '#f8f6ee', '#d8a030', ['dragon']),
    S(12, 1, 'wood', 'gable', '#8a6a4a', '#3a7a5a', ['shutters', 'chimney']),
    S(12, 5, 'concrete', 'flat', '#c8c0b4', '#8a8a8a', ['balcony']),
    S(15, 2, 'glass', 'dome', '#cfe8f4', '#e0b040'), // ger kính
  ],
  bac_hai: [
    S(10, 1, 'straw', 'cone', '#8a7a5a', '#9a8a5a'),
    S(14, 1, 'wood', 'turf', '#6a4a2a', '#5a8a3a'), // nhà dài mái cỏ
    S(15, 1, 'log', 'turf', '#7a5232', '#4f8a3a', ['dragon']),
    S(12, 2, 'timber', 'steep', '#e0d4bc', '#5a3a2a', ['chimney']),
    S(12, 2, 'wood', 'steep', '#b8483a', '#3a3a3a', ['chimney', 'shutters']),
    S(11, 3, 'wood', 'steep', '#f0e6c8', '#2a2a2e', ['balcony']),
    S(12, 5, 'glass', 'steep', '#c0dcec', '#2a2a2e'),
  ],
  rung_sau: [
    S(10, 1, 'straw', 'cone', '#8a7a5a', '#9a8a5a'),
    S(12, 1, 'log', 'thatch', '#7a5232', '#a08a5a'),
    S(12, 1, 'log', 'steep', '#7a5232', '#5a4a3a', ['carving']), // izba
    S(13, 2, 'log', 'steep', '#8a5a34', '#4a6a3a', ['carving', 'chimney']),
    S(13, 2, 'brick', 'hip', '#b05a42', '#3a7a5a', ['shutters', 'chimney']),
    S(13, 5, 'concrete', 'flat', '#c8c4ba', '#8a8a8a', ['balcony']), // khrushchyovka
    S(12, 6, 'concrete', 'dome', '#e8e4da', '#e0b040'),
  ],
  hy_lap: [
    S(10, 1, 'stone', 'thatch', '#9a9284', '#a89a6a'),
    S(11, 1, 'mud', 'flat', '#e8e0d0', '#c8b898'),
    S(12, 1, 'plaster', 'hip', '#f2eee4', '#c8643a'),
    S(13, 2, 'stone', 'hip', '#e8e0cc', '#c0603a', ['pillars']),
    S(12, 2, 'plaster', 'hip', '#f0d8b8', '#b8583a', ['shutters', 'balcony']),
    S(12, 3, 'plaster', 'flat', '#fafaf6', '#3a6ab8', ['balcony', 'plants']), // nhà trắng Santorini
    S(12, 5, 'plaster', 'flat', '#ffffff', '#3a6ab8', ['balcony', 'plants']),
  ],
};

const EAST = new Set(['lua_nuoc', 'hoa_ha', 'dao_xa', 'nui_cao']);
const FH = 6; // pixels per floor

// ---------- colour helpers ----------

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

class P {
  base: CanvasRenderingContext2D;
  accent: CanvasRenderingContext2D;
  lights: CanvasRenderingContext2D;
  w: number;
  h: number;
  cx: number;
  bottom: number;
  rand: () => number;
  smoke: [number, number][] = [];

  constructor(w: number, h: number, seed: number) {
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c.getContext('2d')!;
    };
    this.base = mk();
    this.accent = mk();
    this.lights = mk();
    this.w = w;
    this.h = h;
    this.cx = Math.floor(w / 2);
    this.bottom = h - 1;
    this.rand = rng(seed);
  }

  r(x: number, y: number, w: number, h: number, col: string) {
    if (w <= 0 || h <= 0) return;
    this.base.fillStyle = col;
    this.base.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  acc(x: number, y: number, w: number, h: number) {
    this.accent.fillStyle = '#ffffff';
    this.accent.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.base.clearRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  lit(x: number, y: number, w: number, h: number, dark = '#2a3448') {
    this.r(x, y, w, h, dark);
    this.lights.fillStyle = '#ffd27a';
    this.lights.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  /** Horizontal run centred on cx. */
  row(y: number, w: number, col: string, dx = 0) {
    this.r(this.cx - Math.floor(w / 2) + dx, y, w, 1, col);
  }
  done(): Art {
    return { base: this.base.canvas, accent: this.accent.canvas, lights: this.lights.canvas, smoke: this.smoke.map(([x, y]) => [x - this.cx, y - this.bottom]) };
  }
}

// ---------- building parts ----------

function walls(p: P, x0: number, top: number, w: number, h: number, wall: Wall, col: string) {
  const dk = shade(col, -0.18);
  const lt = shade(col, 0.15);
  p.r(x0, top, w, h, col);
  switch (wall) {
    case 'straw':
      for (let x = 0; x < w; x += 2) p.r(x0 + x, top, 1, h, dk);
      break;
    case 'mud':
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p.rand() < 0.15) p.r(x0 + x, top + y, 1, 1, dk);
      p.r(x0, top + h - 1, w, 1, dk);
      break;
    case 'wood':
      for (let y = 1; y < h; y += 2) p.r(x0, top + y, w, 1, dk);
      break;
    case 'log':
      for (let y = 1; y < h; y += 2) p.r(x0, top + y, w, 1, dk);
      for (let y = 0; y < h; y += 2) {
        p.r(x0 - 1, top + y, 1, 1, lt);
        p.r(x0 + w, top + y, 1, 1, lt);
      }
      break;
    case 'plaster':
      p.r(x0 + w - 1, top, 1, h, dk);
      p.r(x0, top + h - 1, w, 1, shade(col, -0.1));
      break;
    case 'timber': {
      const beam = '#5a3a24';
      p.r(x0, top, 1, h, beam);
      p.r(x0 + w - 1, top, 1, h, beam);
      p.r(x0 + Math.floor(w / 2), top, 1, h, beam);
      for (let y = 0; y < h; y += FH) p.r(x0, top + y, w, 1, beam);
      break;
    }
    case 'stone':
      for (let y = 0; y < h; y += 2) {
        p.r(x0, top + y + 1, w, 1, dk);
        for (let x = (y / 2) % 2 ? 1 : 3; x < w; x += 4) p.r(x0 + x, top + y, 1, 1, dk);
      }
      break;
    case 'brick':
      for (let y = 0; y < h; y += 2) {
        p.r(x0, top + y + 1, w, 1, shade(col, 0.25));
        for (let x = (y / 2) % 2 ? 0 : 2; x < w; x += 4) p.r(x0 + x, top + y, 1, 1, shade(col, 0.25));
      }
      break;
    case 'glass':
      for (let x = 0; x < w; x += 3) p.r(x0 + x, top, 1, h, shade(col, 0.35));
      for (let y = 0; y < h; y += 3) p.r(x0, top + y, w, 1, shade(col, 0.35));
      p.r(x0 + 1, top + 1, 1, h - 2, shade(col, 0.55));
      break;
    case 'concrete':
      for (let y = FH - 1; y < h; y += FH) p.r(x0, top + y, w, 1, dk);
      p.r(x0 + w - 1, top, 1, h, dk);
      break;
    case 'felt':
      for (let x = 0; x < w; x++) if ((x + top) % 3 === 0) p.r(x0 + x, top, 1, h, shade(col, -0.08));
      p.r(x0, top + 1, w, 1, '#8a5a3a');
      break;
    case 'lattice':
      for (let x = 0; x < w; x += 2) p.r(x0 + x, top, 1, h, dk);
      for (let y = FH - 1; y < h; y += FH) p.r(x0, top + y, w, 1, '#3a2414');
      break;
  }
}

function windows(p: P, x0: number, top: number, w: number, floors: number, s: Spec) {
  if (s.wall === 'straw' || s.wall === 'felt') return;
  const tz = s.extras?.includes('trapezoid');
  for (let f = 0; f < floors; f++) {
    const y = top + f * FH + 2;
    const ground = f === floors - 1;
    for (let x = x0 + 2; x <= x0 + w - 3; x += 4) {
      if (ground && Math.abs(x + 1 - p.cx) <= 1) continue; // leave room for the door
      if (s.wall === 'glass') continue;
      if (tz) {
        p.r(x - 1, y + 2, 4, 1, '#1a1a1a');
        p.r(x - 1, y - 1, 1, 3, '#1a1a1a');
        p.r(x + 2, y - 1, 1, 3, '#1a1a1a');
      }
      p.lit(x, y, 2, 2);
      if (s.extras?.includes('shutters')) {
        p.r(x - 1, y, 1, 2, '#4a7a4a');
        p.r(x + 2, y, 1, 2, '#4a7a4a');
      }
    }
    if (s.wall === 'glass') {
      for (let x = x0 + 1; x < x0 + w - 1; x += 3) if (p.rand() < 0.55) p.lit(x + 1, y - 1, 1, 2, shade(s.wallCol, -0.25));
    }
  }
}

function door(p: P, bottom: number, wall: Wall) {
  if (wall === 'felt') {
    p.acc(p.cx - 1, bottom - 3, 2, 3);
    return;
  }
  p.r(p.cx - 2, bottom - 4, 4, 4, '#3a2414');
  p.acc(p.cx - 1, bottom - 3, 2, 3);
}

function roof(p: P, x0: number, top: number, w: number, s: Spec, tall = 0): number {
  const col = s.roofCol;
  const dk = shade(col, -0.25);
  const lt = shade(col, 0.18);
  const cx = x0 + w / 2;
  switch (s.roof) {
    case 'cone': {
      const h = Math.ceil(w / 2) + 2 + tall;
      for (let i = 0; i < h; i++) {
        const half = ((w / 2 + 1) * (h - i)) / h;
        p.r(cx - half, top - h + i + 1, half * 2, 1, i % 2 ? col : dk);
      }
      return top - h;
    }
    case 'thatch': {
      const h = 4 + tall;
      for (let i = 0; i < h; i++) {
        const half = w / 2 + 1 - i;
        p.r(cx - half, top - i, half * 2, 1, i % 2 ? col : lt);
      }
      for (let x = x0 - 1; x < x0 + w + 1; x += 2) p.r(x, top + 1, 1, 1, dk); // ragged straw fringe
      return top - h;
    }
    case 'gable':
    case 'turf': {
      const h = Math.floor(w / 2) - 1 + tall;
      for (let i = 0; i <= h; i++) {
        const half = w / 2 + 1 - i;
        const c = s.roof === 'turf' ? (i < 2 ? '#6a4a2a' : p.rand() < 0.3 ? shade(col, 0.2) : col) : i % 2 ? col : dk;
        p.r(cx - Math.max(1, half), top - i, Math.max(2, half * 2), 1, c);
      }
      return top - h;
    }
    case 'steep': {
      const h = Math.floor(w * 0.75) + tall;
      for (let i = 0; i <= h; i++) {
        const half = ((w / 2 + 1) * (h - i)) / h + 0.5;
        p.r(cx - half, top - i, half * 2, 1, i % 3 === 0 ? dk : col);
      }
      if (s.extras?.includes('carving') || s.extras?.includes('dragon')) {
        p.r(cx - 1, top - h - 1, 1, 1, lt);
        p.r(cx, top - h - 1, 1, 1, lt);
        p.r(cx - 2, top - h - 2, 1, 1, lt);
        p.r(cx + 1, top - h - 2, 1, 1, lt);
      }
      return top - h;
    }
    case 'curved': {
      // East Asian roof: wide eaves with upturned corners and an ornamented ridge.
      const h = 4 + tall;
      for (let i = 0; i < h; i++) {
        const half = w / 2 + 2 - i;
        p.r(cx - half, top - i, half * 2, 1, i === 0 ? dk : i % 2 ? col : lt);
      }
      p.r(cx - w / 2 - 3, top - 1, 1, 1, dk);
      p.r(cx + w / 2 + 2, top - 1, 1, 1, dk);
      p.r(cx - w / 2 + 1, top - h, w - 2, 1, dk);
      p.r(cx - w / 2 + 1, top - h - 1, 1, 1, dk);
      p.r(cx + w / 2 - 2, top - h - 1, 1, 1, dk);
      if (s.extras?.includes('lanterns')) {
        p.r(cx - w / 2, top + 1, 1, 2, '#e03a2a');
        p.r(cx + w / 2 - 1, top + 1, 1, 2, '#e03a2a');
      }
      return top - h - 1;
    }
    case 'hip': {
      const h = 3 + tall;
      for (let i = 0; i < h; i++) {
        const half = w / 2 + 1 - i * 1.5;
        p.r(cx - half, top - i, half * 2, 1, i % 2 ? lt : col);
      }
      return top - h;
    }
    case 'flat': {
      p.r(x0 - 1, top - 1, w + 2, 2, col);
      if (s.extras?.includes('band')) p.r(x0, top + 1, w, 1, '#3a1a14');
      return top - 1;
    }
    case 'dome': {
      // Ger: low felt dome with a toono crown.
      const rad = w / 2 + 1;
      for (let i = 0; i < 4; i++) {
        const half = Math.sqrt(Math.max(0, rad * rad - (i * 1.4) ** 2));
        p.r(cx - half, top - i, half * 2, 1, i === 3 ? shade(s.wallCol, -0.1) : s.wallCol);
      }
      p.r(cx - 2, top - 4, 4, 1, col);
      p.r(cx - w / 2, top, w, 1, col);
      if (s.extras?.includes('dragon')) p.r(cx - 1, top - 6, 2, 2, '#d8a030');
      return top - 4;
    }
    case 'none': {
      p.r(x0, top - 1, w, 1, shade(s.wallCol, -0.3));
      if (p.rand() < 0.7) p.r(x0 + 1, top - 3, 3, 2, '#6a6a72'); // water tank
      if (s.extras?.includes('ac')) p.r(x0 + w - 3, top - 2, 2, 1, '#9a9aa2');
      return top - 3;
    }
  }
  return top;
}

function flag(p: P, x: number, y: number, h = 5) {
  p.r(x, y - h, 1, h, '#5a4a3a');
  p.acc(x + 1, y - h, 3, 2);
}

/** Draw a building body from a spec at the bottom-centre of the painter. Returns the roof top y. */
function body(p: P, s: Spec, opts: { w?: number; floors?: number; stilts?: boolean; doorless?: boolean; tall?: number } = {}) {
  const w = opts.w ?? s.w;
  const floors = opts.floors ?? s.floors;
  const x0 = p.cx - Math.floor(w / 2);
  const stilts = (opts.stilts ?? s.extras?.includes('stilts')) ? 3 : 0;
  const base = p.bottom - stilts;
  const wallH = s.wall === 'felt' ? 5 : floors * FH;
  const top = base - wallH + 1;
  if (stilts) {
    for (const x of [x0 + 1, x0 + w - 2, p.cx]) p.r(x, base + 1, 1, stilts, '#5a3a24');
    p.r(p.cx + 2, base + 1, 1, stilts, '#8a6a4a');
  }
  // shadow
  p.r(x0, p.bottom, w + 1, 1, 'rgba(0,0,0,0.25)');
  walls(p, x0, top, w, wallH, s.wall, s.wallCol);
  if (s.wall !== 'felt') windows(p, x0, top, w, floors, s);
  if (s.extras?.includes('pillars')) {
    p.r(x0, top, 1, wallH, '#8a2a20');
    p.r(x0 + w - 1, top, 1, wallH, '#8a2a20');
  }
  if (s.extras?.includes('balcony') && floors > 1) {
    for (let f = 0; f < floors - 1; f++) {
      const y = top + (f + 1) * FH - 1;
      p.r(x0 - 1, y, w + 2, 1, '#d8d8d8');
      if (s.extras.includes('plants')) p.r(x0 + (f % 2 ? w - 2 : 1), y - 1, 1, 1, '#4a9a4a');
    }
  }
  if (s.extras?.includes('ac')) for (let f = 0; f < floors; f += 2) p.r(x0 + w, top + f * FH + 2, 1, 1, '#a0a0a8');
  if (!opts.doorless) door(p, base, s.wall);
  const roofTop = roof(p, x0, top - 1, w, s, opts.tall ?? 0);
  if (s.extras?.includes('chimney')) {
    p.r(x0 + w - 3, roofTop + 1, 2, top - roofTop, '#6a5a52');
    p.smoke.push([x0 + w - 2, roofTop]);
  }
  return { x0, top, roofTop, w };
}

// ---------- public generators ----------

export function drawHouse(culture: string, era: number, variant: number): Art {
  const spec = HOUSE_SPECS[culture]?.[era] ?? HOUSE_SPECS.lua_nuoc[era];
  const p = new P(26, 48, culture.length * 97 + era * 13 + variant * 7919);
  const w = spec.w + (variant % 3) - 1;
  const floors = spec.floors > 1 ? spec.floors + (variant % 2) : spec.floors;
  const s = { ...spec, wallCol: variant % 2 ? shade(spec.wallCol, -0.06) : spec.wallCol };
  const b = body(p, s, { w, floors });
  if (era <= 3 && variant === 2) flag(p, b.x0 + b.w - 1, b.roofTop + 2, 4);
  return p.done();
}

/** Special buildings: what a nation builds as it develops. */
export function drawSpecial(kind: Kind, culture: string, era: number): Art {
  const spec = HOUSE_SPECS[culture]?.[Math.min(era, 5)] ?? HOUSE_SPECS.lua_nuoc[era];
  const east = EAST.has(culture);
  const p = new P(32, 64, kind.length * 31 + era);
  const cx = p.cx;
  const B = p.bottom;
  switch (kind) {
    case 'granary': {
      const s = { ...spec, wall: (spec.wall === 'felt' ? 'wood' : spec.wall) as Wall, roof: (spec.roof === 'dome' ? 'thatch' : spec.roof) as Roof };
      body(p, s, { w: 9, floors: 1, stilts: true, doorless: true });
      for (const [x, y] of [[-7, 0], [-6, -1], [-8, -1], [6, 0], [7, -1]]) p.r(cx + x, B + y - 1, 2, 2, '#c8a860');
      break;
    }
    case 'market': {
      for (const dx of [-9, -2, 5]) {
        p.r(cx + dx, B - 6, 1, 6, '#5a3a24');
        p.r(cx + dx + 5, B - 6, 1, 6, '#5a3a24');
        for (let x = 0; x < 7; x++) {
          if (x % 2) p.acc(cx + dx - 1 + x, B - 8, 1, 2);
          else p.r(cx + dx - 1 + x, B - 8, 1, 2, '#f2eee4');
        }
        p.r(cx + dx + 1, B - 2, 4, 2, '#8a5a32');
        p.r(cx + dx + 1, B - 3, 1, 1, '#e04a3a');
        p.r(cx + dx + 3, B - 3, 1, 1, '#e0c040');
        p.r(cx + dx + 2, B - 3, 1, 1, '#5aa04a');
      }
      break;
    }
    case 'smithy': {
      const b = body(p, { ...spec, wall: spec.wall === 'felt' ? 'wood' : spec.wall, roof: spec.roof === 'dome' ? 'gable' : spec.roof }, { w: 12, floors: 1 });
      p.r(b.x0 + 1, b.roofTop - 3, 3, b.top - b.roofTop + 3, '#5a4a44');
      p.smoke.push([b.x0 + 2, b.roofTop - 3]);
      p.r(cx + 8, B - 2, 4, 1, '#6a6a72');
      p.r(cx + 9, B - 1, 2, 1, '#4a4a52');
      p.lights.fillStyle = '#ff8030';
      p.lights.fillRect(cx - 4, B - 3, 2, 2);
      p.r(cx - 4, B - 3, 2, 2, '#ff8030');
      break;
    }
    case 'barracks': {
      const b = body(p, { ...spec, wall: spec.wall === 'felt' ? 'wood' : spec.wall, roof: spec.roof === 'dome' ? 'gable' : spec.roof, floors: 1 }, { w: 20, floors: era >= 4 ? 2 : 1 });
      flag(p, b.x0, b.roofTop + 3, 7);
      flag(p, b.x0 + b.w - 1, b.roofTop + 3, 7);
      for (let x = -4; x <= 4; x += 2) p.r(cx + x + 12, B - 5, 1, 5, '#8a8a92');
      break;
    }
    case 'mill': {
      if (east) {
        // Water wheel beside a mill house.
        body(p, { ...spec, roof: spec.roof === 'none' ? 'gable' : spec.roof }, { w: 10, floors: 1 });
        const wx = cx + 9;
        const wy = B - 5;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          p.r(wx + Math.round(Math.cos(ang) * 4), wy + Math.round(Math.sin(ang) * 4), 1, 1, '#6a4428');
          p.r(wx + Math.round(Math.cos(ang) * 2), wy + Math.round(Math.sin(ang) * 2), 1, 1, '#8a6a4a');
        }
        p.r(wx, wy, 1, 1, '#3a2414');
      } else {
        // Windmill tower with sails.
        for (let y = 0; y < 16; y++) {
          const half = 3 + Math.floor(y / 6);
          p.r(cx - half, B - 15 + y, half * 2, 1, y % 4 === 0 ? '#c8c0b0' : '#e8e0d0');
        }
        p.r(cx - 4, B - 18, 8, 3, '#7a4a32');
        p.r(cx - 1, B - 4, 2, 4, '#3a2414');
        const hx = cx;
        const hy = B - 15;
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          for (let k = 1; k <= 9; k++) p.r(hx + dx * k, hy + dy * k, 1, 1, k > 3 ? '#f2eee4' : '#6a4428');
        }
        p.r(hx, hy, 1, 1, '#3a2414');
      }
      break;
    }
    case 'library': {
      const b = body(p, { ...spec, wall: era >= 3 ? 'stone' : spec.wall === 'felt' ? 'wood' : spec.wall }, { w: 16, floors: 2, tall: east ? 1 : 0 });
      if (!east) {
        for (let x = b.x0 + 1; x < b.x0 + b.w - 1; x += 3) p.r(x, b.top + FH, 1, FH * 2 - 1, '#f2eee4');
        p.r(b.x0 - 1, b.top + FH - 1, b.w + 2, 1, '#d8d0c0');
      }
      break;
    }
    case 'factory': {
      const x0 = cx - 10;
      walls(p, x0, B - 11, 20, 12, 'brick', '#a4483a');
      for (let x = 0; x < 20; x += 5) {
        for (let i = 0; i < 4; i++) p.r(x0 + x + i, B - 12 - i, 5 - i, 1, '#4a4a52');
        p.lit(x0 + x + 1, B - 8, 2, 3, '#3a4048');
      }
      p.r(x0 + 2, B - 22, 3, 10, '#6a3a2a');
      p.r(x0 + 14, B - 19, 3, 7, '#6a3a2a');
      p.r(x0 + 2, B - 22, 3, 1, '#2a2a2a');
      p.smoke.push([x0 + 3, B - 22], [x0 + 15, B - 19]);
      p.acc(x0 + 7, B - 4, 5, 4);
      break;
    }
    case 'school': {
      const b = body(p, { ...spec, wall: era >= 5 ? 'concrete' : 'brick', wallCol: era >= 5 ? '#e8e4da' : '#b8604a', roof: spec.roof === 'none' ? 'flat' : spec.roof === 'dome' ? 'hip' : spec.roof }, { w: 18, floors: 2 });
      p.r(cx - 2, b.roofTop - 8, 4, 8, '#e8e0d0');
      p.r(cx - 3, b.roofTop - 10, 6, 2, '#5a4a44');
      p.r(cx - 1, b.roofTop - 6, 2, 2, '#ffffff');
      p.r(cx, b.roofTop - 6, 1, 1, '#2a2a2a');
      flag(p, cx, b.roofTop - 10, 5);
      break;
    }
    case 'hospital': {
      const b = body(p, S(18, 3, 'concrete', 'flat', '#f4f4f0', '#c8c8c8'), {});
      p.r(cx - 1, b.top + 1, 3, 1, '#e03a3a');
      p.r(cx, b.top, 1, 3, '#e03a3a');
      break;
    }
    case 'office': {
      const b = body(p, S(12, 8, 'glass', 'none', east ? '#5a7a98' : '#4a6a88', '#777777'), {});
      if (east) {
        for (let i = 0; i < 3; i++) p.r(cx - 5 + i, b.roofTop - i * 2, 10 - i * 2, 1, '#8aa8c8');
        p.r(cx, b.roofTop - 10, 1, 4, '#cccccc');
      } else p.r(cx, b.roofTop - 6, 1, 6, '#cccccc');
      p.acc(b.x0, b.top, b.w, 1);
      break;
    }
    case 'dock': {
      for (let x = -11; x < 11; x++) p.r(cx + x, B - 2, 1, 1, x % 2 ? '#8a6a4a' : '#7a5a3a');
      for (const x of [-10, -4, 2, 8]) p.r(cx + x, B - 1, 1, 2, '#5a3a24');
      // a boat
      p.r(cx - 6, B - 4, 10, 2, '#5a3a24');
      p.r(cx - 5, B - 3, 8, 1, '#7a5232');
      p.r(cx - 1, B - 12, 1, 8, '#5a3a24');
      p.acc(cx, B - 11, 4, 5);
      p.r(cx + 6, B - 4, 3, 2, '#a08050');
      break;
    }
    case 'spaceport': {
      // Launch pad, gantry and a rocket on standby.
      p.r(cx - 13, B - 2, 26, 3, '#7a7a82');
      p.r(cx - 12, B - 2, 24, 1, '#9a9aa2');
      for (let y = 0; y < 30; y += 2) {
        p.r(cx - 8, B - 3 - y, 1, 2, '#c8402a');
        p.r(cx - 6, B - 3 - y, 1, 2, '#c8402a');
        p.r(cx - 8, B - 3 - y, 3, 1, '#8a2a1a');
      }
      p.r(cx - 1, B - 30, 5, 27, '#f2f2f4');
      p.r(cx + 3, B - 30, 1, 27, '#c8c8cc');
      p.acc(cx - 1, B - 22, 5, 2);
      p.r(cx, B - 33, 3, 3, '#f2f2f4');
      p.r(cx + 1, B - 35, 1, 2, '#f2f2f4');
      p.r(cx - 3, B - 6, 2, 3, '#c8c8cc');
      p.r(cx + 4, B - 6, 2, 3, '#c8c8cc');
      // satellite dish
      p.r(cx + 9, B - 8, 1, 6, '#9a9aa2');
      p.r(cx + 7, B - 11, 6, 2, '#e8e8ec');
      p.r(cx + 8, B - 12, 4, 1, '#e8e8ec');
      p.lit(cx - 12, B - 1, 2, 1, '#3a3a44');
      p.lit(cx + 10, B - 1, 2, 1, '#3a3a44');
      break;
    }
    case 'monument': {
      // A stepped plinth with an obelisk (west) or a stupa-like tower (east).
      p.r(cx - 7, B - 3, 14, 3, '#a8a090');
      p.r(cx - 5, B - 5, 10, 2, '#b8b0a0');
      if (east) {
        for (let i = 0; i < 5; i++) p.r(cx - 4 + i, B - 8 - i * 3, 8 - i * 2, 3, i % 2 ? '#c8b070' : '#d8c080');
        p.r(cx, B - 23, 1, 4, '#e8d090');
      } else {
        p.r(cx - 2, B - 22, 4, 17, '#d8d0c0');
        p.r(cx - 1, B - 24, 2, 2, '#e8e0d0');
        p.r(cx + 1, B - 22, 1, 17, '#b8b0a0');
      }
      p.acc(cx - 5, B - 4, 10, 1);
      break;
    }
    case 'theater': {
      const b = body(p, { ...spec, wall: 'stone', wallCol: '#d8cdb8', roof: spec.roof === 'none' || spec.roof === 'dome' ? 'gable' : spec.roof }, { w: 18, floors: 2 });
      for (let x = b.x0 + 1; x < b.x0 + b.w - 1; x += 3) p.r(x, b.top + 2, 1, B - b.top - 2, '#f2eee4');
      p.acc(b.x0 + 2, b.top, b.w - 4, 1);
      p.r(cx - 2, B - 4, 4, 4, '#5a2a2a');
      break;
    }
    case 'bank': {
      const b = body(p, S(16, 2, 'stone', 'flat', '#e0d8c8', '#a8a090'), {});
      for (let x = b.x0 + 1; x < b.x0 + b.w - 1; x += 3) p.r(x, b.top + 1, 1, B - b.top - 1, '#f4f0e8');
      for (let i = 0; i < 4; i++) p.r(cx - 8 + i, b.top - 1 - i, 16 - i * 2, 1, '#d0c8b8');
      p.r(cx - 1, b.top - 4, 2, 1, '#e0c040');
      p.acc(b.x0, B - 1, b.w, 1);
      break;
    }
    case 'powerplant': {
      // Cooling towers and a turbine hall.
      for (const dx of [-10, 1]) {
        for (let y = 0; y < 18; y++) {
          const w = 9 - Math.round(Math.sin((y / 18) * Math.PI) * 2);
          p.r(cx + dx + (9 - w) / 2, B - 1 - y, w, 1, y % 5 === 0 ? '#a8a8a8' : '#c8c8c8');
        }
        p.smoke.push([cx + dx + 4, B - 19]);
      }
      p.r(cx - 12, B - 6, 24, 6, '#6a7078');
      p.lit(cx - 10, B - 4, 3, 2);
      p.lit(cx + 6, B - 4, 3, 2);
      p.acc(cx - 12, B - 7, 24, 1);
      break;
    }
    case 'university': {
      const b = body(p, { ...spec, wall: era >= 5 ? 'brick' : 'stone', wallCol: '#c8b8a0', roof: spec.roof === 'none' ? 'flat' : spec.roof }, { w: 20, floors: 3 });
      // A clock tower with a dome.
      p.r(cx - 2, b.roofTop - 12, 5, 12, '#d8cdb8');
      p.r(cx - 3, b.roofTop - 15, 7, 3, '#5a7a68');
      p.r(cx - 1, b.roofTop - 17, 3, 2, '#5a7a68');
      p.r(cx, b.roofTop - 9, 1, 1, '#2a2a2a');
      flag(p, cx, b.roofTop - 17, 4);
      break;
    }
    case 'stadium': {
      // An oval bowl with floodlights.
      for (let y = 0; y < 9; y++) {
        const w = 26 - Math.abs(4 - y) * 2;
        p.r(cx - w / 2, B - 1 - y, w, 1, y < 2 ? '#8a8a92' : '#b8b8c0');
      }
      p.r(cx - 8, B - 6, 16, 3, '#4a9a4a');
      p.r(cx - 1, B - 6, 1, 3, '#e8e8e8');
      for (const dx of [-13, 12]) {
        p.r(cx + dx, B - 18, 1, 12, '#6a6a72');
        p.lit(cx + dx - 1, B - 19, 3, 1, '#4a4a52');
      }
      p.acc(cx - 11, B - 9, 22, 1);
      break;
    }
    case 'airport': {
      // Runway, control tower and a parked jet.
      p.r(cx - 15, B - 2, 30, 2, '#4a4a52');
      for (let x = -13; x < 13; x += 4) p.r(cx + x, B - 1, 2, 1, '#e8e8e8');
      p.r(cx + 8, B - 16, 3, 14, '#c8c8cc');
      p.r(cx + 6, B - 19, 7, 3, '#5a7a98');
      p.lit(cx + 7, B - 18, 5, 1, '#3a4a58');
      p.r(cx - 10, B - 5, 12, 2, '#e8e8ec');
      p.r(cx - 6, B - 8, 3, 6, '#e8e8ec');
      p.r(cx - 11, B - 7, 2, 2, '#e8e8ec');
      p.acc(cx - 10, B - 5, 2, 1);
      break;
    }
    case 'park': {
      p.r(cx - 13, B - 3, 26, 3, '#5aa04a');
      for (const dx of [-10, -3, 5, 10]) {
        p.r(cx + dx, B - 7, 1, 4, '#5a3a24');
        p.r(cx + dx - 2, B - 11, 5, 4, '#3a8a3a');
        p.r(cx + dx - 1, B - 12, 3, 1, '#4a9a4a');
      }
      p.r(cx - 1, B - 3, 3, 2, '#7ab8e8');
      p.r(cx, B - 5, 1, 2, '#c8c8cc');
      p.acc(cx - 6, B - 2, 2, 1);
      break;
    }
    case 'lab': {
      // A glass dome research centre with an antenna mast.
      for (let y = 0; y < 10; y++) {
        const w = Math.round(Math.sqrt(1 - (y / 10) ** 2) * 22);
        p.r(cx - w / 2, B - 3 - y, w, 1, y % 3 ? '#8ac8e8' : '#c8e8f8');
      }
      p.r(cx - 12, B - 3, 24, 3, '#d8d8e0');
      p.r(cx + 9, B - 22, 1, 19, '#9a9aa2');
      p.lit(cx + 8, B - 23, 3, 1, '#3a3a44');
      p.acc(cx - 12, B - 3, 24, 1);
      p.lit(cx - 4, B - 6, 8, 2, '#3a5a78');
      break;
    }
    case 'house':
      return drawHouse(culture, era, 0);
  }
  return p.done();
}

/** The seat of power at the village centre: from a totem to a palace to a skyline. */
export function drawPalace(culture: string, era: number): Art {
  const p = new P(56, 80, culture.length * 53 + era * 17);
  const cx = p.cx;
  const B = p.bottom;
  const spec = HOUSE_SPECS[culture]?.[era] ?? HOUSE_SPECS.lua_nuoc[era];

  if (era === 0) {
    // Totem pole and standing stones around the fire (fire is animated by the scene).
    p.r(cx - 12, B - 12, 2, 12, '#7a5232');
    for (let y = 0; y < 12; y += 4) {
      p.r(cx - 13, B - 12 + y, 4, 3, y % 8 ? '#b8483a' : '#e0c040');
      p.r(cx - 12, B - 11 + y, 1, 1, '#1a1a1a');
    }
    p.acc(cx - 13, B - 14, 4, 2);
    for (const [x, h] of [[8, 5], [11, 4], [14, 6]]) p.r(cx + x, B - h, 2, h, '#8a8a84');
    return p.done();
  }
  if (era === 1) {
    const b = body(p, spec, { w: 20, floors: 1, tall: 1 });
    flag(p, b.x0 - 1, B, 10);
    flag(p, b.x0 + b.w, B, 10);
    return p.done();
  }

  if (era >= 6) {
    // Arcology: a soaring spire with sky rings, glass domes at its feet.
    const east = EAST.has(culture);
    for (const [dx, r] of [[-16, 7], [16, 6]]) {
      for (let i = 0; i < r; i++) {
        const half = Math.round(Math.sqrt(r * r - i * i));
        p.r(cx + dx - half, B - i, half * 2, 1, i % 2 ? '#bfe0f0' : '#d8f0fa');
      }
    }
    walls(p, cx - 6, B - 62, 12, 63, 'glass', east ? '#6a9ab8' : '#5a8ab0');
    for (let y = B - 60; y < B - 3; y += 3) for (let x = cx - 5; x < cx + 6; x += 2) if (p.rand() < 0.5) p.lit(x, y, 1, 2, '#2a4a68');
    for (const y of [B - 22, B - 44]) {
      p.r(cx - 12, y, 24, 2, '#e8f4fa');
      p.r(cx - 10, y + 2, 20, 1, '#9ac8e0');
    }
    p.r(cx - 3, B - 70, 6, 8, '#d8f0fa');
    p.r(cx - 1, B - 78, 2, 8, '#f2f2f2');
    p.acc(cx - 6, B - 63, 12, 1);
    p.acc(cx - 12, B - 45, 24, 1);
    p.lights.fillStyle = '#8af0ff';
    p.lights.fillRect(cx - 1, B - 79, 2, 2);
    return p.done();
  }

  if (era >= 5) {
    // Skyline: a signature tower flanked by offices.
    const east = EAST.has(culture);
    walls(p, cx - 14, B - 24, 7, 25, 'glass', '#5a7a98');
    walls(p, cx + 8, B - 30, 7, 31, 'glass', '#4a6a88');
    walls(p, cx - 5, B - 52, 11, 53, 'glass', east ? '#6a8aa8' : '#3a5a78');
    for (let y = B - 50; y < B - 2; y += 3) for (let x = cx - 4; x < cx + 5; x += 2) if (p.rand() < 0.5) p.lit(x, y, 1, 2, '#2a3a58');
    if (east) for (let i = 0; i < 5; i++) p.r(cx - 6 + (i % 2), B - 52 + i * 8, 13 - (i % 2) * 2, 1, '#9ab8d8');
    else if (culture === 'rung_sau') for (let i = 0; i < 4; i++) p.r(cx - 5 + i, B - 52 - i * 2, 11 - i * 2, 2, '#c8b080');
    p.r(cx, B - 62, 1, 10, '#cccccc');
    p.acc(cx - 5, B - 53, 11, 1);
    return p.done();
  }

  switch (culture) {
    case 'lua_nuoc':
      if (era <= 3) {
        // Ngọ Môn-style gate: red base with arches, golden two-tier pavilion.
        walls(p, cx - 18, B - 9, 36, 10, 'stone', '#a8463a');
        for (const x of [-10, -2, 6]) p.r(cx + x, B - 6, 4, 6, '#2a1a14');
        p.acc(cx - 1, B - 5, 2, 5);
        const s = { ...spec, roofCol: '#e0b040', wallCol: '#b03a2a', wall: 'plaster' as Wall, roof: 'curved' as Roof };
        const pb = new Array<number>();
        void pb;
        walls(p, cx - 10, B - 18, 20, 9, 'plaster', '#b03a2a');
        roof(p, cx - 10, B - 19, 20, s);
        walls(p, cx - 6, B - 27, 12, 5, 'plaster', '#b03a2a');
        roof(p, cx - 6, B - 28, 12, s);
      } else {
        // Colonial-era hall with a clock tower.
        body(p, S(30, 2, 'plaster', 'hip', '#e8c860', '#a04a30', ['shutters']), {});
        p.r(cx - 3, B - 26, 6, 14, '#e8c860');
        p.r(cx - 1, B - 22, 2, 2, '#ffffff');
        roof(p, cx - 3, B - 27, 6, S(6, 1, 'plaster', 'hip', '#e8c860', '#a04a30'));
        flag(p, cx, B - 30, 6);
      }
      break;
    case 'hoa_ha': {
      // Imperial hall on a white terrace with a golden double roof.
      for (let i = 0; i < 3; i++) p.r(cx - 22 + i * 2, B - i * 2 - 1, 44 - i * 4, 2, i % 2 ? '#e8e4dc' : '#f4f2ec');
      const hall = { ...spec, wall: 'plaster' as Wall, wallCol: '#b8322e', roof: 'curved' as Roof, roofCol: era >= 3 ? '#e0b040' : '#4a4a52' };
      walls(p, cx - 14, B - 16, 28, 11, 'plaster', '#b8322e');
      for (let x = cx - 14; x < cx + 14; x += 4) p.r(x, B - 16, 1, 11, '#7a1a14');
      p.acc(cx - 2, B - 11, 4, 6);
      roof(p, cx - 14, B - 17, 28, hall, 1);
      if (era >= 3) {
        walls(p, cx - 9, B - 27, 18, 4, 'plaster', '#b8322e');
        roof(p, cx - 9, B - 28, 18, hall);
      }
      if (era === 4) flag(p, cx, B - 34, 6);
      break;
    }
    case 'dao_xa': {
      // Castle keep (tenshu): sloped stone base, stacked white storeys with dark roofs.
      for (let y = 0; y < 8; y++) p.r(cx - 16 + Math.floor(y / 2), B - y, 32 - Math.floor(y / 2) * 2, 1, y % 2 ? '#8a867e' : '#9a968e');
      const tiers = era >= 3 ? 3 : 2;
      let base = B - 8;
      for (let t = 0; t < tiers; t++) {
        const w = 22 - t * 6;
        walls(p, cx - w / 2, base - 5, w, 5, 'plaster', '#f2f0ea');
        p.lit(cx - 2, base - 3, 1, 1);
        p.lit(cx + 1, base - 3, 1, 1);
        base = roof(p, cx - w / 2, base - 6, w, S(w, 1, 'plaster', 'curved', '#f2f0ea', '#2a2a32')) - 0;
      }
      p.r(cx - 1, base - 1, 1, 2, '#e0b040');
      p.r(cx + 1, base - 1, 1, 2, '#e0b040');
      if (era === 4) flag(p, cx + 12, B - 8, 8);
      break;
    }
    case 'nui_cao': {
      // Potala-like: broad white terraces, a red central block, gold roof ornaments.
      for (let t = 0; t < (era >= 3 ? 3 : 2); t++) {
        const w = 44 - t * 10;
        const y = B - t * 9;
        walls(p, cx - w / 2, y - 8, w, 9, 'plaster', '#f4f0e6');
        p.r(cx - w / 2, y - 9, w, 1, '#5a2a22');
        for (let x = cx - w / 2 + 3; x < cx + w / 2 - 3; x += 4) {
          p.r(x - 1, y - 4, 3, 1, '#1a1a1a');
          p.lit(x, y - 6, 1, 2);
        }
      }
      const top = B - (era >= 3 ? 27 : 18);
      walls(p, cx - 7, top - 7, 14, 8, 'plaster', '#9a2a22');
      p.r(cx - 7, top - 8, 14, 1, '#3a1a14');
      p.r(cx - 5, top - 10, 3, 2, '#e0b040');
      p.r(cx + 2, top - 10, 3, 2, '#e0b040');
      p.acc(cx - 1, top - 4, 2, 4);
      break;
    }
    case 'thao_nguyen': {
      // The Khan's great ger among banners.
      body(p, S(26, 1, 'felt', 'dome', '#f8f4e6', '#e0b040', ['dragon']), {});
      for (const x of [-20, -16, 16, 20]) {
        p.r(cx + x, B - 16, 1, 16, '#5a4a3a');
        p.acc(cx + x - 1, B - 15, 3, 7);
      }
      if (era >= 3) {
        body(p, S(12, 1, 'felt', 'dome', '#f8f4e6', '#c0392b'), {});
        p.r(cx - 22, B - 6, 6, 6, '#f0ece0');
        p.r(cx + 16, B - 6, 6, 6, '#f0ece0');
      }
      if (era === 4) {
        walls(p, cx - 16, B - 12, 32, 12, 'stone', '#c8c0b0');
        roof(p, cx - 16, B - 13, 32, S(32, 1, 'stone', 'hip', '#c8c0b0', '#3a7a5a'));
        p.acc(cx - 2, B - 5, 4, 5);
      }
      break;
    }
    case 'bac_hai': {
      if (era === 2) {
        // Great mead hall with dragon-head gables.
        const b = body(p, S(32, 1, 'log', 'turf', '#6a4a2a', '#4f8a3a'), {});
        p.r(b.x0 - 2, b.top - 4, 2, 2, '#e0b040');
        p.r(b.x0 + b.w, b.top - 4, 2, 2, '#e0b040');
        flag(p, cx, b.roofTop, 6);
      } else {
        // Stone castle with steep slate roofs.
        walls(p, cx - 16, B - 12, 32, 13, 'stone', '#8a867e');
        for (let x = cx - 16; x < cx + 16; x += 3) p.r(x, B - 13, 2, 1, '#8a867e');
        for (const x of [-20, 14]) {
          walls(p, cx + x, B - 20, 6, 21, 'stone', '#7a766e');
          roof(p, cx + x, B - 21, 6, S(6, 1, 'stone', 'steep', '#7a766e', '#3a3a44'));
        }
        walls(p, cx - 6, B - 26, 12, 15, 'stone', '#9a968e');
        roof(p, cx - 6, B - 27, 12, S(12, 1, 'stone', 'steep', '#9a968e', '#3a3a44'));
        p.acc(cx - 2, B - 6, 4, 6);
        flag(p, cx, B - 36, 6);
      }
      break;
    }
    case 'rung_sau': {
      // Kremlin: red walls, white church, golden and green onion domes.
      if (era >= 3) {
        walls(p, cx - 22, B - 8, 44, 9, 'brick', '#a8463a');
        for (let x = cx - 22; x < cx + 22; x += 3) p.r(x, B - 9, 2, 1, '#a8463a');
      }
      walls(p, cx - 9, B - 20, 18, 12, era >= 3 ? 'plaster' : 'log', era >= 3 ? '#f2f0ea' : '#7a5232');
      const domes = era >= 3 ? [[0, 12, '#e0b040'], [-6, 7, '#3a8a5a'], [6, 7, '#3a7ab8']] : [[0, 8, '#3a8a5a']];
      for (const [dx, h, col] of domes as [number, number, string][]) {
        const x = cx + dx;
        const y = B - 20 - h;
        p.r(x - 1, y + 4, 3, h - 4, '#f2f0ea');
        p.r(x - 3, y + 1, 7, 3, col);
        p.r(x - 2, y, 5, 1, col);
        p.r(x - 1, y - 1, 3, 1, col);
        p.r(x, y - 4, 1, 3, '#e0b040');
        p.r(x - 1, y - 3, 3, 1, '#e0b040');
      }
      p.acc(cx - 2, B - 6, 4, 6);
      break;
    }
    case 'hy_lap': {
      // Columned temple-palace with a pediment (Parthenon-like).
      for (let i = 0; i < 3; i++) p.r(cx - 20 + i, B - i, 40 - i * 2, 1, '#e8e4d8');
      const top = B - 16;
      for (let x = cx - 17; x <= cx + 16; x += 3) {
        p.r(x, top, 2, 13, '#f2f0e8');
        p.r(x + 1, top, 1, 13, '#d8d4c8');
      }
      p.r(cx - 19, top - 2, 38, 2, '#ece8dc');
      for (let i = 0; i < 6; i++) p.r(cx - 18 + i * 3, top - 3 - i, 36 - i * 6, 1, i % 2 ? '#e8e4d8' : '#f4f2ea');
      p.acc(cx - 8, top - 1, 16, 1);
      if (era === 4) flag(p, cx, top - 9, 6);
      break;
    }
  }
  return p.done();
}

/** The house of worship of each culture (dedicated to its own gods, or to the player). */
export function drawTemple(culture: string, era: number): Art {
  const p = new P(32, 56, culture.length * 71 + era);
  const cx = p.cx;
  const B = p.bottom;
  switch (culture) {
    case 'lua_nuoc':
    case 'hoa_ha': {
      // Tiered pagoda.
      const tiers = culture === 'hoa_ha' ? 5 : 3;
      let y = B;
      for (let t = 0; t < tiers; t++) {
        const w = 12 - t * 2;
        walls(p, cx - w / 2, y - 4, w, 4, 'plaster', culture === 'hoa_ha' ? '#b8322e' : '#c8a070');
        y = roof(p, cx - w / 2, y - 5, w, S(w, 1, 'plaster', 'curved', '#b8322e', culture === 'hoa_ha' ? '#3a3a44' : '#8a3a28'));
      }
      p.r(cx, y - 4, 1, 4, '#e0b040');
      p.acc(cx - 1, B - 3, 2, 3);
      break;
    }
    case 'dao_xa': {
      // Torii gate in front of a shrine.
      walls(p, cx - 6, B - 8, 12, 6, 'wood', '#8a5a32');
      roof(p, cx - 6, B - 9, 12, S(12, 1, 'wood', 'curved', '#8a5a32', '#4a3a2a'));
      p.r(cx - 12, B - 14, 24, 2, '#d8302a');
      p.r(cx - 10, B - 11, 20, 1, '#d8302a');
      p.r(cx - 9, B - 12, 2, 12, '#d8302a');
      p.r(cx + 7, B - 12, 2, 12, '#d8302a');
      p.r(cx - 13, B - 15, 26, 1, '#2a2a2a');
      break;
    }
    case 'nui_cao': {
      // Stupa with golden spire and prayer flags.
      p.r(cx - 7, B - 3, 14, 4, '#f4f0e6');
      for (let i = 0; i < 6; i++) {
        const half = Math.round(Math.sqrt(36 - (i - 1) ** 2));
        p.r(cx - half, B - 4 - i, half * 2, 1, '#f8f6f0');
      }
      p.r(cx - 1, B - 18, 2, 8, '#e0b040');
      for (let i = 0; i < 4; i++) p.r(cx - 2 + (i % 2), B - 12 - i * 2, 4 - (i % 2) * 2, 1, '#c89a30');
      const cols = ['#3a6ab8', '#f2f2f2', '#d8302a', '#3a9a4a', '#e0c040'];
      for (let k = 0; k < 10; k++) p.r(cx - 14 + k * 3, B - 14 + Math.abs(k - 5), 2, 2, cols[k % 5]);
      break;
    }
    case 'thao_nguyen': {
      // Ovoo cairn with blue khadag scarves, beside a temple ger.
      body(p, S(12, 1, 'felt', 'dome', '#f8f4e6', '#d8a030', ['dragon']), {});
      for (let i = 0; i < 4; i++) p.r(cx - 14 + i, B - i * 2 - 1, 7 - i * 2, 2, '#8a8a84');
      p.r(cx - 11, B - 14, 1, 7, '#5a4a3a');
      p.r(cx - 10, B - 14, 3, 1, '#3a6ab8');
      p.r(cx - 10, B - 12, 2, 1, '#3a6ab8');
      break;
    }
    case 'bac_hai': {
      // Stave church: stacked steep dark roofs with dragon heads.
      walls(p, cx - 6, B - 8, 12, 9, 'wood', '#5a3a24');
      let y = B - 9;
      for (let t = 0; t < 3; t++) {
        const w = 14 - t * 4;
        y = roof(p, cx - w / 2, y, w, S(w, 1, 'wood', 'steep', '#5a3a24', '#2a2a2e', ['dragon']));
        if (t < 2) {
          walls(p, cx - w / 2 + 2, y - 2, w - 4, 3, 'wood', '#5a3a24');
          y -= 2;
        }
      }
      p.r(cx, y - 3, 1, 3, '#e0b040');
      break;
    }
    case 'rung_sau': {
      // Onion-dome church.
      walls(p, cx - 6, B - 10, 12, 11, 'plaster', '#f2f0ea');
      p.r(cx - 2, B - 16, 4, 6, '#f2f0ea');
      p.r(cx - 4, B - 21, 8, 4, '#e0b040');
      p.r(cx - 3, B - 22, 6, 1, '#e0b040');
      p.r(cx - 1, B - 23, 2, 1, '#e0b040');
      p.r(cx, B - 27, 1, 4, '#e0b040');
      p.r(cx - 1, B - 26, 3, 1, '#e0b040');
      p.lit(cx - 1, B - 6, 2, 3);
      break;
    }
    default: {
      // Hy Lạp: columned temple.
      p.r(cx - 10, B - 1, 20, 2, '#e8e4d8');
      for (let x = cx - 9; x <= cx + 8; x += 3) p.r(x, B - 11, 2, 10, '#f2f0e8');
      p.r(cx - 11, B - 13, 22, 2, '#ece8dc');
      for (let i = 0; i < 4; i++) p.r(cx - 10 + i * 2, B - 14 - i, 20 - i * 4, 1, '#f4f2ea');
      break;
    }
  }
  void era;
  return p.done();
}
