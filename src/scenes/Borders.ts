import Phaser from 'phaser';
import type { Sim } from '../sim/Sim';
import { CELL, H, W } from '../world/constants';

/** Border map resolution: one texel per BS × BS cells. */
const BS = 2;
const BW = Math.ceil(W / BS);
const BH = Math.ceil(H / BS);
/** How far a nation's land reaches beyond its cities' own circles (cells). */
const REACH = 7;

/**
 * National borders: every city claims the land around it, the nearest city wins where claims meet,
 * and the land is shaded in its nation's colour with a solid line wherever one nation meets another
 * (or the wild).
 */
export class Borders {
  private tex: Phaser.Textures.CanvasTexture;
  private owner = new Int32Array(BW * BH);
  private score = new Float32Array(BW * BH);
  private acc = 1;
  private lines: Phaser.GameObjects.Graphics;
  /** Border segments in world pixels: x1, y1, x2, y2, colour. */
  private segs: number[] = [];

  constructor(scene: Phaser.Scene) {
    this.tex = scene.textures.createCanvas('borders', BW, BH)!;
    scene.add.image(0, 0, 'borders').setOrigin(0, 0).setScale(BS * CELL).setDepth(1);
    this.lines = scene.add.graphics().setDepth(1);
  }

  /** Recompute on the next update (land just changed hands). */
  invalidate() {
    this.acc = 1;
  }

  update(dt: number, sim: Sim, cam: Phaser.Cameras.Scene2D.Camera) {
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.acc = 0;
      this.rebuild(sim);
    }
    // Thin lines: a constant ~1.5 screen pixels whatever the zoom.
    const g = this.lines;
    g.clear();
    const v = cam.worldView;
    const segs = this.segs;
    let color = -1;
    for (let k = 0; k < segs.length; k += 5) {
      const x1 = segs[k];
      const y1 = segs[k + 1];
      if (x1 < v.x - 32 || x1 > v.right + 32 || y1 < v.y - 32 || y1 > v.bottom + 32) continue;
      if (segs[k + 4] !== color) {
        color = segs[k + 4];
        g.lineStyle(1.5 / cam.zoom, color, 0.85);
      }
      g.lineBetween(x1, y1, segs[k + 2], segs[k + 3]);
    }
  }

  private rebuild(sim: Sim) {
    const owner = this.owner;
    const score = this.score;
    owner.fill(-1);
    score.fill(Infinity);
    for (const v of sim.villages) {
      if (!v.alive) continue;
      const reach = v.radius + REACH;
      const bx0 = Math.max(0, Math.floor((v.cx - reach) / BS));
      const bx1 = Math.min(BW - 1, Math.floor((v.cx + reach) / BS));
      const by0 = Math.max(0, Math.floor((v.cy - reach) / BS));
      const by1 = Math.min(BH - 1, Math.floor((v.cy + reach) / BS));
      const nation = v.nation;
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const d = Math.hypot(bx * BS + BS / 2 - v.cx, by * BS + BS / 2 - v.cy);
          if (d > reach) continue;
          // Closest edge wins, so a big city holds more ground than a small one.
          const sc = d - v.radius;
          const i = by * BW + bx;
          if (sc < score[i]) {
            score[i] = sc;
            owner[i] = nation;
          }
        }
      }
    }

    const ctx = this.tex.getContext();
    const img = ctx.createImageData(BW, BH);
    const px = img.data;
    const rgb = new Map<number, number>();
    const segs: number[] = [];
    const S = BS * CELL;
    for (let by = 0; by < BH; by++) {
      for (let bx = 0; bx < BW; bx++) {
        const i = by * BW + bx;
        const o = owner[i];
        if (o < 0) continue;
        let c = rgb.get(o);
        if (c === undefined) {
          c = sim.villages[o]?.hue ?? 0xffffff;
          rgb.set(o, c);
        }
        const k = i * 4;
        px[k] = (c >> 16) & 255;
        px[k + 1] = (c >> 8) & 255;
        px[k + 2] = c & 255;
        px[k + 3] = 30;
        // Edges of this land, drawn on its own side (a shared border gets both nations' lines, side by side).
        const x0 = bx * S;
        const y0 = by * S;
        const inset = 1.5;
        if (bx === 0 || owner[i - 1] !== o) segs.push(x0 + inset, y0, x0 + inset, y0 + S, c);
        if (bx === BW - 1 || owner[i + 1] !== o) segs.push(x0 + S - inset, y0, x0 + S - inset, y0 + S, c);
        if (by === 0 || owner[i - BW] !== o) segs.push(x0, y0 + inset, x0 + S, y0 + inset, c);
        if (by === BH - 1 || owner[i + BW] !== o) segs.push(x0, y0 + S - inset, x0 + S, y0 + S - inset, c);
      }
    }
    ctx.putImageData(img, 0, 0);
    this.segs = segs;
    this.tex.refresh();
  }
}
