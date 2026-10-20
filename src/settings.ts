/** Player preferences, remembered in this browser. */
export interface Settings {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
  /** Rain and snow particles. */
  particles: boolean;
  /** Nation name labels on the map. */
  labels: boolean;
  /** Default speed when starting a world. */
  speed: number;
}

const KEY = 'saintmia:settings';
const DEFAULTS: Settings = { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.7, muted: false, particles: true, labels: true, speed: 1 };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* private browsing: keep for this session only */
  }
}
