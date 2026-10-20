/**
 * "Sign in with Google" via Google Identity Services — runs entirely in the browser and needs only
 * a public OAuth Client ID (VITE_GOOGLE_CLIENT_ID). Used to name your god after your account.
 */
export interface Profile {
  name: string;
  picture: string;
  email: string;
}

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
const KEY = 'chuatroi:profile';

let profile: Profile | null = null;
try {
  profile = JSON.parse(localStorage.getItem(KEY) ?? 'null');
} catch {
  profile = null;
}
const listeners = new Set<(p: Profile | null) => void>();

export function googleProfile() {
  return profile;
}

export function onProfile(fn: (p: Profile | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setProfile(p: Profile | null) {
  profile = p;
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: stay signed in for this visit only */
  }
  for (const l of listeners) l(p);
}

export function googleSignOut() {
  setProfile(null);
}

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}

let loading: Promise<GoogleId> | null = null;
function load(): Promise<GoogleId> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      const id = (window as unknown as { google: { accounts: { id: GoogleId } } }).google.accounts.id;
      id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({ credential }) => {
          // The ID token's payload carries the account's public profile.
          const b64 = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const json = JSON.parse(decodeURIComponent(escape(atob(b64))));
          setProfile({ name: json.name ?? json.email, picture: json.picture ?? '', email: json.email ?? '' });
        },
      });
      resolve(id);
    };
    s.onerror = () => reject(new Error('Không tải được Google Sign-In'));
    document.head.append(s);
  });
  return loading;
}

/** Render Google's official sign-in button into `el`. */
export async function renderGoogleButton(el: HTMLElement) {
  if (!GOOGLE_CLIENT_ID) return;
  const id = await load();
  id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'vi' });
}
