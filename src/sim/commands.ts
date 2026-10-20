import type { Weather } from '../world/constants';

/**
 * Everything a god can do to the world, as plain data. Commands are scheduled for a simulation
 * step and applied identically on every machine — so in multiplayer only commands travel.
 */
export type Command = { god: number } & (
  | { t: 'raise'; x: number; y: number; r: number; a: number }
  | { t: 'smooth'; x: number; y: number; r: number; k: number }
  | { t: 'water' | 'forest' | 'fire'; x: number; y: number; r: number }
  | { t: 'weather'; x: number; y: number; r: number; w: Weather }
  | { t: 'weatherAll'; w: Weather }
  | { t: 'autoWeather'; on: boolean }
  | { t: 'volcano'; x: number; y: number }
  | { t: 'quake' | 'meteor'; x: number; y: number; r: number }
  | { t: 'human'; x: number; y: number }
  | { t: 'animal'; kind: 'deer' | 'wolf'; x: number; y: number }
  | { t: 'war'; a: number; b: number }
  | { t: 'peace'; v: number }
  | { t: 'wish'; id: number; yes: boolean }
  | { t: 'godName'; name: string }
);

/** Commands without the god field, as issued by the UI (the issuing player's god is added). */
export type Order = Command extends infer C ? (C extends { god: number } ? Omit<C, 'god'> : never) : never;
