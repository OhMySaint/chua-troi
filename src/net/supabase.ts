/**
 * Supabase: Google sign-in, the realtime channel two gods talk over, and storage for world
 * snapshots. Configure with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in `.env.local`;
 * without them the game falls back to local play (and same-browser test rooms).
 */
import { type SupabaseClient, type User, createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const online = supabase !== null;

export const SNAPSHOT_BUCKET = 'worlds';

let user: User | null = null;
const listeners = new Set<(u: User | null) => void>();

if (supabase) {
  supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
  supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
}

function setUser(u: User | null) {
  user = u;
  for (const l of listeners) l(u);
}

export function currentUser() {
  return user;
}

export function onUser(fn: (u: User | null) => void) {
  listeners.add(fn);
  fn(user);
  return () => listeners.delete(fn);
}

export function displayName(u: User | null) {
  const m = (u?.user_metadata ?? {}) as Record<string, string>;
  return m.full_name || m.name || u?.email?.split('@')[0] || 'Vị thần vô danh';
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Chưa cấu hình Supabase (xem SETUP-MULTIPLAYER.md)');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** Upload a world snapshot so the other god can download it (too big for a realtime message). */
export async function uploadSnapshot(room: string, step: number, data: Uint8Array) {
  if (!supabase) throw new Error('offline');
  const path = `${room}/${step}-${Date.now()}.chuatroi`;
  const { error } = await supabase.storage.from(SNAPSHOT_BUCKET).upload(path, new Blob([data as BlobPart]), {
    contentType: 'application/octet-stream',
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function downloadSnapshot(path: string) {
  if (!supabase) throw new Error('offline');
  const { data, error } = await supabase.storage.from(SNAPSHOT_BUCKET).download(path);
  if (error || !data) throw error ?? new Error('Không tải được thế giới');
  return new Uint8Array(await data.arrayBuffer());
}
