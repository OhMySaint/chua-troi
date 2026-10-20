/**
 * Save games: a world is packed into one gzip'd binary blob (a JSON header plus the raw typed
 * arrays of the map), kept in IndexedDB slots or exported as a `.chuatroi` file.
 */
import { sim } from './core';
import { ERAS, formatPop } from './sim/eras';

export interface SaveMeta {
  slot: string;
  name: string;
  year: number;
  era: string;
  nations: number;
  people: string;
  savedAt: number;
  size: number;
}

const MAGIC = 'CTW1';
const DB = 'chuatroi';
const STORE = 'saves';

type Typed = Float32Array | Uint8Array | Uint16Array | Int16Array;
const TYPED: Record<string, new (b: ArrayBuffer) => Typed> = { f32: Float32Array, u8: Uint8Array, u16: Uint16Array, i16: Int16Array };
const tag = (a: Typed) => (a instanceof Float32Array ? 'f32' : a instanceof Int16Array ? 'i16' : a instanceof Uint16Array ? 'u16' : 'u8');

/** Float layers are stored quantised (precision far below what's visible) so saves compress well. */
const QUANT: Record<string, [string, number]> = {
  height: ['u16', 65535],
  snow: ['u8', 255],
  jitter: ['u8', 255],
  latChill: ['u8', 8],
  timer: ['i16', 100],
};
function quantise(key: string, a: Typed): Typed {
  const q = QUANT[key];
  if (!q || !(a instanceof Float32Array)) return a;
  const out = new TYPED[q[0]](new ArrayBuffer(a.length * (q[0] === 'u8' ? 1 : 2)));
  const max = q[0] === 'u8' ? 255 : q[0] === 'u16' ? 65535 : 32767;
  const min = q[0] === 'i16' ? -32768 : 0;
  for (let i = 0; i < a.length; i++) out[i] = Math.max(min, Math.min(max, Math.round(a[i] * q[1])));
  return out;
}
function dequantise(key: string, a: Typed): Typed {
  const q = QUANT[key];
  if (!q || a instanceof Float32Array) return a;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] / q[1];
  return out;
}

// Maps and Sets survive JSON as tagged arrays.
function replacer(this: unknown, key: string, value: unknown) {
  if (key === 'foe' || key === 'prey') return undefined;
  if (value === Infinity) return '__inf';
  if (value === -Infinity) return '__-inf';
  if (value instanceof Map) return { __m: [...value] };
  if (value instanceof Set) return { __s: [...value] };
  if (key === 'culture' && value && typeof value === 'object' && 'id' in value) return (value as { id: string }).id;
  return value;
}
function reviver(_key: string, value: unknown) {
  if (value === '__inf') return Infinity;
  if (value === '__-inf') return -Infinity;
  if (value && typeof value === 'object') {
    if ('__m' in value) return new Map((value as { __m: [unknown, unknown][] }).__m);
    if ('__s' in value) return new Set((value as { __s: unknown[] }).__s);
  }
  return value;
}

async function gzip(data: Uint8Array, mode: 'compress' | 'decompress') {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(mode === 'compress' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function meta(slot: string, size: number): SaveMeta {
  const alive = sim.villages.filter((v) => v.alive);
  const top = alive.reduce((m, v) => Math.max(m, v.era), 0);
  const biggest = [...alive].sort((a, b) => b.people - a.people)[0];
  return {
    slot,
    name: biggest ? `Thời của ${biggest.name}` : 'Thế giới hoang sơ',
    year: sim.year,
    era: `${ERAS[top].icon} ${ERAS[top].name}`,
    nations: alive.length,
    people: formatPop(alive.reduce((n, v) => n + v.people, 0)),
    savedAt: Date.now(),
    size,
  };
}

/** Pack the current world into a compressed blob. */
export async function packWorld(): Promise<Uint8Array> {
  const snap = sim.snapshot();
  const arrays: Record<string, Typed> = {};
  for (const [k, a] of Object.entries(snap.arrays as Record<string, Typed>)) arrays[k] = quantise(k, a);
  const layout: { key: string; type: string; offset: number; length: number }[] = [];
  let offset = 0;
  for (const [key, a] of Object.entries(arrays)) {
    layout.push({ key, type: tag(a), offset, length: a.byteLength });
    offset += Math.ceil(a.byteLength / 4) * 4;
  }
  const header = new TextEncoder().encode(JSON.stringify({ ...snap, arrays: undefined, layout }, replacer));
  const headerPad = Math.ceil(header.byteLength / 4) * 4;
  const out = new Uint8Array(8 + headerPad + offset);
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(4, header.byteLength, true);
  out.set(header, 8);
  for (const l of layout) {
    const a = arrays[l.key];
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), 8 + headerPad + l.offset);
  }
  return gzip(out, 'compress');
}

/** Restore a world from a compressed blob. */
export async function unpackWorld(blob: Uint8Array) {
  const raw = await gzip(blob, 'decompress');
  if (new TextDecoder().decode(raw.slice(0, 4)) !== MAGIC) throw new Error('Không phải file thế giới hợp lệ');
  const headerLen = new DataView(raw.buffer).getUint32(4, true);
  const data = JSON.parse(new TextDecoder().decode(raw.slice(8, 8 + headerLen)), reviver);
  const base = 8 + Math.ceil(headerLen / 4) * 4;
  data.arrays = {};
  for (const l of data.layout as { key: string; type: string; offset: number; length: number }[]) {
    const bytes = raw.slice(base + l.offset, base + l.offset + l.length);
    data.arrays[l.key] = dequantise(l.key, new TYPED[l.type](bytes.buffer));
  }
  sim.restore(data);
}

// ---------- IndexedDB slots ----------

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTo(slot: string): Promise<SaveMeta> {
  const data = await packWorld();
  const m = meta(slot, data.byteLength);
  await tx('readwrite', (s) => s.put({ meta: m, data }, slot));
  return m;
}

export async function loadFrom(slot: string) {
  const rec = await tx<{ meta: SaveMeta; data: Uint8Array } | undefined>('readonly', (s) => s.get(slot));
  if (!rec) throw new Error('Ô lưu trống');
  await unpackWorld(rec.data);
}

export async function deleteSave(slot: string) {
  await tx('readwrite', (s) => s.delete(slot));
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx<{ meta: SaveMeta }[]>('readonly', (s) => s.getAll());
  return all.map((r) => r.meta);
}

export async function exportFile() {
  const data = await packWorld();
  const m = meta('file', data.byteLength);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }));
  a.download = `the-gioi-nam-${m.year}.chuatroi`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importFile(file: File) {
  await unpackWorld(new Uint8Array(await file.arrayBuffer()));
}
