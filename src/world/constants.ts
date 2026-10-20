export const W = 1280;
export const H = 800;
export const N = W * H;
/** World pixels per cell (sprites are authored for 8). */
export const CELL = 8;
/** Fixed simulation step, in game seconds (people & animals move every step). */
export const STEP = 0.1;
/** World/village ticks run every TICK_STEPS steps. */
export const TICK_STEPS = 2;
export const TICK = STEP * TICK_STEPS;
/** Game seconds per calendar year (also how people age). */
export const YEAR = 6;

export const BASE_SEA = 0.4;
export const SAND_BAND = 0.025;
export const GRASS_MAX = 0.66;
export const HILL_MAX = 0.78;
export const MOUNT_MAX = 0.88;

export const Cover = {
  NONE: 0,
  FOREST: 1,
  FIRE: 2,
  ASH: 3,
  HOUSE: 4,
  FARM: 5,
  LAVA: 6,
  BASALT: 7,
} as const;

/** Road surface per era tier. */
export const Road = { NONE: 0, DIRT: 1, STONE: 2, ASPHALT: 3 } as const;
export const roadTier = (era: number) => (era <= 1 ? Road.DIRT : era <= 3 ? Road.STONE : Road.ASPHALT);

export type Weather = 'sun' | 'rain' | 'storm' | 'snow' | 'drought';

/** Weather and temperature are tracked per region of RS × RS cells. */
export const RS = 64;
export const RW = Math.ceil(W / RS);
export const RH = Math.ceil(H / RS);
export const regionOf = (x: number, y: number) => (y >> 6) * RW + (x >> 6);

export const WEATHER_LABEL: Record<Weather, string> = {
  sun: '☀️ Nắng',
  rain: '🌧️ Mưa',
  storm: '⛈️ Bão',
  snow: '❄️ Tuyết',
  drought: '🔥 Hạn hán',
};

export const idx = (x: number, y: number) => y * W + x;
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
