/**
 * The simulation's single source of randomness. Seeded and shared by every system that changes
 * game state, so two machines fed the same seed and the same commands compute the same world —
 * the basis of lockstep multiplayer. (Purely visual effects may still use Math.random.)
 */
let state = 1;

export function seedRandom(seed: number) {
  state = seed >>> 0 || 1;
}

export function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomState() {
  return state;
}
