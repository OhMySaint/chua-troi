/** Kinds of soldier, by what each age can field. */
export type Unit = 'infantry' | 'archer' | 'cavalry' | 'gunner' | 'tank' | 'mech';

export interface UnitStats {
  name: string;
  speed: number;
  /** Damage taken is divided by this. */
  hp: number;
  atk: number;
  /** Attack range in cells; 0 = the era's firearm range. */
  range: number;
}

export const UNITS: Record<Unit, UnitStats> = {
  infantry: { name: 'Bộ binh', speed: 1, hp: 1, atk: 1, range: 1.1 },
  archer: { name: 'Cung thủ', speed: 1, hp: 0.9, atk: 0.8, range: 4 },
  cavalry: { name: 'Kỵ binh', speed: 1.9, hp: 1.3, atk: 1.3, range: 1.2 },
  gunner: { name: 'Lính súng', speed: 1.05, hp: 1, atk: 1, range: 0 },
  tank: { name: 'Xe tăng', speed: 1.5, hp: 3, atk: 2.5, range: 5 },
  mech: { name: 'Chiến giáp', speed: 1.6, hp: 2.5, atk: 2.2, range: 8 },
};

/** What a new recruit becomes, given the nation's age and people (steppe peoples ride). */
export function pickUnit(era: number, culture: string, r: number): Unit {
  const riders = culture === 'thao_nguyen';
  if (era <= 0) return 'infantry';
  if (era === 1) return riders && r < 0.4 ? 'cavalry' : 'infantry';
  if (era === 2) return r < (riders ? 0.6 : 0.25) ? 'cavalry' : r < 0.85 ? 'infantry' : 'archer';
  if (era === 3) return r < (riders ? 0.5 : 0.3) ? 'cavalry' : r < 0.65 ? 'archer' : 'infantry';
  if (era === 4) return r < 0.15 ? 'tank' : r < 0.25 ? 'cavalry' : 'gunner';
  if (era === 5) return r < 0.4 ? 'tank' : 'gunner';
  return r < 0.4 ? 'tank' : 'mech';
}

export interface Airstrike {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  start: number;
  end: number;
  nuke: boolean;
  /** Attacking city id. */
  from: number;
  color: number;
}
