import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** A message bus shared by the two gods in a room. */
export interface Transport {
  send(msg: unknown): void;
  onMessage(fn: (msg: unknown) => void): void;
  /** Whether large binary payloads (world snapshots) can be sent inline. */
  readonly inlineBlobs: boolean;
  ready: Promise<void>;
  close(): void;
}

/** Same-browser rooms over BroadcastChannel: two tabs on one machine (for testing, no account needed). */
export class LocalTransport implements Transport {
  readonly inlineBlobs = true;
  ready = Promise.resolve();
  private ch: BroadcastChannel;
  private fn: ((m: unknown) => void) | null = null;

  constructor(room: string) {
    this.ch = new BroadcastChannel(`chuatroi:${room}`);
    this.ch.onmessage = (e) => this.fn?.(e.data);
  }
  send(msg: unknown) {
    this.ch.postMessage(msg);
  }
  onMessage(fn: (m: unknown) => void) {
    this.fn = fn;
  }
  close() {
    this.ch.close();
  }
}

/** Internet rooms over a Supabase Realtime broadcast channel. */
export class SupabaseTransport implements Transport {
  readonly inlineBlobs = false;
  ready: Promise<void>;
  private ch: RealtimeChannel;
  private fn: ((m: unknown) => void) | null = null;

  constructor(room: string) {
    if (!supabase) throw new Error('Supabase is not configured');
    this.ch = supabase.channel(`room:${room}`, { config: { broadcast: { self: false, ack: false } } });
    this.ch.on('broadcast', { event: 'm' }, ({ payload }) => this.fn?.(payload));
    this.ready = new Promise((resolve, reject) => {
      this.ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Kênh realtime: ${status}`));
      });
    });
  }
  send(msg: unknown) {
    void this.ch.send({ type: 'broadcast', event: 'm', payload: msg });
  }
  onMessage(fn: (m: unknown) => void) {
    this.fn = fn;
  }
  close() {
    void supabase?.removeChannel(this.ch);
  }
}

/**
 * Internet rooms without any server of our own: a direct WebRTC link between the two browsers,
 * introduced by the free public PeerJS broker. The host's peer id is derived from the room code.
 */
export class PeerTransport implements Transport {
  readonly inlineBlobs = true;
  ready: Promise<void>;
  private peer: import('peerjs').Peer | null = null;
  private conn: import('peerjs').DataConnection | null = null;
  private fn: ((m: unknown) => void) | null = null;
  private queue: unknown[] = [];

  constructor(room: string, role: 'host' | 'guest') {
    const hostId = `chuatroi-${room.toLowerCase()}`;
    this.ready = import('peerjs').then(
      ({ Peer }) =>
        new Promise<void>((resolve, reject) => {
          const peer = role === 'host' ? new Peer(hostId) : new Peer();
          this.peer = peer;
          peer.on('error', (e) => reject(new Error(e.type === 'unavailable-id' ? 'Mã phòng này đang được dùng' : e.type === 'peer-unavailable' ? 'Không tìm thấy phòng — kiểm tra lại mã' : `Lỗi kết nối: ${e.type}`)));
          peer.on('open', () => {
            if (role === 'host') {
              // Wait for the guest to dial in.
              peer.on('connection', (c) => this.attach(c));
              resolve();
            } else {
              this.attach(peer.connect(hostId, { reliable: true, serialization: 'binary' }));
              this.onOpen = resolve;
            }
          });
        }),
    );
  }

  private onOpen: (() => void) | null = null;

  private attach(c: import('peerjs').DataConnection) {
    this.conn?.close();
    this.conn = c;
    c.on('open', () => {
      for (const m of this.queue.splice(0)) c.send(m);
      this.onOpen?.();
      this.onOpen = null;
    });
    c.on('data', (d) => this.fn?.(d));
  }

  send(msg: unknown) {
    if (this.conn?.open) this.conn.send(msg);
    else if (this.queue.length < 50) this.queue.push(msg);
  }
  onMessage(fn: (m: unknown) => void) {
    this.fn = fn;
  }
  close() {
    this.conn?.close();
    this.peer?.destroy();
  }
}
