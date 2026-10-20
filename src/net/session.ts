/**
 * Two gods, one world. Both machines run the same deterministic simulation; only commands travel.
 *
 * Protocol ("commitment horizon"):
 *  - A command issued locally is scheduled a short way ahead (≈0.25 s of real time worth of steps).
 *  - Every flush, a peer sends `adv { upTo, cmds }`: "here are my commands, and I promise no more
 *    for any step ≤ upTo". A machine may simulate step N only once the other god has committed N.
 *  - Every HASH_EVERY steps both send a checksum; on mismatch the host sends a snapshot and BOTH
 *    load it (so quantisation in the snapshot can't cause a difference).
 *  - Joining works the same way: the host snapshots its world and both load it.
 */
import { sim } from '../core';
import type { Command } from '../sim/commands';
import { packWorld, unpackWorld } from '../save';
import { downloadSnapshot, uploadSnapshot } from './supabase';
import { PeerTransport, SupabaseTransport, type Transport } from './transport';
import { online } from './supabase';

type Msg =
  | { k: 'hello'; id: string; name: string }
  | { k: 'sync'; id: string; to: string; step: number; blob?: Uint8Array; path?: string; names: string[] }
  | { k: 'adv'; id: string; upTo: number; cmds: [number, Command][] }
  | { k: 'hash'; id: string; step: number; sum: number }
  | { k: 'cursor'; id: string; x: number; y: number; tool: string }
  | { k: 'speed'; id: string; speed: number; paused: boolean }
  | { k: 'chat'; id: string; text: string }
  | { k: 'bye'; id: string };

const HASH_EVERY = 100;
const FLUSH_MS = 50;
const TIMEOUT_MS = 10000;

export type SessionState = 'connecting' | 'waiting' | 'syncing' | 'playing' | 'alone' | 'closed';

export interface ChatLine {
  god: number;
  text: string;
}

export class Session {
  readonly id = Math.random().toString(36).slice(2, 10);
  readonly room: string;
  readonly role: 'host' | 'guest';
  state: SessionState = 'connecting';
  peerName = '';
  peerCursor: { x: number; y: number; tool: string } | null = null;
  chat: ChatLine[] = [];
  /** Diagnostics: matching checksums seen, and resyncs needed. */
  stats = { matches: 0, resyncs: 0 };
  onChange: (() => void) | null = null;
  error = '';

  private t: Transport;
  private peerId = '';
  private myHorizon = -1;
  private peerHorizon = -1;
  private outbox: [number, Command][] = [];
  private myHashes = new Map<number, number>();
  private peerHashes = new Map<number, number>();
  private lastHeard = 0;
  private timer = 0;
  private cursorAt = 0;
  private sentAt = 0;
  private helloAt = 0;
  private name: string;

  constructor(room: string, role: 'host' | 'guest', name: string, internet: boolean) {
    this.room = room;
    this.role = role;
    this.name = name;
    this.t = internet && online ? new SupabaseTransport(room) : new PeerTransport(room, role);
    this.t.onMessage((m) => void this.receive(m as Msg));
    this.t.ready.then(
      () => {
        this.state = role === 'host' ? 'waiting' : 'connecting';
        if (role === 'guest') this.send({ k: 'hello', id: this.id, name });
        this.changed();
      },
      (err: Error) => {
        this.error = err.message;
        this.state = 'closed';
        this.changed();
      },
    );
    this.timer = window.setInterval(() => this.flush(), FLUSH_MS);
    sim.me = role === 'host' ? 0 : 1;
    sim.godNames[sim.me] = name;
  }

  get together() {
    return this.state === 'playing';
  }

  private send(m: Msg) {
    this.t.send(m);
  }
  private changed() {
    this.onChange?.();
  }

  /** How many steps ahead a new command is scheduled: about a quarter second of real time. */
  private get delay() {
    return Math.max(3, Math.ceil(0.25 * 10 * Math.max(1, sim.speed)));
  }

  // ---------- hooks into the simulation ----------

  private gate = (step: number) => {
    if (!this.together) return this.state !== 'syncing';
    if (step % HASH_EVERY === 0 && !this.myHashes.has(step)) {
      const sum = sim.checksum();
      this.myHashes.set(step, sum);
      this.send({ k: 'hash', id: this.id, step, sum });
      this.compare(step);
    }
    return this.peerHorizon >= step;
  };

  private sender = (cmd: Command) => {
    if (!this.together) {
      sim.schedule(sim.stepNo, [cmd]);
      return;
    }
    const at = Math.max(sim.stepNo + this.delay, this.myHorizon + 1);
    sim.schedule(at, [cmd]);
    this.outbox.push([at, cmd]);
    this.flush();
  };

  private flush() {
    const now = performance.now();
    // Until the host answers, keep knocking (the host may have subscribed after our first hello).
    if (this.role === 'guest' && this.state === 'connecting' && now - this.helloAt > 1000) {
      this.helloAt = now;
      this.send({ k: 'hello', id: this.id, name: this.name });
    }
    if (this.together) {
      const upTo = Math.max(this.myHorizon, sim.stepNo + this.delay - 1);
      // Also a keep-alive while paused, so silence really means the other god is gone.
      if (upTo > this.myHorizon || this.outbox.length || now - this.sentAt > 1000) {
        this.myHorizon = upTo;
        this.sentAt = now;
        this.send({ k: 'adv', id: this.id, upTo, cmds: this.outbox.splice(0) });
      }
      if (now - this.lastHeard > TIMEOUT_MS) this.peerLost();
    }
  }

  /** Share where this god is looking/pointing (shown to the other god). */
  cursor(x: number, y: number, tool: string) {
    const now = performance.now();
    if (!this.together || now - this.cursorAt < 120) return;
    this.cursorAt = now;
    this.send({ k: 'cursor', id: this.id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, tool });
  }

  setSpeed(speed: number, paused: boolean) {
    sim.speed = speed;
    sim.paused = paused;
    if (this.together) this.send({ k: 'speed', id: this.id, speed, paused });
  }

  say(text: string) {
    if (!text.trim()) return;
    this.chat.push({ god: sim.me, text });
    this.send({ k: 'chat', id: this.id, text });
    this.changed();
  }

  // ---------- messages ----------

  private async receive(m: Msg) {
    if (m.id === this.id) return;
    if (this.peerId && m.id !== this.peerId && m.k !== 'hello') return;
    this.lastHeard = performance.now();
    switch (m.k) {
      case 'hello':
        if (this.role !== 'host' || (this.peerId && this.peerId !== m.id)) return;
        this.peerId = m.id;
        this.peerName = m.name;
        await this.hostSync();
        return;
      case 'sync':
        if (m.to !== this.id) return;
        this.peerId = m.id;
        this.state = 'syncing';
        this.changed();
        await this.load(m.step, m.blob ? new Uint8Array(m.blob as unknown as ArrayBuffer) : await downloadSnapshot(m.path!), m.names);
        return;
      case 'adv':
        for (const [at, cmd] of m.cmds) sim.schedule(at, [cmd]);
        this.peerHorizon = Math.max(this.peerHorizon, m.upTo);
        return;
      case 'hash':
        this.peerHashes.set(m.step, m.sum);
        this.compare(m.step);
        return;
      case 'cursor':
        this.peerCursor = { x: m.x, y: m.y, tool: m.tool };
        return;
      case 'speed':
        sim.speed = m.speed;
        sim.paused = m.paused;
        this.changed();
        return;
      case 'chat':
        this.chat.push({ god: sim.me === 0 ? 1 : 0, text: m.text });
        sim.toasts.push({ icon: '💬', title: this.peerName || 'Vị thần kia', text: m.text });
        this.changed();
        return;
      case 'bye':
        this.peerLost();
        return;
    }
  }

  private compare(step: number) {
    const a = this.myHashes.get(step);
    const b = this.peerHashes.get(step);
    if (a === undefined || b === undefined) return;
    this.myHashes.delete(step);
    this.peerHashes.delete(step);
    if (a === b) this.stats.matches++;
    else this.stats.resyncs++;
    if (a !== b && this.role === 'host') {
      sim.toasts.push({ icon: '🔄', title: 'Đồng bộ lại', text: 'Hai thế giới lệch nhau, đang đồng bộ lại...' });
      void this.hostSync();
    }
  }

  /** Host: snapshot the world, hand it to the guest, and both continue from it. */
  private async hostSync() {
    this.state = 'syncing';
    sim.gods = 2;
    sim.godNames[1] = this.peerName || sim.godNames[1];
    this.changed();
    const step = sim.stepNo;
    const blob = await packWorld();
    const names = [...sim.godNames];
    if (this.t.inlineBlobs) this.send({ k: 'sync', id: this.id, to: this.peerId, step, blob, names });
    else this.send({ k: 'sync', id: this.id, to: this.peerId, step, path: await uploadSnapshot(this.room, step, blob), names });
    await this.load(step, blob, names);
  }

  private async load(step: number, blob: Uint8Array, names: string[]) {
    await unpackWorld(blob);
    sim.godNames = [...names];
    sim.gods = 2;
    sim.stepNo = step;
    this.myHorizon = step - 1;
    this.peerHorizon = step - 1;
    this.outbox = [];
    this.myHashes.clear();
    this.peerHashes.clear();
    this.lastHeard = performance.now();
    this.state = 'playing';
    sim.strictGods = true;
    sim.gate = this.gate;
    sim.sender = this.sender;
    this.flush();
    this.changed();
    sim.toasts.push({ icon: '👥', title: 'Đã kết nối', text: `${names[0]} và ${names[1]} cùng cai quản thế giới.` });
  }

  private peerLost() {
    if (this.state !== 'playing') return;
    this.state = 'alone';
    sim.strictGods = false;
    this.peerCursor = null;
    sim.gate = null;
    sim.sender = null;
    sim.toasts.push({ icon: '👋', title: 'Vị thần kia đã rời đi', text: 'Bạn tiếp tục cai quản thế giới một mình.' });
    this.changed();
  }

  close() {
    this.send({ k: 'bye', id: this.id });
    window.clearInterval(this.timer);
    this.t.close();
    sim.strictGods = false;
    sim.gate = null;
    sim.sender = null;
    this.state = 'closed';
    this.changed();
  }
}

export let session: Session | null = null;

export function startSession(room: string, role: 'host' | 'guest', name: string, internet: boolean) {
  session?.close();
  session = new Session(room, role, name, internet);
  return session;
}

export function endSession() {
  session?.close();
  session = null;
}

export function newRoomCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}
