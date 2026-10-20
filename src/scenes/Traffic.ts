import type Phaser from 'phaser';
import type { Sim, Village } from '../sim/Sim';
import { CELL, H, W, idx } from '../world/constants';

/**
 * Purely visual traffic: carts, riders, carriages, cars and buses on the roads; boats around docks;
 * aeroplanes between modern capitals. Vehicle types follow each nation's era and culture.
 */
type Kind = 'oxcart' | 'horsecart' | 'rider' | 'carriage' | 'oldcar' | 'truck' | 'car' | 'bus' | 'hovercar' | 'canoe' | 'sailship' | 'steamer' | 'cargo' | 'plane' | 'skyship';

interface Vehicle {
  kind: Kind;
  x: number;
  y: number;
  /** Current target cell centre. */
  tx: number;
  ty: number;
  dirX: number;
  dirY: number;
  speed: number;
  color: number;
  life: number;
  village: number;
  home: number;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const CAR_COLORS = [0xd84a3a, 0x3a7ad8, 0xf0f0f0, 0x2a2a2a, 0xe0c040, 0x4aa05a];
const EAST = new Set(['lua_nuoc', 'hoa_ha', 'dao_xa', 'nui_cao']);

export class Traffic {
  list: Vehicle[] = [];
  private timer = 0;

  clear() {
    this.list = [];
  }

  update(dt: number, sim: Sim) {
    const w = sim.world;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.7;
      this.spawn(sim);
    }
    for (const v of this.list) {
      v.life -= dt;
      const dx = v.tx - v.x;
      const dy = v.ty - v.y;
      const d = Math.hypot(dx, dy);
      const step = v.speed * dt;
      if (d > step) {
        v.x += (dx / d) * step;
        v.y += (dy / d) * step;
        continue;
      }
      v.x = v.tx;
      v.y = v.ty;
      if (v.kind === 'plane' || v.kind === 'skyship') {
        v.life = 0;
        continue;
      }
      if (isBoat(v.kind)) this.nextWater(v, sim);
      else this.nextRoad(v, w.road);
    }
    this.list = this.list.filter((v) => v.life > 0);
  }

  private nextRoad(v: Vehicle, road: Uint8Array) {
    const x = Math.floor(v.x);
    const y = Math.floor(v.y);
    const options: number[][] = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !road[idx(nx, ny)]) continue;
      if (dx === -v.dirX && dy === -v.dirY) continue; // don't U-turn unless stuck
      options.push([dx, dy]);
    }
    if (!options.length) {
      if (road[idx(x - v.dirX, y - v.dirY)]) options.push([-v.dirX, -v.dirY]);
      else {
        v.life = 0;
        return;
      }
    }
    const straight = options.find(([dx, dy]) => dx === v.dirX && dy === v.dirY);
    const [dx, dy] = straight && Math.random() < 0.7 ? straight : options[Math.floor(Math.random() * options.length)];
    v.dirX = dx;
    v.dirY = dy;
    // Keep to the right-hand side of the lane.
    v.tx = x + dx + 0.5 - dy * 0.2;
    v.ty = y + dy + 0.5 + dx * 0.2;
  }

  private nextWater(v: Vehicle, sim: Sim) {
    const w = sim.world;
    const hx = v.home % W;
    const hy = Math.floor(v.home / W);
    for (let t = 0; t < 8; t++) {
      const nx = Math.round(v.x + (Math.random() * 2 - 1) * 6);
      const ny = Math.round(v.y + (Math.random() * 2 - 1) * 6);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (Math.hypot(nx - hx, ny - hy) > 18) continue;
      const i = idx(nx, ny);
      if (!w.isWater(i) || w.isIce(i)) continue;
      v.dirX = Math.sign(nx - v.x);
      v.tx = nx + 0.5;
      v.ty = ny + 0.5;
      return;
    }
    v.life = 0;
  }

  private spawn(sim: Sim) {
    const w = sim.world;
    const counts = new Map<number, number>();
    for (const v of this.list) counts.set(v.village, (counts.get(v.village) ?? 0) + 1);
    const modern: Village[] = [];
    for (const v of sim.villages) {
      if (!v.alive) continue;
      if (v.era >= 5) modern.push(v);
      if (v.era < 1) continue;
      const have = counts.get(v.id) ?? 0;
      const want = Math.min(16, Math.floor(v.pop / 12) + (v.era >= 4 ? 4 : 0));
      if (have < want) {
        // A random road cell in the territory.
        const r = v.radius + 4;
        for (let t = 0; t < 20; t++) {
          const x = Math.round(v.cx + (Math.random() * 2 - 1) * r);
          const y = Math.round(v.cy + (Math.random() * 2 - 1) * r);
          if (x < 0 || y < 0 || x >= W || y >= H || !w.road[idx(x, y)]) continue;
          const [dx, dy] = DIRS[Math.floor(Math.random() * 4)];
          this.list.push({
            kind: roadKind(v),
            x: x + 0.5,
            y: y + 0.5,
            tx: x + 0.5,
            ty: y + 0.5,
            dirX: dx,
            dirY: dy,
            speed: v.era >= 6 ? 3.4 : v.era >= 4 ? 2.6 : 1.1,
            color: v.era >= 5 ? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] : v.color,
            life: 40 + Math.random() * 30,
            village: v.id,
            home: idx(v.cx, v.cy),
          });
          break;
        }
      }
      // Boats around the docks.
      const boats = this.list.filter((b) => b.village === v.id && isBoat(b.kind)).length;
      for (const [i, k] of v.buildings) {
        if (k !== 11 || boats >= 1 + Math.floor(v.era / 2)) continue;
        const j = w.findNearest(i % W, Math.floor(i / W), 3, (c) => w.isWater(c) && !w.isIce(c));
        if (j < 0) continue;
        this.list.push({
          kind: v.era <= 2 ? 'canoe' : v.era === 3 ? 'sailship' : v.era === 4 ? 'steamer' : 'cargo',
          x: (j % W) + 0.5,
          y: Math.floor(j / W) + 0.5,
          tx: (j % W) + 0.5,
          ty: Math.floor(j / W) + 0.5,
          dirX: 1,
          dirY: 0,
          speed: v.era >= 4 ? 1.6 : 0.8,
          color: v.color,
          life: 60 + Math.random() * 40,
          village: v.id,
          home: j,
        });
        break;
      }
    }
    // Aeroplanes between modern capitals.
    const planes = this.list.filter((v) => v.kind === 'plane').length;
    if (modern.length >= 2 && planes < Math.min(6, modern.length) && Math.random() < 0.3) {
      const a = modern[Math.floor(Math.random() * modern.length)];
      const b = modern[Math.floor(Math.random() * modern.length)];
      if (a !== b) {
        this.list.push({
          kind: a.era >= 6 && b.era >= 6 ? 'skyship' : 'plane',
          x: a.cx,
          y: a.cy,
          tx: b.cx,
          ty: b.cy,
          dirX: Math.sign(b.cx - a.cx) || 1,
          dirY: 0,
          speed: 12,
          color: a.color,
          life: 60,
          village: a.id,
          home: idx(a.cx, a.cy),
        });
      }
    }
  }

  draw(g: Phaser.GameObjects.Graphics, lod: boolean, inView: (x: number, y: number) => boolean, t: number) {
    for (const v of this.list) {
      const px = Math.round(v.x * CELL);
      const py = Math.round(v.y * CELL);
      if (!inView(px, py)) continue;
      if (lod && v.kind !== 'plane' && v.kind !== 'skyship') {
        g.fillStyle(isBoat(v.kind) ? 0xf0f0f0 : 0x2a2a2a, 1);
        g.fillRect(px - 1, py - 1, 3, 2);
        continue;
      }
      drawVehicle(g, v, px, py, t);
    }
  }
}

/** Draw a sea-going ship of the given era (used for colonist voyages). */
export function drawShip(g: Phaser.GameObjects.Graphics, px: number, py: number, era: number, color: number, dirX: number, t: number) {
  const kind: Kind = era <= 3 ? 'sailship' : era === 4 ? 'steamer' : 'cargo';
  drawVehicle(g, { kind, x: 0, y: 0, tx: 0, ty: 0, dirX, dirY: 0, speed: 0, color, life: 1, village: -1, home: 0 }, px, py, t);
}

function isBoat(k: Kind) {
  return k === 'canoe' || k === 'sailship' || k === 'steamer' || k === 'cargo';
}

function roadKind(v: Village): Kind {
  const c = v.culture.id;
  if (v.era <= 2) return c === 'thao_nguyen' ? 'rider' : EAST.has(c) ? 'oxcart' : 'horsecart';
  if (v.era === 3) return c === 'thao_nguyen' ? 'rider' : 'carriage';
  if (v.era === 4) return Math.random() < 0.4 ? 'truck' : 'oldcar';
  if (v.era >= 6) return 'hovercar';
  return Math.random() < 0.15 ? 'bus' : 'car';
}

function drawVehicle(g: Phaser.GameObjects.Graphics, v: Vehicle, px: number, py: number, t: number) {
  const R = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    g.fillStyle(c, a);
    g.fillRect(px + x, py + y, w, h);
  };
  const f = v.dirX < 0 ? -1 : 1;
  const vertical = v.dirY !== 0 && !isBoat(v.kind) && v.kind !== 'plane' && v.kind !== 'skyship';
  const bob = Math.floor(t / 150 + v.x * 3) % 2;
  // Mirror helper: x offsets are written for a vehicle facing right.
  const M = (x: number, w: number) => (f > 0 ? x : -x - w);

  switch (v.kind) {
    case 'oxcart':
    case 'horsecart': {
      const animal = v.kind === 'oxcart' ? 0x8a6a4a : 0x6a4428;
      if (vertical) {
        R(-1, -6, 3, 3, animal);
        R(-2, -3, 5, 4, 0x9a7048);
        R(-2, 1, 1, 1, 0x3a2414);
        R(2, 1, 1, 1, 0x3a2414);
        R(-1, -2, 3, 1, 0xd8b060);
        break;
      }
      R(M(2, 4), -4 + bob * 0, 4, 2, animal);
      R(M(5, 1), -5, 1, 2, animal);
      R(M(2, 1), -2, 1, 2, animal);
      R(M(4, 1), -2, 1, 2, animal);
      R(M(-5, 6), -4, 6, 3, 0x9a7048);
      R(M(-5, 6), -5, 6, 1, 0xd8b060);
      R(M(-4, 2), -1, 2, 2, 0x3a2414);
      break;
    }
    case 'rider': {
      R(M(-3, 6), -3, 6, 2, 0x6a4428);
      R(M(3, 2), -5, 2, 2, 0x6a4428);
      R(M(-3, 1), -1, 1, 2, 0x4a2a14);
      R(M(2, 1), -1, 1, 2, 0x4a2a14);
      R(M(-1, 2), -6, 2, 3, v.color);
      R(M(-1, 2), -8, 2, 2, 0xe0ac69);
      break;
    }
    case 'carriage': {
      if (vertical) {
        R(-2, -7, 5, 3, 0x6a4428);
        R(-2, -4, 5, 5, v.color);
        R(-1, -3, 3, 1, 0x2a3448);
        break;
      }
      R(M(3, 4), -4, 4, 2, 0x6a4428);
      R(M(6, 1), -5, 1, 2, 0x6a4428);
      R(M(-5, 7), -6, 7, 5, v.color);
      R(M(-4, 2), -5, 2, 2, 0x2a3448);
      R(M(-1, 2), -5, 2, 2, 0x2a3448);
      R(M(-5, 2), -1, 2, 2, 0x2a2a2a);
      R(M(0, 2), -1, 2, 2, 0x2a2a2a);
      break;
    }
    case 'oldcar':
    case 'car':
    case 'truck':
    case 'bus': {
      const col = v.kind === 'oldcar' ? 0x2a2a2e : v.kind === 'truck' ? 0x6a6a72 : v.kind === 'bus' ? 0xe0b040 : v.color;
      const len = v.kind === 'bus' ? 10 : v.kind === 'truck' ? 8 : 6;
      if (vertical) {
        R(-2, -len + 1, 4, len, col);
        R(-1, -len + 2, 2, 1, 0x9ac0e0);
        if (v.kind === 'bus') for (let y = -len + 4; y < 0; y += 2) R(-2, y, 1, 1, 0x9ac0e0);
        break;
      }
      R(M(-len / 2, len), -4, len, 3, col);
      if (v.kind === 'bus') for (let x = -len / 2 + 1; x < len / 2 - 1; x += 2) R(M(x, 1), -4, 1, 1, 0x9ac0e0);
      else if (v.kind === 'truck') {
        R(M(len / 2 - 3, 3), -6, 3, 2, col);
        R(M(len / 2 - 2, 1), -5, 1, 1, 0x9ac0e0);
        R(M(-len / 2, 5), -5, 5, 1, 0x8a6a4a);
      } else {
        R(M(-1, 3), -6, 3, 2, col);
        R(M(0, 2), -5, 2, 1, 0x9ac0e0);
      }
      R(M(-len / 2 + 1, 2), -1, 2, 1, 0x1a1a1a);
      R(M(len / 2 - 3, 2), -1, 2, 1, 0x1a1a1a);
      break;
    }
    case 'hovercar': {
      // Floats above the road on a glowing cushion.
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(px, py, 6, 2);
      g.fillStyle(0x8af0ff, 0.6);
      g.fillRect(px - 2, py - 3 - bob, 4, 1);
      if (vertical) {
        R(-2, -9 - bob, 4, 5, v.color);
        R(-1, -8 - bob, 2, 1, 0xd8f8ff);
        break;
      }
      R(M(-3, 6), -6 - bob, 6, 2, v.color);
      R(M(-1, 3), -7 - bob, 3, 1, 0xd8f8ff);
      break;
    }
    case 'skyship': {
      const ang = Math.atan2(v.ty - v.y, v.tx - v.x);
      g.fillStyle(0x000000, 0.15);
      g.fillEllipse(px + 8, py + 6, 22, 6);
      g.fillStyle(0xe8eef4, 1);
      g.fillEllipse(px, py - 60, 26, 8);
      g.fillStyle(v.color, 1);
      g.fillRect(px - 10, py - 61, 20, 2);
      g.fillStyle(0x8af0ff, 0.9);
      g.fillCircle(px - Math.cos(ang) * 13, py - 60 - Math.sin(ang) * 3, 2.5);
      g.fillStyle(0x3a4a5a, 1);
      for (let k = -6; k <= 6; k += 3) g.fillRect(px + k, py - 62, 1, 1);
      break;
    }
    case 'canoe': {
      R(M(-4, 8), -1, 8, 2, 0x6a4428);
      R(M(0, 1), -7, 1, 6, 0x5a3a24);
      R(M(1, 3), -6, 3, 4, 0xf2eee4);
      break;
    }
    case 'sailship': {
      R(M(-6, 12), -2, 12, 3, 0x5a3a24);
      R(M(-5, 10), -3, 10, 1, 0x7a5232);
      for (const x of [-2, 2]) {
        R(M(x, 1), -12, 1, 9, 0x4a2a14);
        R(M(x - 2, 5), -11, 5, 6, 0xf2eee4);
      }
      R(M(2, 3), -13, 3, 1, v.color);
      break;
    }
    case 'steamer': {
      R(M(-7, 14), -2, 14, 3, 0x2a2a32);
      R(M(-4, 8), -5, 8, 3, 0xe8e4da);
      R(M(0, 2), -9, 2, 4, v.color);
      g.fillStyle(0x9a9a9a, 0.5);
      g.fillCircle(px + M(1, 0) - 2 * f, py - 11 - bob, 2);
      break;
    }
    case 'cargo': {
      R(M(-9, 18), -2, 18, 3, 0x3a4a5a);
      const boxes = [0xd84a3a, 0x3a7ad8, 0xe0c040, 0x4aa05a];
      for (let k = 0; k < 4; k++) R(M(-7 + k * 3, 3), -5, 3, 3, boxes[(k + v.home) % 4]);
      R(M(6, 3), -7, 3, 5, 0xf0f0f0);
      break;
    }
    case 'plane': {
      // Contrail, ground shadow, and the plane.
      const ang = Math.atan2(v.ty - v.y, v.tx - v.x);
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      g.lineStyle(2, 0xffffff, 0.35);
      g.lineBetween(px, py - 40, px - cos * 60, py - 40 - sin * 60);
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(px + 6, py + 4, 12, 4);
      const P = (along: number, side: number, w: number, h: number, c: number) => {
        g.fillStyle(c, 1);
        g.fillRect(px + cos * along - sin * side - w / 2, py - 40 + sin * along + cos * side - h / 2, w, h);
      };
      for (let k = -5; k <= 5; k++) P(k, 0, 2, 2, 0xf4f4f4);
      for (let k = -5; k <= 5; k++) P(0, k, 2, 2, 0xe8e8e8);
      for (let k = -2; k <= 2; k++) P(-5, k, 1.5, 1.5, 0xe8e8e8);
      P(-5, 0, 2, 2, v.color);
      break;
    }
  }
}
