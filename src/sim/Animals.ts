import { rand } from './rand';
import { Cover, H, W, idx } from '../world/constants';
import type { World } from '../world/World';
import { Grid } from './Grid';

export type AnimalKind = 'deer' | 'wolf';

const DEER_CAP = 420;
const WOLF_CAP = 80;
const OFFSETS = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6];

export class Animal {
  id: number;
  kind: AnimalKind;
  x: number;
  y: number;
  hp = 1;
  hunger = rand() * 0.3;
  age = 0;
  maxAge = 300 + rand() * 300;
  tx = 0;
  ty = 0;
  hasTarget = false;
  think = rand();
  dead = false;
  fleeing = false;
  /** Who is chasing what, for wolves. */
  prey: { x: number; y: number; dead: boolean } | null = null;
  cd = 0;
  breed = 20 + rand() * 30;
  turn = rand() < 0.5 ? 1 : -1;
  facing = 1;

  constructor(id: number, kind: AnimalKind, x: number, y: number) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.y = y;
  }
}

/** Something the animals need to know about people, without importing the whole sim. */
export interface PreyHuman {
  x: number;
  y: number;
  dead: boolean;
  inside: boolean;
  health: number;
  harm: string;
}

export class AnimalSystem {
  list: Animal[] = [];
  grid = new Grid<Animal>();
  private nextId = 1;
  private world: World;
  onHumanBitten?: (h: PreyHuman) => void;

  constructor(world: World) {
    this.world = world;
  }

  /** After loading a save: continue numbering after the existing animals. */
  resume(nextId: number) {
    this.nextId = nextId;
  }

  reset() {
    this.list = [];
    this.nextId = 1;
  }

  count(kind: AnimalKind) {
    let n = 0;
    for (const a of this.list) if (a.kind === kind && !a.dead) n++;
    return n;
  }

  spawn(kind: AnimalKind, x: number, y: number) {
    const a = new Animal(this.nextId++, kind, x, y);
    this.list.push(a);
    return a;
  }

  populate(deer: number, wolves: number) {
    const w = this.world;
    for (let k = 0; k < deer + wolves; k++) {
      const kind: AnimalKind = k < deer ? 'deer' : 'wolf';
      for (let t = 0; t < 60; t++) {
        const i = Math.floor(rand() * W * H);
        if (!w.canWalk(i) || w.isWater(i)) continue;
        if (kind === 'wolf' ? w.cover[i] !== Cover.FOREST : !w.isFertile(i)) continue;
        // Herds / packs.
        const n = kind === 'deer' ? 4 : 2;
        for (let m = 0; m < n && k < deer + wolves; m++, k++) {
          this.spawn(kind, (i % W) + rand() * 2, Math.floor(i / W) + rand() * 2);
        }
        break;
      }
    }
  }

  update(dt: number, humans: Grid<PreyHuman & { village: number }>, isTown: (x: number, y: number) => boolean) {
    const w = this.world;
    this.grid.rebuild(this.list);
    for (const a of this.list) {
      if (a.dead) continue;
      a.age += dt;
      const ci = idx(Math.floor(a.x), Math.floor(a.y));
      if (w.isDanger(ci) || (w.isWater(ci) && !w.isIce(ci))) a.hp -= dt * 0.6;
      if (a.kind === 'wolf') {
        a.hunger += dt * 0.007;
        if (a.hunger > 1.5) a.hp = 0;
      }
      if (a.hp <= 0 || a.age > a.maxAge) {
        a.dead = true;
        continue;
      }
      a.cd -= dt;
      a.think -= dt;
      if (a.think <= 0) {
        a.think = 0.6 + rand() * 0.4;
        if (a.kind === 'deer') this.thinkDeer(a, humans);
        else this.thinkWolf(a, humans, isTown);
      }
      this.breed(a, dt);
      this.move(a, dt);
      if (a.kind === 'wolf' && a.prey && !a.prey.dead && a.cd <= 0) {
        if (Math.hypot(a.prey.x - a.x, a.prey.y - a.y) < 1) {
          a.cd = 0.8;
          if (a.prey instanceof Animal) {
            a.prey.hp -= 0.5;
            if (a.prey.hp <= 0) {
              a.prey.dead = true;
              a.hunger = 0;
              a.prey = null;
            }
          } else {
            const h = a.prey as PreyHuman;
            h.health -= 0.18;
            h.harm = 'bị sói cắn chết';
            this.onHumanBitten?.(h);
            if (h.health <= 0) a.hunger = 0;
          }
        }
      }
    }
    this.list = this.list.filter((a) => !a.dead);
  }

  private thinkDeer(a: Animal, humans: Grid<PreyHuman & { village: number }>) {
    const wolf = this.grid.nearest(a.x, a.y, 6, (o) => o.kind === 'wolf');
    const man = humans.nearest(a.x, a.y, 4, (h) => !h.inside);
    const threat = wolf ?? man;
    if (threat) {
      a.fleeing = true;
      this.target(a, a.x + (a.x - threat.x) * 3, a.y + (a.y - threat.y) * 3);
      return;
    }
    a.fleeing = false;
    if (rand() < 0.6) this.wander(a, 5, (i) => this.world.isFertile(i) || this.world.cover[i] === Cover.FOREST);
    else a.hasTarget = false;
  }

  private thinkWolf(a: Animal, humans: Grid<PreyHuman & { village: number }>, isTown: (x: number, y: number) => boolean) {
    a.fleeing = false;
    if (a.hunger > 0.4) {
      const deer = this.grid.nearest(a.x, a.y, 12, (o) => o.kind === 'deer');
      if (deer) {
        a.prey = deer;
        this.target(a, deer.x, deer.y);
        return;
      }
      const night = this.world.daylight() < 0.3;
      if (a.hunger > 0.8 || night) {
        const h = humans.nearest(a.x, a.y, 8, (p) => !p.inside && !isTown(p.x, p.y));
        if (h) {
          a.prey = h;
          this.target(a, h.x, h.y);
          return;
        }
      }
    }
    a.prey = null;
    this.wander(a, 6, (i) => this.world.cover[i] === Cover.FOREST || this.world.isFertile(i));
  }

  private breed(a: Animal, dt: number) {
    a.breed -= dt;
    if (a.breed > 0) return;
    a.breed = a.kind === 'deer' ? 25 + rand() * 20 : 60 + rand() * 40;
    const w = this.world;
    const ci = idx(Math.floor(a.x), Math.floor(a.y));
    if (w.localTemp(ci) < 0 || a.age < 60) return;
    if (a.kind === 'deer') {
      if (this.count('deer') < DEER_CAP && this.grid.count(a.x, a.y, 8, (o) => o.kind === 'deer') < 8) {
        this.spawn('deer', a.x, a.y);
      }
    } else if (a.hunger < 0.6 && this.count('wolf') < WOLF_CAP && this.grid.count(a.x, a.y, 10, (o) => o.kind === 'wolf') < 4) {
      this.spawn('wolf', a.x, a.y);
    }
  }

  private wander(a: Animal, r: number, ok: (i: number) => boolean) {
    const w = this.world;
    const j = w.findNearest(a.x + (rand() * 2 - 1) * r, a.y + (rand() * 2 - 1) * r, 2, (i) => w.canWalk(i) && ok(i));
    if (j >= 0) this.target(a, (j % W) + 0.5, Math.floor(j / W) + 0.5);
    else a.hasTarget = false;
  }

  private target(a: Animal, x: number, y: number) {
    a.tx = Math.max(0.5, Math.min(W - 0.5, x));
    a.ty = Math.max(0.5, Math.min(H - 0.5, y));
    a.hasTarget = true;
  }

  private move(a: Animal, dt: number) {
    if (a.kind === 'wolf' && a.prey && !a.prey.dead) {
      a.tx = a.prey.x;
      a.ty = a.prey.y;
      a.hasTarget = true;
    }
    if (!a.hasTarget) return;
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.3) {
      a.hasTarget = false;
      return;
    }
    const w = this.world;
    let speed = a.kind === 'wolf' ? (a.prey ? 3.1 : 1.6) : a.fleeing ? 3.0 : 1.1;
    if (w.snow[idx(Math.floor(a.x), Math.floor(a.y))] > 0.5) speed *= 0.7;
    const step = Math.min(d, speed * dt);
    const base = Math.atan2(dy, dx);
    for (const off of OFFSETS) {
      const ang = base + off * a.turn;
      const px = a.x + Math.cos(ang) * step;
      const py = a.y + Math.sin(ang) * step;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const j = idx(Math.floor(px), Math.floor(py));
      if (!w.canWalk(j) || w.isWater(j)) continue;
      if (Math.abs(Math.cos(ang)) > 0.2) a.facing = Math.cos(ang) > 0 ? 1 : -1;
      a.x = px;
      a.y = py;
      return;
    }
    a.turn = -a.turn;
    a.hasTarget = false;
  }
}
