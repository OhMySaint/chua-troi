import Phaser from 'phaser';
import { type Art, SPECIAL_KINDS, drawHouse, drawPalace, drawSpecial, drawTemple } from '../art/buildings';
import type { Sim } from '../sim/Sim';
import { MAX_ERA } from '../sim/eras';
import { CELL, W } from '../world/constants';
import { PH } from '../world/render';

interface Sprite {
  key: string;
  base: Phaser.GameObjects.Image;
  accent: Phaser.GameObjects.Image;
  lights: Phaser.GameObjects.Image;
  smoke: [number, number][];
  color: number;
}

/** Depth band for buildings: sorted by their base y so nearer buildings overlap farther ones. */
export const BUILDING_DEPTH = 10;

/**
 * Keeps one sprite (base + nation-coloured accent + night windows) per building, palace and temple,
 * in sync with the simulation.
 */
export class BuildingLayer {
  private scene: Phaser.Scene;
  private sprites = new Map<string, Sprite>();
  private made = new Set<string>();
  private dark = -1;
  /** Chimney positions in world pixels, for the scene's smoke effect. */
  smoke: [number, number][] = [];
  /** Spaceport launch pads in world pixels. */
  pads: [number, number][] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private texture(key: string, draw: () => Art) {
    if (this.made.has(key)) return;
    const art = draw();
    this.scene.textures.addCanvas(`${key}_b`, art.base);
    this.scene.textures.addCanvas(`${key}_a`, art.accent);
    this.scene.textures.addCanvas(`${key}_l`, art.lights);
    this.smokeOf.set(key, art.smoke);
    this.made.add(key);
  }
  private smokeOf = new Map<string, [number, number][]>();

  private place(id: string, key: string, draw: () => Art, x: number, y: number, color: number, seen: Set<string>): void {
    seen.add(id);
    const cur = this.sprites.get(id);
    if (cur && cur.key === key) {
      // The city may have moved (fled a flood, the land rose under it).
      if (cur.base.x !== x || cur.base.y !== y) {
        this.destroy(id);
        return this.place(id, key, draw, x, y, color, seen);
      }
      if (cur.color !== color) {
        cur.accent.setTint(color);
        cur.color = color;
      }
      return;
    }
    if (cur) this.destroy(id);
    this.texture(key, draw);
    const depth = BUILDING_DEPTH + y / PH;
    const mk = (suffix: string, d: number) => this.scene.add.image(x, y, `${key}_${suffix}`).setOrigin(0.5, 1).setDepth(depth + d);
    const s: Sprite = {
      key,
      base: mk('b', 0),
      accent: mk('a', 0.000001).setTint(color),
      lights: mk('l', 0.000002).setAlpha(Math.max(0, this.dark)),
      smoke: (this.smokeOf.get(key) ?? []).map(([dx, dy]) => [x + dx, y + dy]),
      color,
    };
    this.sprites.set(id, s);
  }

  private destroy(id: string) {
    const s = this.sprites.get(id);
    if (!s) return;
    s.base.destroy();
    s.accent.destroy();
    s.lights.destroy();
    this.sprites.delete(id);
  }

  clear() {
    for (const id of [...this.sprites.keys()]) this.destroy(id);
  }

  /**
   * Only buildings near the camera get sprites (the world has thousands); far away, the overview
   * map shows them as coloured pixels.
   */
  sync(sim: Sim, view: Phaser.Geom.Rectangle, zoom: number) {
    const w = sim.world;
    const seen = new Set<string>();
    if (zoom < 0.4) {
      for (const id of [...this.sprites.keys()]) this.destroy(id);
      this.smoke = [];
      this.pads = [];
      return;
    }
    const pad = 12 * CELL;
    const near = (i: number) => {
      const x = (i % W) * CELL;
      const y = Math.floor(i / W) * CELL;
      return x > view.x - pad && x < view.right + pad && y > view.y - pad && y < view.bottom + pad * 4;
    };
    for (const v of sim.villages) {
      const R = (v.radius + 6) * CELL;
      if (v.cx * CELL < view.x - R - pad || v.cx * CELL > view.right + R + pad || v.cy * CELL < view.y - R - pad || v.cy * CELL > view.bottom + R + pad * 4) continue;
      const c = v.culture.id;
      for (const i of v.houses) {
        if (!near(i)) continue;
        const era = Math.max(0, Math.min(MAX_ERA, Math.floor(w.timer[i])));
        const variant = (i * 2654435761) % 3;
        const key = `h_${c}_${era}_${variant}`;
        this.place(`b${i}`, key, () => drawHouse(c, era, variant), (i % W) * CELL + 4, Math.floor(i / W) * CELL + 8, v.color, seen);
      }
      for (const [i, k] of v.buildings) {
        if (!near(i)) continue;
        const kind = SPECIAL_KINDS[k];
        const era = Math.max(0, Math.min(MAX_ERA, Math.floor(w.timer[i])));
        const key = `s_${kind}_${c}_${era}`;
        this.place(`b${i}`, key, () => drawSpecial(kind, c, era), (i % W) * CELL + 4, Math.floor(i / W) * CELL + 8, v.color, seen);
      }
      if (!v.alive) continue;
      const px = v.cx * CELL + 4;
      const py = v.cy * CELL + 8;
      this.place(`p${v.id}`, `p_${c}_${v.era}`, () => drawPalace(c, v.era), px, py, v.color, seen);
      if (v.temple) this.place(`t${v.id}`, `t_${c}_${v.era}`, () => drawTemple(c, v.era), px + 5 * CELL, py, v.color, seen);
    }
    for (const id of [...this.sprites.keys()]) if (!seen.has(id)) this.destroy(id);

    this.smoke = [];
    this.pads = [];
    for (const s of this.sprites.values()) {
      for (const p of s.smoke) this.smoke.push(p);
      if (s.key.startsWith('s_spaceport')) this.pads.push([s.base.x + 1, s.base.y - 3]);
    }
  }

  /** Window glow at night (0..1). */
  setDark(dark: number) {
    const d = Math.round(dark * 20) / 20;
    if (d === this.dark) return;
    this.dark = d;
    for (const s of this.sprites.values()) s.lights.setAlpha(d);
  }
}
