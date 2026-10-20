import Phaser from 'phaser';
import { sim, ui, type Tool } from '../core';
import type { Animal } from '../sim/Animals';
import type { Human } from '../sim/Sim';
import { ERAS } from '../sim/eras';
import { CELL, Cover, H, N, W, type Weather } from '../world/constants';
import { PH, PW } from '../world/render';
import { TerrainLayer } from './TerrainLayer';
import { BuildingLayer } from './BuildingLayer';
import { Traffic, drawShip } from './Traffic';
import { Borders } from './Borders';
import { Speech } from './Speech';
import { session } from '../net/session';
import { audio } from '../audio/Audio';
import { settings } from '../settings';
import { formatPop } from '../sim/eras';

interface Drop {
  x: number;
  y: number;
  speed: number;
  phase: number;
}

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];
const HAIR = [0x2b1d14, 0x4a2f1b, 0x111111, 0x8a5a2b, 0xd8b26a];
const PANTS = 0x3c3448;
const NOMAD = 0x9e9e9e;
const MAX_ZOOM = 10;
/** Open sea shown beyond the map edges (world px). */
const OCEAN_PAD = 1200;
/** Below this zoom people and animals are drawn as dots, so crowds of hundreds stay readable. */
const LOD_ZOOM = 1.4;
const EAST = new Set(['lua_nuoc', 'hoa_ha', 'dao_xa', 'nui_cao']);
const CLOUD: Record<Weather, number> = { sun: 0, rain: 0.16, storm: 0.32, snow: 0.08, drought: 0.12 };

const BRUSH_TOOLS = new Set<Tool>(['raise', 'lower', 'smooth', 'water', 'forest', 'fire']);
const CLICK_TOOLS = new Set<Tool>(['volcano', 'quake', 'meteor', 'war', 'peace', 'inspect']);

/** A warship of its age, facing dir (1 right, -1 left), drawn around (px, py). */
function drawWarship(g: Phaser.GameObjects.Graphics, px: number, py: number, era: number, color: number, dir: number, carrier: boolean, t: number) {
  const R = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    g.fillStyle(c, a);
    g.fillRect(px + (dir > 0 ? x : -x - w), py + y, w, h);
  };
  const bob = Math.floor(t / 300 + px) % 2;
  py += bob;
  if (era >= 6) {
    // A hovering space cruiser over the waves, with its shadow below.
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(px, py + 6, 26, 4);
    R(-12, -10, 24, 4, 0x3a4050);
    R(-8, -13, 14, 3, 0x5a6478);
    R(10, -9, 3, 2, 0x7af0ff, 0.6 + 0.4 * Math.sin(t / 100));
    R(-4, -12, 4, 1, color);
    return;
  }
  if (carrier) {
    R(-16, -3, 32, 4, 0x5a6068);
    R(-15, -4, 30, 1, 0x7a8088);
    R(6, -9, 5, 5, 0x4a5058);
    R(-10, -4, 12, 1, 0xe8e8e8, 0.6); // deck marking
    R(7, -10, 3, 1, color);
    return;
  }
  if (era <= 2) {
    // Galley: low hull, a square sail, oars beating.
    R(-9, -2, 18, 3, 0x6a4428);
    R(8, -3, 3, 2, 0x6a4428);
    R(-1, -12, 1, 10, 0x4a3018);
    R(-5, -11, 9, 6, color);
    for (let o = -6; o <= 6; o += 3) R(o, 1 + (Math.floor(t / 200 + o) % 2), 1, 2, 0x4a3018);
    return;
  }
  if (era === 3) {
    // Galleon: tall hull, three masts, gun ports.
    R(-12, -3, 24, 5, 0x5a3a20);
    R(-12, -5, 6, 2, 0x5a3a20);
    for (const m of [-6, 0, 6]) {
      R(m, -15, 1, 12, 0x3a2414);
      R(m - 3, -14, 7, 4, 0xe8e0c8);
      R(m - 3, -9, 7, 3, 0xe8e0c8);
    }
    R(-1, -17, 3, 2, color);
    for (let o = -9; o <= 9; o += 4) R(o, -1, 2, 1, 0x1a1a1a);
    return;
  }
  // Ironclad / destroyer: grey steel, turrets, funnel smoke.
  const steel = era === 4 ? 0x4a4e54 : 0x6a7078;
  R(-13, -3, 26, 4, steel);
  R(11, -2, 4, 2, steel);
  R(-4, -7, 8, 4, era === 4 ? 0x3a3e44 : 0x5a6068);
  R(-10, -5, 4, 2, 0x2a2e34);
  R(-7, -5, 4, 1, 0x2a2e34);
  R(6, -5, 4, 2, 0x2a2e34);
  R(9, -5, 4, 1, 0x2a2e34);
  R(-1, -11, 3, 4, era === 4 ? 0x2a2a2a : 0x4a4e54);
  R(0, -8, 2, 1, color);
  g.fillStyle(0x9a9a9a, 0.35);
  g.fillCircle(px - dir * 2, py - 14 - (Math.floor(t / 250) % 3), 3);
}

/** Short form of a nation's name for city labels: "Văn Lang" → "VL", "Athena" → "ATH". */
function abbr(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.map((w) => w[0]).join('').toUpperCase() : name.slice(0, 3).toUpperCase();
}

export class WorldScene extends Phaser.Scene {
  private terrain!: TerrainLayer;
  private terrainFx!: Phaser.GameObjects.Graphics;
  private people!: Phaser.GameObjects.Graphics;
  private nightShade!: Phaser.GameObjects.Rectangle;
  private cloudShade!: Phaser.GameObjects.Rectangle;
  private glow!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private flash!: Phaser.GameObjects.Rectangle;
  private cursor!: Phaser.GameObjects.Graphics;
  private borders!: Borders;
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private drops: Drop[] = [];
  private fires: number[] = [];
  private fireScan = 0;
  private labelAcc = 1;
  private spawnAcc = 0;
  private generation = -1;
  private minZoom = 0.3;
  private buildings!: BuildingLayer;
  private traffic = new Traffic();
  private speech!: Speech;
  private syncAcc = 1;
  private syncView = { x: 0, y: 0, z: 1 };
  private launches: { x: number; y: number; t: number }[] = [];
  private peerLabel?: Phaser.GameObjects.Text;
  private heard = new WeakSet<object>();
  private tour = { x: 0, y: 0, t: 0 };
  private vis = { rain: 0, storm: 0, snow: 0, regions: 1 };
  private dragging = false;
  private keys?: Record<'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('World');
  }

  create() {
    this.terrain = new TerrainLayer(this);

    // Depth bands: terrain 0, territory 1, people 9, buildings 10–11, sky & effects 30+.
    this.terrainFx = this.add.graphics().setDepth(1);
    if (this.textures.exists('borders')) this.textures.remove('borders');
    this.borders = new Borders(this);
    this.buildings = new BuildingLayer(this);
    this.speech = new Speech(this);
    // People and vehicles sit just below the buildings: anyone walking behind a house is hidden by it.
    this.people = this.add.graphics().setDepth(9);
    this.cloudShade = this.add.rectangle(0, 0, PW, PH, 0x2a2e38, 0).setOrigin(0).setDepth(30);
    this.nightShade = this.add.rectangle(0, 0, PW, PH, 0x0b1035, 0).setOrigin(0).setDepth(31);
    this.glow = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(32);
    this.fx = this.add.graphics().setDepth(33);
    this.flash = this.add.rectangle(0, 0, PW, PH, 0xffffff, 0).setOrigin(0).setDepth(34);
    this.cursor = this.add.graphics().setDepth(35);
    this.peerLabel = this.add
      .text(0, 0, '', { fontFamily: 'VT323, monospace', fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 })
      .setDepth(41)
      .setVisible(false);

    for (let i = 0; i < 600; i++) {
      this.drops.push({ x: Math.random(), y: Math.random(), speed: 0.8 + Math.random() * 0.6, phase: Math.random() * 6 });
    }

    const cam = this.cameras.main;
    // Let the camera roam past the map edge so islands near it can be seen whole, with sea around.
    cam.setBounds(-OCEAN_PAD, -OCEAN_PAD, PW + OCEAN_PAD * 2, PH + OCEAN_PAD * 2);
    cam.setBackgroundColor(0x163062);
    this.input.mouse?.disableContextMenu();
    this.scale.on('resize', () => this.fitZoomLimits());
    this.fitZoomLimits();

    this.setupTrackpad();
    this.keys = this.input.keyboard?.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D', false) as typeof this.keys;

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) {
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    const stopDrag = () => {
      this.dragging = false;
      this.game.canvas.style.cursor = ui.tool === 'pan' ? 'grab' : '';
    };
    this.input.on('pointerup', stopDrag);
    this.input.on('pointerupoutside', stopDrag);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // Drag the map: hand tool, ⌥ Option + drag (trackpad), or right/middle mouse button.
      const alt = (p.event as MouseEvent | undefined)?.altKey ?? false;
      if (p.rightButtonDown() || p.middleButtonDown() || ui.tool === 'pan' || alt) {
        this.dragging = true;
        this.game.canvas.style.cursor = 'grabbing';
        return;
      }
      const pt = cam.getWorldPoint(p.x, p.y);
      const x = pt.x / CELL;
      const y = pt.y / CELL;
      const r = ui.brush;
      switch (ui.tool) {
        case 'inspect':
          sim.pick(x, y);
          break;
        case 'volcano':
          sim.issue({ god: sim.me, t: 'volcano', x, y });
          this.markDirty(x, y, 10);
          break;
        case 'quake':
          sim.issue({ god: sim.me, t: 'quake', x, y, r: r * 2 + 4 });
          this.markDirty(x, y, r * 4 + 10);
          break;
        case 'meteor':
          sim.issue({ god: sim.me, t: 'meteor', x, y, r: Math.max(3, r + 2) });
          this.markDirty(x, y, r + 8);
          break;
        case 'war':
          sim.incite(x, y);
          break;
        case 'peace':
          sim.pacify(x, y);
          break;
        default:
          this.spawnAcc = 1;
      }
    });
  }

  /**
   * Mac trackpad: two-finger swipe pans, pinch zooms (Chrome/Firefox send ctrl+wheel, Safari sends
   * gesture events). A real mouse wheel still zooms.
   */
  private setupTrackpad() {
    const canvas = this.game.canvas;
    const cam = this.cameras.main;
    let lastTrackpad = 0;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) * cam.width) / r.width, ((e.clientY - r.top) * cam.height) / r.height];
    };
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const dx = e.deltaX * k;
        const dy = e.deltaY * k;
        const [sx, sy] = local(e);
        if (e.ctrlKey || e.metaKey) {
          this.zoomAt(sx, sy, cam.zoom * Math.exp(-dy * 0.012));
          return;
        }
        const now = performance.now();
        if (dx !== 0 || !Number.isInteger(dy) || Math.abs(dy) < 40) lastTrackpad = now;
        const mouseWheel = e.deltaMode === 1 || (now - lastTrackpad > 400 && Math.abs(dy) >= 40);
        if (mouseWheel) this.zoomAt(sx, sy, cam.zoom * (dy > 0 ? 0.85 : 1.18));
        else {
          lastTrackpad = now;
          cam.scrollX += dx / cam.zoom;
          cam.scrollY += dy / cam.zoom;
        }
      },
      { passive: false },
    );
    // Safari pinch
    let startZoom = 1;
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    canvas.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      startZoom = cam.zoom;
    });
    canvas.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const g = e as Gesture;
      const [sx, sy] = local(g);
      this.zoomAt(sx, sy, startZoom * g.scale);
    });
  }

  private fitZoomLimits() {
    const cam = this.cameras.main;
    this.minZoom = Math.min(cam.width / (PW + OCEAN_PAD), cam.height / (PH + OCEAN_PAD));
    if (cam.zoom < this.minZoom) cam.setZoom(this.minZoom);
  }

  /** Zoom keeping the screen point (sx, sy) fixed. */
  private zoomAt(sx: number, sy: number, zoom: number) {
    const cam = this.cameras.main;
    const oldZ = cam.zoom;
    const newZ = Phaser.Math.Clamp(zoom, this.minZoom, MAX_ZOOM);
    cam.scrollX += (sx - cam.width / 2) * (1 / oldZ - 1 / newZ);
    cam.scrollY += (sy - cam.height / 2) * (1 / oldZ - 1 / newZ);
    cam.setZoom(newZ);
  }

  private markDirty(x: number, y: number, r: number) {
    this.terrain.markDirty(x, y, r);
  }

  private roof = (owner: number) => (EAST.has(sim.villages[owner]?.culture.id ?? '') ? 1 : 0);

  private color = (owner: number) => sim.villages[owner]?.color ?? 0x8a5a3a;

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    sim.tickVisuals(dt);

    const cam = this.cameras.main;

    if (this.generation !== sim.generation) {
      this.generation = sim.generation;
      this.terrain.reset(sim.world, this.roof, this.color);
      this.buildings.clear();
      this.traffic.clear();
      const h = sim.humans[0];
      cam.setZoom(3);
      if (h) cam.centerOn(h.x * CELL, h.y * CELL);
      else cam.centerOn(PW / 2, PH / 2);
    }
    this.terrain.update(sim.world, this.roof, this.color, cam);

    if (ui.attract) this.attractCamera(dt);
    if (ui.enter) {
      ui.enter = false;
      this.tour.t = 0;
      const v = [...sim.villages].filter((o) => o.alive).sort((a, b) => b.pop - a.pop)[0];
      const h = sim.humans[0];
      cam.setZoom(3);
      if (v) cam.centerOn(v.cx * CELL, v.cy * CELL);
      else if (h) cam.centerOn(h.x * CELL, h.y * CELL);
    }

    if (ui.zoomCmd) {
      if (ui.zoomCmd === 'fit') {
        cam.setZoom(this.minZoom);
        cam.centerOn(PW / 2, PH / 2);
      } else this.zoomAt(cam.width / 2, cam.height / 2, cam.zoom * (ui.zoomCmd === 'in' ? 1.4 : 1 / 1.4));
      ui.zoomCmd = null;
    }
    if (ui.focus) {
      cam.setZoom(Math.max(cam.zoom, 2.5));
      cam.centerOn(ui.focus.x * CELL, ui.focus.y * CELL);
      ui.focus = null;
    }
    if (sim.shake > 0.5 && !cam.shakeEffect.isRunning) cam.shake(500, 0.006);

    ui.view.x = cam.midPoint.x / CELL;
    ui.view.y = cam.midPoint.y / CELL;
    const p = this.input.activePointer;
    const pt = cam.getWorldPoint(p.x, p.y);
    session?.cursor(pt.x / CELL, pt.y / CELL, ui.tool);
    const painting = p.isDown && !this.dragging;
    if (!this.dragging) this.game.canvas.style.cursor = ui.tool === 'pan' ? 'grab' : '';

    // Keyboard panning (arrows / WASD), unless the player is typing in a field.
    const k = this.keys;
    if (k && !(document.activeElement instanceof HTMLInputElement)) {
      const speed = (600 * dt) / cam.zoom;
      if (k.LEFT.isDown || k.A.isDown) cam.scrollX -= speed;
      if (k.RIGHT.isDown || k.D.isDown) cam.scrollX += speed;
      if (k.UP.isDown || k.W.isDown) cam.scrollY -= speed;
      if (k.DOWN.isDown || k.S.isDown) cam.scrollY += speed;
    }
    if (painting) this.applyTool(pt.x / CELL, pt.y / CELL, dt);

    this.fireScan -= dt;
    if (this.fireScan <= 0) {
      this.fireScan = 0.25;
      this.fires.length = 0;
      if (sim.world.fireCount > 0) {
        const c = sim.world.cover;
        for (let i = 0; i < N; i++) if (c[i] === Cover.FIRE || c[i] === Cover.LAVA) this.fires.push(i);
      }
    }

    // Re-sync building sprites regularly — and at once when the camera jumps or zooms, so a city
    // never stays missing while you fly in to it.
    this.syncAcc += dt;
    const mid = cam.midPoint;
    const moved = Math.hypot(mid.x - this.syncView.x, mid.y - this.syncView.y) > cam.worldView.width / 4;
    const zoomed = Math.abs(cam.zoom - this.syncView.z) / this.syncView.z > 0.15;
    if (this.syncAcc > 0.3 || moved || zoomed) {
      this.syncAcc = 0;
      this.syncView = { x: mid.x, y: mid.y, z: cam.zoom };
      this.buildings.sync(sim, cam.worldView, cam.zoom);
    }
    this.buildings.setDark(Math.max(0, Math.min(1, 1 - sim.world.daylight() * 1.8)));
    if (!sim.paused) this.traffic.update(Math.min(dt, 0.1) * sim.speed, sim);

    this.borders.update(dt, sim, cam);
    this.drawTowns();
    this.drawPeople();
    this.drawSky(dt);
    this.drawLights();
    this.drawLabels(dt);
    this.speech.update(dt, sim, cam, settings.speech && !ui.attract);
    this.listen();
    this.drawCursor(pt.x, pt.y);
  }

  /** Title screen: glide between nations and islands. */
  /** Title screen: one still view over the islands (no motion — it was dizzying). */
  private attractCamera(_dt: number) {
    if (this.tour.t > 0 && this.tour.x === this.generation) return;
    const cam = this.cameras.main;
    this.tour.t = 1;
    this.tour.x = this.generation;
    cam.setZoom(Math.max(this.minZoom, Math.min(cam.width / PW, cam.height / PH) * 1.25));
    cam.centerOn(PW / 2, PH / 2);
  }

  /** What the camera sees → the soundscape; new events → sound effects. */
  private listen() {
    const w = sim.world;
    const view = this.cameras.main.worldView;
    let sea = 0;
    let forest = 0;
    for (let k = 0; k < 25; k++) {
      const x = Math.max(0, Math.min(W - 1, Math.floor((view.x + (view.width * ((k % 5) + 0.5)) / 5) / CELL)));
      const y = Math.max(0, Math.min(H - 1, Math.floor((view.y + (view.height * (Math.floor(k / 5) + 0.5)) / 5) / CELL)));
      const i = y * W + x;
      if (w.isWater(i)) sea++;
      else if (w.cover[i] === Cover.FOREST) forest++;
    }
    let fires = 0;
    for (const i of this.fires) if (this.inView((i % W) * CELL, Math.floor(i / W) * CELL)) fires++;
    const r = Math.max(1, this.vis.regions);
    audio.frame({
      inGame: !ui.attract,
      era: sim.villages.reduce((m, v) => (v.alive ? Math.max(m, v.era) : m), 0),
      night: 1 - w.daylight(),
      rain: (this.vis.rain + this.vis.storm) / r,
      storm: this.vis.storm / r,
      snow: this.vis.snow / r,
      fire: Math.min(1, fires / 30),
      sea: sea / 25,
      forest: forest / 25,
      war: sim.wars.length > 0,
    });

    const near = (x: number, y: number, pad = 300) => this.inView(x * CELL, y * CELL, pad);
    for (const st of sim.strikes) {
      if (this.heard.has(st)) continue;
      this.heard.add(st);
      if (near(st.x, st.y, 600)) audio.thunder(near(st.x, st.y, 0) ? 1 : 0.5);
    }
    for (const im of sim.impacts) {
      if (this.heard.has(im)) continue;
      this.heard.add(im);
      if (near(im.x, im.y, 800)) audio.impact(im.kind);
    }
    for (const c of sim.clashes) {
      if (this.heard.has(c)) continue;
      this.heard.add(c);
      if (near(c.x, c.y, 0) && Math.random() < 0.4) audio.clash();
    }
    for (const sh of sim.shots) {
      if (this.heard.has(sh)) continue;
      this.heard.add(sh);
      if (near(sh.x1, sh.y1, 0) && Math.random() < 0.4) audio.shot();
    }
    for (const l of this.launches) {
      if (this.heard.has(l)) continue;
      this.heard.add(l);
      if (this.inView(l.x, l.y, 200)) audio.rocket();
    }
    for (const cue of sim.sfx.splice(0)) {
      if (ui.attract) continue;
      if (cue === 'achievement' || cue === 'miracle') audio.chime();
      else if (cue === 'era') audio.fanfare();
      else if (cue === 'war') audio.war();
      else if (cue === 'wish') audio.bell();
    }
  }

  /** Brush tools become commands (so a second god sees exactly the same strokes). */
  private applyTool(x: number, y: number, dt: number) {
    const r = ui.brush;
    const god = sim.me;
    if (BRUSH_TOOLS.has(ui.tool)) this.markDirty(x, y, r);
    if (BRUSH_TOOLS.has(ui.tool) || ui.tool === 'weather') audio.tool(ui.tool);
    else if (ui.tool === 'human' || ui.tool === 'deer' || ui.tool === 'wolf') audio.tool('spawn');
    switch (ui.tool) {
      case 'raise':
        sim.issue({ god, t: 'raise', x, y, r, a: 0.35 * dt });
        break;
      case 'lower':
        sim.issue({ god, t: 'raise', x, y, r, a: -0.35 * dt });
        break;
      case 'smooth':
        sim.issue({ god, t: 'smooth', x, y, r, k: dt * 4 });
        break;
      case 'water':
      case 'forest':
      case 'fire':
        sim.issue({ god, t: ui.tool, x, y, r });
        break;
      case 'weather':
        sim.issue({ god, t: 'weather', x, y, r: r * 8, w: ui.weatherBrush });
        break;
      case 'human':
      case 'deer':
      case 'wolf':
        this.spawnAcc += dt;
        if (this.spawnAcc > 0.15) {
          this.spawnAcc = 0;
          const jx = x + Math.random() - 0.5;
          const jy = y + Math.random() - 0.5;
          if (ui.tool === 'human') sim.issue({ god, t: 'human', x: jx, y: jy });
          else sim.issue({ god, t: 'animal', kind: ui.tool, x: jx, y: jy });
        }
        break;
    }
  }

  private inView(x: number, y: number, pad = 24) {
    const v = this.cameras.main.worldView;
    return x > v.x - pad && x < v.right + pad && y > v.y - pad && y < v.bottom + pad;
  }

  // ---------- Towns: territory, walls, centre buildings, temples ----------

  private drawTowns() {
    const g = this.terrainFx;
    g.clear();
    const zoom = this.cameras.main.zoom;
    const t = this.time.now;
    // Cities of one nation are tied to their capital by a dotted line in the nation's colour.
    for (const v of sim.villages) {
      if (!v.alive || v.isCapital) continue;
      const c = v.capital;
      const x1 = v.cx * CELL + 4;
      const y1 = v.cy * CELL + 4;
      const x2 = c.cx * CELL + 4;
      const y2 = c.cy * CELL + 4;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (!this.inView((x1 + x2) / 2, (y1 + y2) / 2, len / 2 + 40)) continue;
      const step = Math.max(14, 10 / zoom);
      const dots = Math.min(120, Math.floor(len / step));
      g.fillStyle(v.color, 0.55);
      for (let k = 1; k < dots; k++) g.fillCircle(x1 + ((x2 - x1) * k) / dots, y1 + ((y2 - y1) * k) / dots, Math.max(2, 2 / zoom));
    }
    for (const v of sim.villages) {
      if (!v.alive) continue;
      const x = v.cx * CELL + 4;
      const y = v.cy * CELL + 4;
      const R = v.radius * CELL;
      if (!this.inView(x, y, R + 40)) continue;
      const atWar = v.enemies.size > 0;
      // Land and borders are drawn by the border layer; a city at war pulses red.
      if (atWar) {
        g.lineStyle(Math.max(1, 2 / zoom), 0xff3030, 0.5 + 0.3 * Math.sin(t / 200));
        g.strokeCircle(x, y, R);
      }
      if (v.era >= 2 && v.era <= 3 && v.pop >= 12) {
        // Palisade (iron age) or stone wall with towers (medieval).
        const wr = (v.radius - 1.5) * CELL;
        g.lineStyle(v.era === 2 ? 2 : 3, v.era === 2 ? 0x7a5230 : 0x9a968e, 0.9);
        g.strokeCircle(x, y, wr);
        const towers = v.era === 2 ? 6 : 10;
        for (let k = 0; k < towers; k++) {
          const a = (k / towers) * Math.PI * 2;
          const tx = x + Math.cos(a) * wr;
          const ty = y + Math.sin(a) * wr;
          g.fillStyle(v.era === 2 ? 0x6a4428 : 0x8a867e, 1);
          g.fillRect(tx - 3, ty - 7, 6, 8);
          g.fillStyle(v.era === 2 ? 0x8a6a4a : 0x6a665e, 1);
          g.fillRect(tx - 4, ty - 8, 8, 2);
        }
      }
    }
  }

  // ---------- People & animals ----------

  private drawPeople() {
    const now0 = () => sim.world.time;
    const g = this.people;
    g.clear();
    const t = this.time.now;
    const zoom = this.cameras.main.zoom;
    const lod = zoom < LOD_ZOOM;

    for (const v of sim.villages) {
      if (!v.alive || !this.inView(v.cx * CELL, v.cy * CELL, 60)) continue;
      const bx = v.cx * CELL + 4;
      const by = v.cy * CELL + 8;
      if (v.era <= 1) {
        // Campfire in front of the chief's hall.
        const fx = bx + (v.era === 0 ? 0 : 14);
        const flick = Math.sin(t / 70 + v.id * 3) > 0;
        g.fillStyle(0x6b4423, 1);
        g.fillRect(fx - 3, by - 2, 6, 1);
        g.fillStyle(0xd62c16, 1);
        g.fillRect(fx - 2, by - 5, 4, 2);
        g.fillStyle(0xff8c1e, 1);
        g.fillRect(fx - 1, by - (flick ? 7 : 6), 2, 3);
      }
      if (v.praying > 0) {
        const a = 0.25 + 0.15 * Math.sin(t / 150);
        g.fillStyle(0xffe9a0, a * 0.5);
        g.fillRect(bx - 3, by - 90, 6, 86);
        g.lineStyle(1, 0xffe9a0, a);
        g.strokeCircle(bx, by - 4, 22 + 3 * Math.sin(t / 200));
      }
    }
    this.traffic.draw(g, lod, (x, y) => this.inView(x, y), t);

    // Bombers on their way.
    for (const a of sim.airstrikes) {
      const k = Math.max(0, Math.min(1, (now0() - a.start) / (a.end - a.start)));
      const x = (a.x1 + (a.x2 - a.x1) * k) * CELL;
      const y = (a.y1 + (a.y2 - a.y1) * k) * CELL;
      if (!this.inView(x, y, 200)) continue;
      const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const era = a.era ?? 5;
      // Biplanes fly low and small; jets high with a contrail; drones glow.
      const alt = era === 4 ? 30 : 48;
      const len = era === 4 ? 5 : 7;
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(x + 8, y + 6, len * 2 + 2, 5);
      if (era >= 5) {
        g.lineStyle(2, era >= 6 ? 0x9ae6ff : 0xffffff, 0.3);
        g.lineBetween(x, y - alt, x - c * 70, y - alt - sn * 70);
      }
      const body = a.nuke ? 0xe8e8e8 : era === 4 ? 0x8a6a3a : era >= 6 ? 0x2a3040 : 0x5a6470;
      g.fillStyle(body, 1);
      for (let s2 = -len; s2 <= len; s2++) g.fillRect(x + c * s2 - 1, y - alt + sn * s2 - 1, 3, 3);
      // Wings: a biplane has two stacked, a jet one swept pair.
      const span = era === 4 ? 6 : 7;
      for (let s2 = -span; s2 <= span; s2++) g.fillRect(x - sn * s2 - 1, y - alt + c * s2 - 1, 2, 2);
      if (era === 4) for (let s2 = -span; s2 <= span; s2++) g.fillRect(x - sn * s2 + c * 2 - 1, y - alt + c * s2 + sn * 2 - 1, 2, 1);
      if (era === 4 && Math.floor(t / 60) % 2) {
        g.fillStyle(0xdddddd, 0.8);
        g.fillRect(x + c * (len + 1) - 2, y - alt + sn * (len + 1) - 2, 4, 4);
      }
      if (era >= 6) {
        g.fillStyle(0x7af0ff, 0.6 + 0.4 * Math.sin(t / 90));
        g.fillCircle(x - c * len, y - alt - sn * len, 2.5);
      }
      g.fillStyle(a.color, 1);
      g.fillRect(x - c * len - 1, y - alt - sn * len - 1, 3, 3);
      if (k > 0.85) {
        g.fillStyle(0x2a2a2a, 1);
        g.fillRect(x - 1, y - alt + 8 + (k - 0.85) * 240, 2, 4);
      }
    }

    // War fleets.
    for (const f of sim.fleets) {
      const k = Math.max(0, Math.min(1, (now0() - f.start) / (f.end - f.start)));
      const x = Math.round((f.x1 + (f.x2 - f.x1) * k) * CELL);
      const y = Math.round((f.y1 + (f.y2 - f.y1) * k) * CELL);
      if (!this.inView(x, y, 60)) continue;
      const dir = Math.sign(f.x2 - f.x1) || 1;
      // Two or three ships sail together.
      const n = f.carrier ? 1 : 3;
      for (let s2 = 0; s2 < n; s2++) {
        const ox = -dir * s2 * 22;
        const oy = (s2 % 2 ? 1 : -1) * s2 * 9;
        g.fillStyle(0xd8eef8, 0.5);
        g.fillRect(x + ox - dir * 18, y + oy + 2, 8, 1);
        drawWarship(g, x + ox, y + oy, f.era, f.color, dir, f.carrier, t);
      }
    }

    // Colonists crossing the sea.
    const now = sim.world.time;
    for (const vo of sim.voyages) {
      const k = Math.max(0, Math.min(1, (now - vo.start) / (vo.end - vo.start)));
      const x = (vo.x1 + (vo.x2 - vo.x1) * k) * CELL;
      const y = (vo.y1 + (vo.y2 - vo.y1) * k) * CELL;
      if (!this.inView(x, y)) continue;
      g.fillStyle(0xd8eef8, 0.5);
      g.fillRect(x - (vo.x2 > vo.x1 ? 14 : -10), y, 4, 1);
      drawShip(g, Math.round(x), Math.round(y), vo.era, vo.color, Math.sign(vo.x2 - vo.x1) || 1, t);
    }

    // The nation picked as aggressor with the war tool.
    const wf = sim.warFrom;
    if (wf?.alive) {
      g.lineStyle(Math.max(2, 3 / zoom), 0xff3030, 0.6 + 0.3 * Math.sin(t / 150));
      g.strokeCircle(wf.cx * CELL + 4, wf.cy * CELL + 4, wf.radius * CELL + 6);
    }
    const pf = sim.peaceFrom;
    if (pf?.alive) {
      g.lineStyle(Math.max(2, 3 / zoom), 0x9cff9c, 0.6 + 0.3 * Math.sin(t / 150));
      g.strokeCircle(pf.cx * CELL + 4, pf.cy * CELL + 4, pf.radius * CELL + 6);
    }
    // Treaties of friendship: a dotted bond of light between the two capitals.
    for (const n of sim.nations()) {
      for (const o of n.pacts) {
        const m = sim.villages[o];
        if (!m?.alive || m.id < n.id) continue;
        const x1 = n.cx * CELL + 4;
        const y1 = n.cy * CELL + 4;
        const x2 = m.cx * CELL + 4;
        const y2 = m.cy * CELL + 4;
        const len = Math.hypot(x2 - x1, y2 - y1);
        const dots = Math.min(80, Math.floor(len / 24));
        const shift = (t / 1200) % 1;
        g.fillStyle(0xd8ffd0, 0.75);
        for (let k = 0; k < dots; k++) {
          const f = (k + shift) / dots;
          g.fillCircle(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, Math.max(2, 2.5 / zoom));
        }
      }
    }

    for (const a of sim.animals.list) {
      const px = a.x * CELL;
      const py = a.y * CELL;
      if (!this.inView(px, py)) continue;
      if (lod) {
        g.fillStyle(a.kind === 'deer' ? 0xa0703a : 0x7a7a84, 1);
        g.fillRect(px - 2, py - 2, 4, 3);
      } else this.drawAnimal(g, a, t);
    }

    for (const h of sim.humans) {
      if (h.inside) continue;
      const px = h.x * CELL;
      const py = h.y * CELL;
      if (!this.inView(px, py)) continue;
      if (lod) {
        const shirt = h.village >= 0 ? (sim.villages[h.village]?.color ?? NOMAD) : NOMAD;
        if (h.role === 'soldier') {
          g.fillStyle(0x200808, 1);
          g.fillRect(px - 3, py - 4, 6, 6);
        }
        g.fillStyle(shirt, 1);
        g.fillRect(px - 2, py - 3, 4, 4);
      } else this.drawHuman(g, h, t);
    }

    const sv = sim.selectedVillage;
    if (sv?.alive) {
      g.lineStyle(Math.max(1, 2 / zoom), 0xffe14d, 0.9);
      g.strokeCircle(sv.cx * CELL + 4, sv.cy * CELL + 4, sv.radius * CELL + 3);
    }
    const sh = sim.selectedHuman;
    if (sh && lod) {
      g.lineStyle(2 / zoom, 0xffe14d, 1);
      g.strokeCircle(sh.x * CELL, sh.y * CELL, 6 / zoom + 4);
    }
  }

  private drawAnimal(g: Phaser.GameObjects.Graphics, a: Animal, t: number) {
    const px = Math.round(a.x * CELL);
    const py = Math.round(a.y * CELL) + 2;
    const f = a.facing;
    const step = a.hasTarget && Math.floor(t / 110 + a.id) % 2 === 0;
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(px + 0.5, py, 7, 2);
    if (a.kind === 'deer') {
      g.fillStyle(0x9a6a3a, 1);
      g.fillRect(px - 3, py - 4, 6, 2);
      g.fillRect(px + (f > 0 ? 2 : -4), py - 6, 2, 2);
      g.fillStyle(0xe8d8c0, 1);
      g.fillRect(px + (f > 0 ? -3 : 2), py - 4, 1, 1);
      g.fillStyle(0x5a3a1a, 1);
      g.fillRect(px - 3, py - 2, 1, step ? 1 : 2);
      g.fillRect(px + 2, py - 2, 1, step ? 2 : 1);
      g.fillStyle(0xd8c090, 1);
      g.fillRect(px + (f > 0 ? 2 : -3), py - 8, 1, 2);
      g.fillRect(px + (f > 0 ? 4 : -5), py - 8, 1, 1);
    } else {
      g.fillStyle(0x7a7a84, 1);
      g.fillRect(px - 3, py - 4, 7, 2);
      g.fillRect(px + (f > 0 ? 3 : -5), py - 5, 3, 2);
      g.fillStyle(0x5a5a64, 1);
      g.fillRect(px + (f > 0 ? 3 : -4), py - 6, 1, 1);
      g.fillRect(px + (f > 0 ? -4 : 4), py - 5, 1, 2);
      g.fillRect(px - 3, py - 2, 1, step ? 1 : 2);
      g.fillRect(px + 2, py - 2, 1, step ? 2 : 1);
      if (a.prey) {
        g.fillStyle(0xff3030, 1);
        g.fillRect(px + (f > 0 ? 5 : -5), py - 5, 1, 1);
      }
    }
  }

  private drawHuman(g: Phaser.GameObjects.Graphics, h: Human, t: number) {
    const px = Math.round(h.x * CELL);
    const py = Math.round(h.y * CELL) + 2; // feet
    const v = h.village >= 0 ? sim.villages[h.village] : null;
    const shirt = v?.color ?? NOMAD;
    const skin = SKIN[h.id % SKIN.length];
    const hair = HAIR[(h.id >> 2) % HAIR.length];
    const child = h.age < 60;
    const swimming = h.action === 'swim';
    const sitting = h.action === 'huddle' || h.action === 'pray';
    const walking = h.hasTarget && !sitting;
    const stepA = walking && Math.floor(t / 130 + h.id) % 2 === 0;
    const soldier = h.role === 'soldier' || h.action === 'fight';
    const era = v?.era ?? 0;

    // Vehicles of war replace the walking figure.
    if (h.role === 'soldier' && (h.unit === 'tank' || h.unit === 'mech')) {
      this.drawMachine(g, h, px, py, shirt, t, walking);
      return;
    }
    const riding = h.role === 'soldier' && h.unit === 'cavalry' && !swimming;
    if (riding) {
      // Horse beneath the rider.
      const f = h.tx >= h.x ? 1 : -1;
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(px + 0.5, py, 10, 2);
      g.fillStyle(0x6a4428, 1);
      g.fillRect(px - 4, py - 5, 9, 3);
      g.fillRect(px + (f > 0 ? 4 : -6), py - 7, 3, 3);
      g.fillStyle(0x3a2414, 1);
      g.fillRect(px + (f > 0 ? -5 : 5), py - 5, 1, 3);
      for (const lx of [-4, -2, 2, 4]) g.fillRect(px + lx, py - 2, 1, stepA === lx > 0 ? 2 : 1);
    }

    const top = swimming ? -3 : child ? -6 : sitting ? -6 : riding ? -12 : -8;

    if (swimming) {
      g.fillStyle(0xc4e4f0, 0.9);
      g.fillRect(px - 3, py - 1, 7, 1);
    } else {
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(px + 0.5, py, 7, 2);
    }

    // Hair (or helmet) + face
    g.fillStyle(soldier && era >= 2 ? (era >= 5 ? 0x4a5a3a : 0x9a9aa0) : hair, 1);
    g.fillRect(px - 1, py + top, 3, 1);
    g.fillStyle(skin, 1);
    g.fillRect(px - 1, py + top + 1, 3, 2);
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(px, py + top + 1, 1, 1);

    if (!swimming) {
      const bodyY = py + top + 3;
      const bodyH = child ? 2 : 3;
      g.fillStyle(soldier && era >= 4 ? 0x4a5a3a : shirt, 1);
      g.fillRect(px - 1, bodyY, 3, bodyH);
      g.fillStyle(skin, 1);
      g.fillRect(px - 2, bodyY + (walking && stepA ? 1 : 0), 1, 2);
      g.fillRect(px + 2, bodyY + (walking && !stepA ? 1 : 0), 1, 2);
      if (!sitting) {
        g.fillStyle(PANTS, 1);
        const legY = bodyY + bodyH;
        const legH = py - legY;
        g.fillRect(px - 1, legY, 1, stepA ? legH - 1 : legH);
        g.fillRect(px + 1, legY, 1, walking && !stepA ? legH - 1 : legH);
      }
      if (soldier) this.drawWeapon(g, px, bodyY, era, shirt);
      if (h.action === 'hunt' && !soldier) {
        g.fillStyle(0x7a5230, 1);
        g.fillRect(px + 3, bodyY - 4, 1, 7);
        g.fillStyle(0xaaaaaa, 1);
        g.fillRect(px + 3, bodyY - 5, 1, 1);
      }
    }

    if (h.carryWood) {
      g.fillStyle(0x7a4a22, 1);
      g.fillRect(px - 3, py + top + 2, 6, 1);
      g.fillStyle(0xa8743e, 1);
      g.fillRect(px - 3, py + top + 2, 1, 1);
    } else if (h.carryFood) {
      g.fillStyle(0x8a5a2b, 1);
      g.fillRect(px - 1, py + top - 2, 3, 2);
      g.fillStyle(0xf0cf50, 1);
      g.fillRect(px - 1, py + top - 3, 3, 1);
    }

    if (h.action === 'pray' && Math.floor(t / 300 + h.id) % 3 === 0) {
      g.fillStyle(0xffe9a0, 1);
      g.fillRect(px, py + top - 3, 1, 1);
    }

    if ((h.action === 'flee' || swimming) && Math.floor(t / 200) % 2) {
      g.fillStyle(0xffffff, 1);
      g.fillRect(px - 1, py + top - 7, 3, 5);
      g.fillStyle(0xe02020, 1);
      g.fillRect(px, py + top - 6, 1, 2);
      g.fillRect(px, py + top - 3, 1, 1);
    }

    if (h === sim.selectedHuman) {
      g.lineStyle(1, 0xffe14d, 1);
      g.strokeRect(px - 4, py + top - 2, 9, -top + 4);
      g.fillStyle(0xffe14d, 1);
      g.fillTriangle(px - 2, py + top - 6, px + 3, py + top - 6, px + 0.5, py + top - 3);
    }
  }

  private drawMachine(g: Phaser.GameObjects.Graphics, h: Human, px: number, py: number, color: number, t: number, moving: boolean) {
    const f = h.tx >= h.x ? 1 : -1;
    const R = (x: number, y: number, w: number, hh: number, c: number) => {
      g.fillStyle(c, 1);
      g.fillRect(px + (f > 0 ? x : -x - w), py + y, w, hh);
    };
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(px + 0.5, py, 12, 3);
    if (h.unit === 'tank') {
      R(-5, -3, 11, 3, 0x2a2a28); // tracks
      for (let k = 0; k < 5; k++) R(-4 + k * 2, -2, 1, 1, (Math.floor(t / 100) + k) % 2 && moving ? 0x5a5a52 : 0x3a3a36);
      R(-5, -6, 11, 3, 0x5a6a3a); // hull
      R(-2, -8, 6, 2, 0x4a5a2e); // turret
      R(4, -8, 6, 1, 0x3a4a24); // barrel
      R(-4, -6, 2, 1, color); // flag stripe
    } else {
      // Space-age battle mech.
      const step = moving && Math.floor(t / 140 + h.id) % 2 === 0;
      R(-2, -2, 1, 2 + (step ? 0 : -1), 0x6a7480);
      R(2, -2, 1, 2 + (step ? -1 : 0), 0x6a7480);
      R(-3, -8, 7, 6, 0xb8c4d0);
      R(-2, -10, 5, 2, 0x8a96a2);
      R(-1, -9, 3, 1, 0x8af0ff);
      R(4, -7, 4, 1, 0x4a5460);
      R(-3, -6, 7, 1, color);
    }
    if (h === sim.selectedHuman) {
      g.lineStyle(1, 0xffe14d, 1);
      g.strokeRect(px - 7, py - 12, 15, 14);
    }
  }

  private drawWeapon(g: Phaser.GameObjects.Graphics, px: number, bodyY: number, era: number, color: number) {
    const R = (x: number, y: number, w: number, h: number, c: number) => {
      g.fillStyle(c, 1);
      g.fillRect(px + x, bodyY + y, w, h);
    };
    switch (era) {
      case 0: // stone spear
        R(3, -5, 1, 8, 0x7a5230);
        R(3, -6, 1, 1, 0x9a9a9a);
        break;
      case 1: // bronze spear
        R(3, -5, 1, 8, 0x7a5230);
        R(3, -7, 1, 2, 0xd8a040);
        break;
      case 2: // iron sword + shield
        R(3, -3, 1, 5, 0xc8c8d0);
        R(2, 0, 3, 1, 0x6a4a2a);
        R(-4, 0, 2, 3, color);
        break;
      case 3: // bow + shield
        R(3, -3, 1, 6, 0x7a5230);
        R(4, -4, 1, 1, 0x7a5230);
        R(4, 3, 1, 1, 0x7a5230);
        R(-4, -1, 2, 4, color);
        break;
      default: // rifle
        R(2, 0, 4, 1, 0x2a2a2a);
        R(5, -1, 1, 1, 0x2a2a2a);
        break;
    }
  }

  private drawLights() {
    const w = sim.world;
    const g = this.glow;
    g.clear();
    const dark = Math.max(0, Math.min(1, 1 - w.daylight() * 1.8));
    const t = this.time.now;

    for (const i of this.fires) {
      const x = (i % W) * CELL + 4;
      const y = Math.floor(i / W) * CELL + 4;
      if (!this.inView(x, y)) continue;
      g.fillStyle(0xff7a20, 0.08 + 0.18 * dark);
      g.fillCircle(x, y, 10 + Math.sin(t / 90 + i) * 2);
    }
    if (dark < 0.05) return;

    for (const v of sim.villages) {
      if (!this.inView(v.cx * CELL, v.cy * CELL, v.radius * CELL)) continue;
      if (v.alive) {
        g.fillStyle(0xff9a40, 0.22 * dark);
        g.fillCircle(v.cx * CELL + 4, v.cy * CELL + 4, 18 + Math.sin(t / 120 + v.id) * 2);
      }
      if (v.era >= 4) {
        // City glow.
        g.fillStyle(0xfff0c0, 0.06 * dark);
        g.fillCircle(v.cx * CELL + 4, v.cy * CELL + 4, v.radius * CELL * 0.8);
      }
    }
  }

  private drawSky(dt: number) {
    const w = sim.world;
    const day = w.daylight();
    this.nightShade.setFillStyle(0x0b1035, Math.max(0, 0.55 - day * 1.0));
    this.cloudShade.setFillStyle(0x2a2e38, 0);

    const g = this.fx;
    g.clear();
    const cam = this.cameras.main;
    const view = cam.worldView;
    const px = 1 / cam.zoom; // one screen pixel in world units
    const fall = sim.paused ? 0 : dt * Math.max(1, sim.speed * 0.6);

    // Cloud cover and heat haze: each weather system is a drifting clump of soft cloud.
    for (const sy of w.systems) {
      const a = CLOUD[sy.kind];
      const k = Math.max(0, Math.min(1, sy.age / 12, sy.life / 8));
      const cx = sy.x * CELL;
      const cy = sy.y * CELL;
      const R = sy.r * CELL;
      if (!a || k <= 0 || cx + R < view.x || cx - R > view.right || cy + R < view.y || cy - R > view.bottom) continue;
      const puffs = Math.min(14, 5 + Math.floor(sy.r / 12));
      for (let p = 0; p < puffs; p++) {
        const ang = sy.seed + p * 2.399;
        const dist = (p === 0 ? 0 : 0.25 + ((p * 37 + sy.seed) % 50) / 100) * R * (0.4 + 0.6 * k);
        const ox = Math.cos(ang) * dist + Math.sin(this.time.now / 7000 + p) * R * 0.04;
        const oy = Math.sin(ang) * dist * 0.8 + Math.cos(this.time.now / 9000 + p) * R * 0.04;
        const core = sy.kind === 'storm' && dist < R * 0.4;
        g.fillStyle(sy.kind === 'drought' ? 0xff7a30 : core ? 0x15171d : sy.kind === 'snow' ? 0xdfe6f2 : 0x2a2e38, a * 0.8 * k * (core ? 1.3 : 1));
        g.fillCircle(cx + ox, cy + oy, R * (0.32 + ((p * 13) % 5) * 0.04) * (0.5 + 0.5 * k));
      }
    }
    // What the view is under, for the ambience (sampled on a coarse grid).
    this.vis = { rain: 0, storm: 0, snow: 0, regions: 0 };
    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) {
        const wr = w.weatherXY((view.x + ((sx + 0.5) / 8) * view.width) / CELL, (view.y + ((sy + 0.5) / 8) * view.height) / CELL);
        this.vis.regions++;
        if (wr === 'rain') this.vis.rain++;
        else if (wr === 'storm') this.vis.storm++;
        else if (wr === 'snow') this.vis.snow++;
      }
    }

    // Rain and snow fall only where it is raining or snowing.
    const weatherAtPx = (x: number, y: number) => w.weatherXY(x / CELL, y / CELL);
    g.lineStyle(1.5 * px, 0xaecbff, 0.55);
    for (let i = 0; i < (settings.particles ? this.drops.length : 0); i++) {
      const d = this.drops[i];
      const x = view.x + d.x * view.width;
      const y = view.y + d.y * view.height;
      const wr = weatherAtPx(x, y);
      if (wr === 'snow') {
        d.y += fall * 0.12 * d.speed;
        d.x += Math.sin(d.phase + d.y * 12) * fall * 0.02;
        const sz = (d.speed > 1.1 ? 4 : 3) * px;
        g.fillStyle(0xffffff, 0.95);
        g.fillRect(x, y, sz, sz);
      } else if (wr === 'rain' || (wr === 'storm' && i < this.drops.length)) {
        if (wr === 'rain' && i % 2) continue;
        d.y += fall * 0.9 * d.speed;
        d.x += fall * 0.15;
        const len = (wr === 'storm' ? 18 : 12) * px;
        g.lineBetween(x, y, x - len * 0.3, y - len);
      } else d.y += fall * 0.5;
      if (d.y > 1) d.y -= 1;
      d.x = ((d.x % 1) + 1) % 1;
    }

    // Rocket launches from spaceports.
    if (!sim.paused) {
      for (const [x, y] of this.buildings.pads) if (Math.random() < dt * sim.speed * 0.04) this.launches.push({ x, y, t: 0 });
      for (const l of this.launches) l.t += dt;
      this.launches = this.launches.filter((l) => l.t < 5);
    }
    for (const l of this.launches) {
      const ry = l.y - 30 - l.t * l.t * 30;
      if (!this.inView(l.x, ry, 80)) continue;
      for (let k = 0; k < 8; k++) {
        const ph = k / 8;
        g.fillStyle(0xd8d8d8, 0.35 * (1 - ph));
        g.fillCircle(l.x + Math.sin(k * 1.7) * 2 * ph * 6, ry + 8 + ph * (l.y - ry), 2 + ph * 5);
      }
      g.fillStyle(0xffd27a, 1);
      g.fillRect(l.x - 1, ry + 5, 3, 3 + (Math.floor(this.time.now / 60) % 2));
      g.fillStyle(0xf2f2f4, 1);
      g.fillRect(l.x - 1, ry - 4, 4, 9);
      g.fillRect(l.x, ry - 6, 2, 2);
    }

    // Chimney and factory smoke.
    const tt = this.time.now;
    for (const [sx, sy] of this.buildings.smoke) {
      if (!this.inView(sx, sy, 40)) continue;
      for (let k = 0; k < 3; k++) {
        const ph = (tt / 1600 + k / 3 + (sx * 0.013) % 1) % 1;
        g.fillStyle(0xc8c8c8, 0.45 * (1 - ph));
        g.fillCircle(sx + ph * 5, sy - ph * 14, 1 + ph * 3);
      }
    }

    // Battle effects: musket/rifle tracers and melee sparks.
    for (const s of sim.shots) {
      g.lineStyle(Math.max(0.6, px), 0xfff2a0, Math.min(1, s.t * 8));
      g.lineBetween(s.x1 * CELL, s.y1 * CELL - 4, s.x2 * CELL, s.y2 * CELL - 4);
    }
    for (const c of sim.clashes) {
      const x = c.x * CELL;
      const y = c.y * CELL - 4;
      g.fillStyle(0xffffff, Math.min(1, c.t * 5));
      g.fillRect(x - 2, y, 5, 1);
      g.fillRect(x, y - 2, 1, 5);
    }

    let flash = 0;
    for (const s of sim.strikes) {
      flash = Math.max(flash, s.t * 0.6);
      const tx = s.x * CELL + 4;
      const ty = s.y * CELL + 4;
      const spread = 120 * px;
      g.lineStyle(3 * px, 0xffffff, Math.min(1, s.t * 3));
      let x = tx + (Math.random() - 0.5) * spread;
      let y = view.y;
      const steps = 8;
      for (let k = 1; k <= steps; k++) {
        const nx = k === steps ? tx : tx + (Math.random() - 0.5) * spread * (1 - k / steps);
        const ny = y + (ty - view.y) / steps;
        g.lineBetween(x, y, nx, ny);
        x = nx;
        y = ny;
      }
    }

    for (const im of sim.impacts) {
      const x = im.x * CELL;
      const y = im.y * CELL;
      if (im.kind === 'meteor') {
        if (im.t > 0.6) {
          const k = (im.t - 0.6) / 0.6; // 1 → 0 as it falls
          const mx = x + k * 300;
          const my = y - k * 400;
          g.lineStyle(6, 0xffa040, 0.8);
          g.lineBetween(mx, my, mx + 60, my - 80);
          g.fillStyle(0xfff0c0, 1);
          g.fillCircle(mx, my, 6);
        } else {
          flash = Math.max(flash, im.t);
          g.lineStyle(4, 0xff8030, im.t * 1.6);
          g.strokeCircle(x, y, (0.6 - im.t) * 220 + im.r * CELL);
        }
      } else if (im.kind === 'bomb') {
        flash = Math.max(flash, im.t * 0.15);
        g.fillStyle(0xffa040, im.t);
        g.fillCircle(x, y, (0.8 - im.t) * 30 + 6);
        g.fillStyle(0x4a4040, im.t * 0.7);
        g.fillCircle(x + 4, y - (0.8 - im.t) * 30, 8 + (0.8 - im.t) * 16);
      } else if (im.kind === 'nuke') {
        // Fireball, shockwave, then a rising mushroom cloud.
        const k = 1 - im.t / 6; // 0 → 1 over the effect
        const R = im.r * CELL;
        flash = Math.max(flash, Math.max(0, 1 - k * 4));
        g.lineStyle(6, 0xffffff, Math.max(0, 0.8 - k * 1.5));
        g.strokeCircle(x, y, R * (0.3 + k * 2.5));
        g.fillStyle(0xffd27a, Math.max(0, 0.9 - k));
        g.fillCircle(x, y, R * (0.4 + k * 0.5));
        const top = y - R * (0.5 + k * 2.2);
        g.fillStyle(0x8a6a5a, Math.max(0, 0.85 - k * 0.6));
        g.fillRect(x - R * 0.12, top, R * 0.24, y - top);
        g.fillStyle(0xc8805a, Math.max(0, 0.9 - k * 0.6));
        g.fillEllipse(x, top, R * (0.9 + k * 0.8), R * (0.5 + k * 0.3));
        g.fillStyle(0xffb070, Math.max(0, 0.6 - k * 0.5));
        g.fillEllipse(x, top + R * 0.12, R * (0.6 + k * 0.5), R * 0.25);
      } else if (im.kind === 'quake') {
        for (let k = 0; k < 3; k++) {
          const p = (1 - im.t / 0.8 + k * 0.25) % 1;
          g.lineStyle(3, 0x8a6a4a, 0.6 * (1 - p));
          g.strokeCircle(x, y, p * im.r * CELL * 2);
        }
      } else {
        g.fillStyle(0x5a5050, im.t);
        g.fillCircle(x, y - (0.8 - im.t) * 80, 20 + (0.8 - im.t) * 40);
      }
    }
    this.flash.setFillStyle(0xffffff, Math.min(0.8, flash));
  }

  private drawLabels(dt: number) {
    const zoom = this.cameras.main.zoom;
    for (const [id, label] of this.labels) label.setScale((sim.villages[id]?.isCapital ? 1 : 0.8) / zoom);
    this.labelAcc += dt;
    if (this.labelAcc < 0.3) return;
    this.labelAcc = 0;
    const praying = new Set(sim.wishes.map((w) => w.village));
    // Declutter: biggest nations claim label space first; overlapping smaller labels are hidden.
    const placed: [number, number, number, number][] = [];
    // Capitals first (they carry the nation's name), then the larger cities.
    const order = [...sim.villages].sort((a, b) => Number(b.isCapital) - Number(a.isCapital) || b.pop - a.pop);
    const visible = new Set<number>();
    for (const v of order) {
      if (!v.alive) continue;
      const w = (v.name.length + 10) * 4.5 / zoom;
      const h = 14 / zoom;
      const x = v.cx * CELL;
      const y = v.cy * CELL;
      if (placed.some(([px, py, pw, ph]) => Math.abs(px - x) < (pw + w) / 2 && Math.abs(py - y) < (ph + h) / 2)) continue;
      placed.push([x, y, w, h]);
      visible.add(v.id);
    }
    for (const v of sim.villages) {
      let label = this.labels.get(v.id);
      if (!label) {
        label = this.add
          .text(0, 0, '', {
            fontFamily: 'VT323, monospace',
            fontSize: '17px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
          })
          .setOrigin(0.5, 1)
          .setResolution(2)
          .setDepth(40);
        this.labels.set(v.id, label);
      }
      label.setVisible((settings.labels && visible.has(v.id)) || v === sim.selectedVillage);
      if (!v.alive) continue;
      const flags = `${v.enemies.size ? ' ⚔️' : ''}${praying.has(v.id) ? ' 🙏' : ''}${v.religion === 'god' ? ' ✨' : ''}`;
      if (v.isCapital) {
        const total = sim.citiesOf(v).reduce((n, c) => n + c.people, 0);
        const many = sim.citiesOf(v).length > 1;
        label.setText(`${many ? '👑 ' : ''}${ERAS[v.era].icon} ${v.name}${many ? ` [${abbr(v.base)}]` : ''} · ${many ? `${formatPop(v.people)} (cả nước ${formatPop(total)})` : formatPop(total)}${flags}`);
      } else label.setText(`[${abbr(v.capital.base)}] ${v.base} · ${formatPop(v.people)}${v.enemies.size ? ' ⚔️' : ''}`);
      label.setColor('#' + v.color.toString(16).padStart(6, '0'));
      label.setPosition(v.cx * CELL + 4, v.cy * CELL + 8 - [18, 22, 30, 36, 36, 66, 82][v.era]);
    }
    for (const [id, label] of this.labels) if (!sim.villages[id]) label.setVisible(false);
  }

  private drawCursor(x: number, y: number) {
    const g = this.cursor;
    g.clear();
    const zoom = this.cameras.main.zoom;
    // The other god's hand.
    const pc = session?.together ? session.peerCursor : null;
    if (pc) {
      const color = sim.me === 0 ? 0xc08aff : 0xffe14d;
      const px = pc.x * CELL;
      const py = pc.y * CELL;
      g.lineStyle(2 / zoom, color, 0.9);
      g.strokeCircle(px, py, 10 / zoom + 6);
      g.fillStyle(color, 1);
      g.fillTriangle(px, py, px + 12 / zoom, py + 4 / zoom, px + 4 / zoom, py + 12 / zoom);
      if (this.peerLabel) {
        this.peerLabel.setVisible(true).setPosition(px + 14 / zoom, py + 10 / zoom).setScale(1 / zoom).setText(session!.peerName || 'Vị thần kia').setColor(sim.me === 0 ? '#c08aff' : '#ffe14d');
      }
    } else this.peerLabel?.setVisible(false);
    g.lineStyle(1.5 / zoom, 0xffffff, 0.8);
    if (BRUSH_TOOLS.has(ui.tool)) g.strokeCircle(x, y, ui.brush * CELL);
    else if (ui.tool === 'weather') {
      g.lineStyle(2 / zoom, 0x8ac8ff, 0.9);
      g.strokeCircle(x, y, ui.brush * 8 * CELL);
    }
    else if (ui.tool === 'quake') g.strokeCircle(x, y, (ui.brush * 2 + 4) * CELL);
    else if (ui.tool === 'meteor') g.strokeCircle(x, y, Math.max(3, ui.brush + 2) * CELL);
    else if (CLICK_TOOLS.has(ui.tool)) {
      const s = 8 / zoom + 4;
      g.lineBetween(x - s, y, x + s, y);
      g.lineBetween(x, y - s, x, y + s);
    }
  }
}
