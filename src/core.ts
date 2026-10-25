import { Sim } from './sim/Sim';

export type Tool =
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'water'
  | 'forest'
  | 'fire'
  | 'volcano'
  | 'quake'
  | 'meteor'
  | 'human'
  | 'deer'
  | 'wolf'
  | 'war'
  | 'peace'
  | 'inspect'
  | 'pan'
  | 'weather';

export const sim = new Sim();
export const ui = {
  tool: 'raise' as Tool,
  brush: 3,
  /** One-shot camera requests from the UI, consumed by the scene. */
  zoomCmd: null as 'in' | 'out' | 'fit' | null,
  focus: null as { x: number; y: number } | null,
  /** Weather buttons apply to the whole world, or arm a brush that paints regions. */
  weatherMode: 'region' as 'global' | 'region',
  weatherBrush: 'rain' as import('./world/constants').Weather,
  /** Title screen showing: the camera drifts over the world by itself. */
  attract: true,
  /** One-shot: the player just entered the game (camera flies to the people). */
  enter: false,
  /** Keep the camera on the people you guide. */
  follow: false,
  /** Cell the camera is centred on (for "weather here"). */
  view: { x: 0, y: 0 },
};
