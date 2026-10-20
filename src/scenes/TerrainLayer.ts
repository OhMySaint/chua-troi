import Phaser from 'phaser';
import type { World } from '../world/World';
import { CELL, H, W } from '../world/constants';
import { WorldRenderer } from '../world/render';

/** Cells per detail chunk side (32 cells = 256 px). */
const CHUNK = 32;
const CPX = CHUNK * CELL;
const COLS = Math.ceil(W / CHUNK);
const ROWS = Math.ceil(H / CHUNK);
/** Detail chunks kept in memory (≈256 KB each). */
const MAX_CHUNKS = 90;
/** Below this zoom only the 1 px/cell overview is shown. */
export const DETAIL_ZOOM = 0.55;

interface Chunk {
  key: number;
  tex: Phaser.Textures.CanvasTexture;
  img: Phaser.GameObjects.Image;
  used: number;
  dirty: boolean;
}

/**
 * The map is far too big to paint at full detail (1280×800 cells × 8 px). We keep:
 *  - an overview texture, one pixel per cell, scaled up — always visible;
 *  - full-detail 256 px chunks, painted only where the camera looks, evicted when out of use.
 */
export class TerrainLayer {
  private scene: Phaser.Scene;
  private painter = new WorldRenderer();
  private overviewTex: Phaser.Textures.CanvasTexture;
  private overviewImg: ImageData;
  private overviewRow = 0;
  private chunks = new Map<number, Chunk>();
  private pool: Chunk[] = [];
  private chunkImg = new ImageData(CPX, CPX);
  private rolling = 0;
  private frameCount = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const tex = scene.textures.createCanvas('overview', W, H);
    if (!tex) throw new Error('Cannot create overview texture');
    this.overviewTex = tex;
    this.overviewImg = new ImageData(W, H);
    scene.add.image(0, 0, 'overview').setOrigin(0).setScale(CELL).setDepth(0);
  }

  /** Redraw everything (new or loaded world). */
  reset(w: World, roof: (o: number) => number, color: (o: number) => number) {
    this.painter.overview(w, color, 0, H, this.overviewImg.data);
    this.overviewTex.context.putImageData(this.overviewImg, 0, 0);
    this.overviewTex.refresh();
    for (const c of this.chunks.values()) c.dirty = true;
    void roof;
  }

  /** Mark the detail chunks covering cells (x, y) ± r as needing a repaint. */
  markDirty(x: number, y: number, r: number) {
    const x0 = Math.max(0, Math.floor((x - r - 2) / CHUNK));
    const x1 = Math.min(COLS - 1, Math.floor((x + r + 2) / CHUNK));
    const y0 = Math.max(0, Math.floor((y - r - 2) / CHUNK));
    const y1 = Math.min(ROWS - 1, Math.floor((y + r + 2) / CHUNK));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const c = this.chunks.get(cy * COLS + cx);
      if (c) c.dirty = true;
    }
  }

  update(w: World, roof: (o: number) => number, color: (o: number) => number, cam: Phaser.Cameras.Scene2D.Camera) {
    this.frameCount++;
    if (this.frameCount % 8 === 0) this.painter.frame++;

    // Overview: a band of rows per frame keeps it current.
    const r0 = this.overviewRow;
    const r1 = Math.min(H, r0 + 40);
    this.painter.overview(w, color, r0, r1, this.overviewImg.data);
    this.overviewTex.context.putImageData(this.overviewImg, 0, 0, 0, r0, W, r1 - r0);
    this.overviewTex.refresh();
    this.overviewRow = r1 >= H ? 0 : r1;

    const detail = cam.zoom >= DETAIL_ZOOM;
    for (const c of this.chunks.values()) c.img.setVisible(detail);
    if (!detail) return;

    const v = cam.worldView;
    const cx0 = Math.max(0, Math.floor(v.x / CPX));
    const cx1 = Math.min(COLS - 1, Math.floor(v.right / CPX));
    const cy0 = Math.max(0, Math.floor(v.y / CPX));
    const cy1 = Math.min(ROWS - 1, Math.floor(v.bottom / CPX));
    const now = this.frameCount;
    const visible: Chunk[] = [];
    const missing: [number, number, number][] = [];
    const midX = (cx0 + cx1) / 2;
    const midY = (cy0 + cy1) / 2;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(cy * COLS + cx);
        if (c) {
          c.used = now;
          visible.push(c);
        } else missing.push([cx, cy, (cx - midX) ** 2 + (cy - midY) ** 2]);
      }
    }

    // Paint a few missing chunks per frame, nearest to the centre of the view first.
    missing.sort((a, b) => a[2] - b[2]);
    let budget = 3;
    for (const [cx, cy] of missing) {
      if (budget-- <= 0) break;
      const c = this.obtain(cy * COLS + cx, cx, cy);
      this.paintChunk(c, w, roof);
      c.used = now;
    }
    // Then refresh: chunks the player just changed first, then one visible chunk in rotation.
    let refresh = 2;
    for (const c of visible) {
      if (refresh <= 0) break;
      if (c.dirty) {
        this.paintChunk(c, w, roof);
        refresh--;
      }
    }
    if (visible.length) {
      this.rolling = (this.rolling + 1) % visible.length;
      this.paintChunk(visible[this.rolling], w, roof);
    }
  }

  private obtain(key: number, cx: number, cy: number): Chunk {
    if (this.chunks.size >= MAX_CHUNKS) {
      // Evict the least recently seen chunk and reuse its texture.
      let old: Chunk | null = null;
      for (const c of this.chunks.values()) if (!old || c.used < old.used) old = c;
      if (old) {
        this.chunks.delete(old.key);
        this.pool.push(old);
      }
    }
    let c = this.pool.pop();
    if (!c) {
      const id = `chunk${this.chunks.size + this.pool.length}_${Math.random().toString(36).slice(2)}`;
      const tex = this.scene.textures.createCanvas(id, CPX, CPX)!;
      const img = this.scene.add.image(0, 0, id).setOrigin(0).setDepth(0.5);
      c = { key, tex, img, used: 0, dirty: true };
    }
    c.key = key;
    c.img.setPosition(cx * CPX, cy * CPX).setVisible(true);
    this.chunks.set(key, c);
    return c;
  }

  private paintChunk(c: Chunk, w: World, roof: (o: number) => number) {
    const cx = c.key % COLS;
    const cy = Math.floor(c.key / COLS);
    this.painter.paint(w, roof, cx * CPX, cy * CPX, CPX, CPX, this.chunkImg.data);
    c.tex.context.putImageData(this.chunkImg, 0, 0);
    c.tex.refresh();
    c.dirty = false;
  }
}
