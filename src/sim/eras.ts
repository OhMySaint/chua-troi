export interface Era {
  name: string;
  icon: string;
  /** Tech points needed to reach this era. */
  tech: number;
  /**
   * How fast knowledge accumulates in this era. History accelerates: the stone age crawls,
   * industry and modernity race.
   */
  pace: number;
  /** How many real people each person on the map stands for. */
  popScale: number;
  houseCap: number;
  houseWood: number;
  /** Farm and gathering yield multiplier. */
  yield: number;
  attack: number;
  armor: number;
  /** Attack range in cells (melee ≈ 1, bows/guns further). */
  range: number;
  /** Territory radius in cells. */
  radius: number;
  /** Multiplier on cold damage (better clothes, heating). */
  cold: number;
  life: number;
  weapon: string;
}

export const ERAS: Era[] = [
  { name: 'Thời đồ đá', icon: '🪨', tech: 0, pace: 0.25, popScale: 1, houseCap: 3, houseWood: 3, yield: 1, attack: 1, armor: 1, range: 1.1, radius: 8, cold: 1, life: 1, weapon: 'giáo đá' },
  { name: 'Thời đồ đồng', icon: '🏺', tech: 230, pace: 0.45, popScale: 5, houseCap: 4, houseWood: 3, yield: 1.3, attack: 1.6, armor: 1.2, range: 1.1, radius: 10, cold: 0.85, life: 1.05, weapon: 'giáo đồng' },
  { name: 'Thời đồ sắt', icon: '🗡️', tech: 460, pace: 0.6, popScale: 20, houseCap: 5, houseWood: 4, yield: 1.6, attack: 2.3, armor: 1.5, range: 1.2, radius: 12, cold: 0.7, life: 1.1, weapon: 'kiếm sắt' },
  { name: 'Trung cổ', icon: '🏰', tech: 780, pace: 0.8, popScale: 100, houseCap: 6, houseWood: 4, yield: 2, attack: 3, armor: 2, range: 3.5, radius: 14, cold: 0.55, life: 1.2, weapon: 'cung nỏ' },
  { name: 'Công nghiệp', icon: '🏭', tech: 1220, pace: 1.1, popScale: 1000, houseCap: 8, houseWood: 5, yield: 3, attack: 5, armor: 2.5, range: 5, radius: 16, cold: 0.35, life: 1.4, weapon: 'súng trường' },
  { name: 'Hiện đại', icon: '🏙️', tech: 1750, pace: 1.5, popScale: 10000, houseCap: 12, houseWood: 5, yield: 4, attack: 8, armor: 3.2, range: 7, radius: 18, cold: 0.2, life: 1.6, weapon: 'súng tự động' },
  { name: 'Kỷ nguyên vũ trụ', icon: '🚀', tech: 2600, pace: 2, popScale: 50000, houseCap: 16, houseWood: 6, yield: 6, attack: 12, armor: 4.5, range: 9, radius: 20, cold: 0.1, life: 2, weapon: 'súng laser' },
];

export const MAX_ERA = ERAS.length - 1;

/** "1.2 triệu", "35 nghìn", "840". */
export function formatPop(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} triệu`;
  if (n >= 1e4) return `${Math.round(n / 1e3)} nghìn`;
  return n.toLocaleString('vi-VN');
}
