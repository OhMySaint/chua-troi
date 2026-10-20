import { H, W } from '../world/constants';

const BUCKET = 8;
const COLS = Math.ceil(W / BUCKET);
const ROWS = Math.ceil(H / BUCKET);

/** Uniform bucket grid for "who is near (x, y)?" queries over moving entities. */
export class Grid<T extends { x: number; y: number; dead: boolean }> {
  private cells: T[][] = Array.from({ length: COLS * ROWS }, () => []);

  rebuild(items: T[]) {
    for (const c of this.cells) c.length = 0;
    for (const it of items) {
      if (it.dead) continue;
      const bx = Math.min(COLS - 1, Math.max(0, Math.floor(it.x / BUCKET)));
      const by = Math.min(ROWS - 1, Math.max(0, Math.floor(it.y / BUCKET)));
      this.cells[by * COLS + bx].push(it);
    }
  }

  /** Nearest item within r passing `ok`, or null. */
  nearest(x: number, y: number, r: number, ok: (t: T) => boolean): T | null {
    let best: T | null = null;
    let bd = r * r;
    this.each(x, y, r, (t) => {
      const d = (t.x - x) ** 2 + (t.y - y) ** 2;
      if (d < bd && ok(t)) {
        bd = d;
        best = t;
      }
    });
    return best;
  }

  count(x: number, y: number, r: number, ok: (t: T) => boolean) {
    let n = 0;
    const r2 = r * r;
    this.each(x, y, r, (t) => {
      if ((t.x - x) ** 2 + (t.y - y) ** 2 < r2 && ok(t)) n++;
    });
    return n;
  }

  each(x: number, y: number, r: number, fn: (t: T) => void) {
    const x0 = Math.max(0, Math.floor((x - r) / BUCKET));
    const x1 = Math.min(COLS - 1, Math.floor((x + r) / BUCKET));
    const y0 = Math.max(0, Math.floor((y - r) / BUCKET));
    const y1 = Math.min(ROWS - 1, Math.floor((y + r) / BUCKET));
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) {
        for (const t of this.cells[by * COLS + bx]) if (!t.dead) fn(t);
      }
    }
  }
}
