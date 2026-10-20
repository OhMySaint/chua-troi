import { rand } from './rand';
import { Cover, GRASS_MAX, H, HILL_MAX, N, W } from '../world/constants';
import type { World } from '../world/World';

export interface Traits {
  farm: number;
  hunt: number;
  fish: number;
  tech: number;
  attack: number;
  defense: number;
  speed: number;
  /** Multiplier on cold damage: lower is hardier. */
  cold: number;
  /** How quickly they come to resent neighbours. */
  aggression: number;
}

export interface Culture {
  id: string;
  name: string;
  inspiration: string;
  homeland: string;
  names: string[];
  places: string[];
  /** Ruler title per era. */
  rulers: string[];
  /** State title per era. */
  states: string[];
  deity: string;
  belief: string;
  festival: string;
  customs: string[];
  craft: string;
  colors: number[];
  traits: Traits;
}

const T = (t: Partial<Traits>): Traits => ({
  farm: 1,
  hunt: 1,
  fish: 1,
  tech: 1,
  attack: 1,
  defense: 1,
  speed: 1,
  cold: 1,
  aggression: 1,
  ...t,
});

export const CULTURES: Culture[] = [
  {
    id: 'lua_nuoc',
    name: 'Văn minh Lúa nước',
    inspiration: 'lấy cảm hứng từ Văn Lang – Đại Việt và các nền văn minh lúa nước Đông Nam Á',
    homeland: 'đồng bằng ấm áp ven sông, đất phù sa màu mỡ',
    names: ['An', 'Bình', 'Lạc', 'Hùng', 'Mai', 'Lan', 'Thảo', 'Minh', 'Ngọc', 'Tâm', 'Dũng', 'Vân', 'Yến', 'Trung', 'Hiếu', 'Quang', 'Nhi', 'Khôi'],
    places: ['Văn Lang', 'Mê Linh', 'Cổ Loa', 'Phong Châu', 'Bạch Hạc', 'Âu Lạc', 'Hoa Lư', 'Thăng Long', 'Tây Đô', 'Phú Xuân'],
    rulers: ['Tù trưởng', 'Lạc hầu', 'Lạc vương', 'Hoàng đế', 'Tổng thống', 'Chủ tịch'],
    states: ['Bộ lạc', 'Liên minh bộ lạc', 'Nhà nước', 'Vương triều', 'Quốc gia', 'Cộng hòa'],
    deity: 'Thần Nông và Mẹ Lúa',
    belief: 'thờ cúng tổ tiên và tin mình là con Rồng cháu Tiên',
    festival: 'Lễ hội Xuống đồng',
    customs: ['đánh trống đồng mừng được mùa', 'nhuộm răng đen, ăn trầu', 'dựng nhà sàn tránh lũ'],
    craft: 'đúc trống đồng và trồng lúa nước',
    colors: [0xd65a5a, 0xe0c14a, 0xc0392b],
    traits: T({ farm: 1.35, fish: 1.2, defense: 1.25, aggression: 0.7 }),
  },
  {
    id: 'hoa_ha',
    name: 'Văn minh Hoàng Hà',
    inspiration: 'lấy cảm hứng từ Trung Hoa cổ đại bên dòng Hoàng Hà',
    homeland: 'đồng bằng ôn hòa bên dòng sông lớn',
    names: ['Wei', 'Lian', 'Ming', 'Jun', 'Mei', 'Xiu', 'Hao', 'Bao', 'Yun', 'Feng', 'Zhi', 'Ling', 'Shen', 'Rui'],
    places: ['Trường An', 'Lạc Dương', 'Hàm Dương', 'Khai Phong', 'Kim Lăng', 'Tô Châu', 'Hàng Châu', 'Bắc Bình'],
    rulers: ['Thủ lĩnh', 'Vương', 'Thiên tử', 'Hoàng đế', 'Đại tổng thống', 'Chủ tịch'],
    states: ['Thị tộc', 'Phương quốc', 'Vương quốc', 'Đế quốc', 'Dân quốc', 'Cộng hòa'],
    deity: 'Trời và linh hồn tổ tiên',
    belief: 'tin vào Thiên mệnh, trọng lễ nghĩa và học vấn',
    festival: 'Tết Nguyên Tiêu thả đèn lồng',
    customs: ['khắc chữ lên mai rùa để bói', 'đắp tường thành bằng đất nện', 'thi cử để chọn quan'],
    craft: 'dệt lụa và nung gốm sứ',
    colors: [0xe08a3a, 0xb8322e, 0xf0d060],
    traits: T({ tech: 1.3, farm: 1.15, defense: 1.15 }),
  },
  {
    id: 'thao_nguyen',
    name: 'Du mục Thảo nguyên',
    inspiration: 'lấy cảm hứng từ người Mông Cổ và các bộ tộc Turk vùng thảo nguyên Á–Âu',
    homeland: 'thảo nguyên mênh mông lộng gió, ít cây cối',
    names: ['Temür', 'Batu', 'Börte', 'Subedei', 'Khulan', 'Arslan', 'Oyun', 'Bayan', 'Altan', 'Sarnai', 'Jochi', 'Togrul'],
    places: ['Karakorum', 'Ordu Baliq', 'Khentii', 'Onon', 'Kherlen', 'Altai', 'Orkhon', 'Tuul'],
    rulers: ['Thủ lĩnh', 'Khan', 'Đại Khan', 'Khả Hãn', 'Tổng thống', 'Tổng thống'],
    states: ['Thị tộc', 'Liên minh bộ tộc', 'Hãn quốc', 'Đế quốc', 'Quốc gia', 'Cộng hòa'],
    deity: 'Tengri – Trời xanh vĩnh hằng',
    belief: 'thờ Trời xanh và Đất mẹ, coi trọng con ngựa và lòng trung thành',
    festival: 'Naadam – hội đua ngựa, đấu vật, bắn cung',
    customs: ['sống trong lều tròn ger', 'uống sữa ngựa lên men', 'truyền tin bằng kỵ sĩ phi ngựa'],
    craft: 'thuần ngựa và làm cung sừng',
    colors: [0x5a8ee0, 0x2e6bc4, 0x8fb8f0],
    traits: T({ speed: 1.25, attack: 1.3, hunt: 1.25, farm: 0.8, aggression: 1.5 }),
  },
  {
    id: 'bac_hai',
    name: 'Hải tộc phương Bắc',
    inspiration: 'lấy cảm hứng từ người Viking vùng Bắc Âu',
    homeland: 'bờ biển lạnh giá phương bắc, mùa đông dài',
    names: ['Ragnar', 'Astrid', 'Bjorn', 'Sigrid', 'Leif', 'Freya', 'Erik', 'Ingrid', 'Harald', 'Solveig', 'Ivar', 'Gudrun'],
    places: ['Kattegat', 'Uppsala', 'Hedeby', 'Trondheim', 'Birka', 'Jorvik', 'Ribe', 'Kaupang'],
    rulers: ['Thủ lĩnh', 'Jarl', 'Vua', 'Vua tối cao', 'Thủ tướng', 'Thủ tướng'],
    states: ['Gia tộc', 'Lãnh địa Jarl', 'Vương quốc', 'Đế quốc Biển Bắc', 'Vương quốc lập hiến', 'Liên bang'],
    deity: 'Odin, Thor và các thần xứ Asgard',
    belief: 'tin rằng chiến binh tử trận sẽ được lên Valhalla',
    festival: 'Yule – lễ đốt lửa giữa đêm đông',
    customs: ['kể saga bên bếp lửa', 'khắc chữ rune lên đá', 'tiễn thủ lĩnh về trời trên thuyền rực lửa'],
    craft: 'đóng thuyền dài và rèn rìu',
    colors: [0xeeeeee, 0x9aa8b8, 0x6b7f99],
    traits: T({ attack: 1.35, cold: 0.6, fish: 1.3, aggression: 1.6 }),
  },
  {
    id: 'hy_lap',
    name: 'Thành bang Biển ấm',
    inspiration: 'lấy cảm hứng từ các thành bang Hy Lạp cổ đại bên Địa Trung Hải',
    homeland: 'bờ biển ấm áp đầy nắng, vịnh kín gió',
    names: ['Nikos', 'Helena', 'Theo', 'Irene', 'Alexios', 'Daphne', 'Leon', 'Chloe', 'Damon', 'Thalia', 'Kyros', 'Zoe'],
    places: ['Athena', 'Sparta', 'Korinth', 'Delphi', 'Thebes', 'Rhodos', 'Miletos', 'Argos'],
    rulers: ['Tộc trưởng', 'Basileus', 'Vua', 'Hoàng đế', 'Thủ tướng', 'Tổng thống'],
    states: ['Thị tộc', 'Thành bang', 'Vương quốc', 'Đế quốc', 'Cộng hòa', 'Cộng hòa'],
    deity: 'Zeus và các vị thần trên đỉnh Olympus',
    belief: 'tin vào lời sấm truyền và coi trọng tranh luận triết học',
    festival: 'Thế vận hội Olympia',
    customs: ['tranh luận ở quảng trường agora', 'diễn bi kịch ở nhà hát ngoài trời', 'pha rượu nho với nước'],
    craft: 'buôn bán đường biển và vẽ gốm',
    colors: [0x4ac8c8, 0x2a9d9d, 0xf2f2e0],
    traits: T({ tech: 1.35, fish: 1.2, defense: 1.1, aggression: 0.9 }),
  },
  {
    id: 'rung_sau',
    name: 'Dân Rừng sâu',
    inspiration: 'lấy cảm hứng từ người Slav cổ giữa rừng Đông Âu',
    homeland: 'cánh rừng già bạt ngàn',
    names: ['Mila', 'Bogdan', 'Vesna', 'Ivan', 'Dobrava', 'Radomir', 'Lada', 'Yaroslav', 'Zora', 'Stanko', 'Olesya', 'Mstislav'],
    places: ['Novgorod', 'Kiev', 'Pskov', 'Polotsk', 'Vladimir', 'Smolensk', 'Ryazan', 'Tver'],
    rulers: ['Trưởng lão', 'Knyaz', 'Đại vương công', 'Sa hoàng', 'Thủ tướng', 'Tổng thống'],
    states: ['Công xã', 'Công quốc', 'Đại công quốc', 'Đế quốc', 'Quốc gia', 'Liên bang'],
    deity: 'Perun thần sấm và Mokosh mẹ đất',
    belief: 'tin rằng mỗi cánh rừng, mỗi con suối đều có thần linh trú ngụ',
    festival: 'Đêm Kupala – nhảy qua lửa giữa mùa hè',
    customs: ['dựng nhà gỗ izba', 'hát dân ca quanh đống lửa', 'xông hơi banya'],
    craft: 'săn thú lấy lông và khắc gỗ',
    colors: [0x8ad65a, 0x4f9a3a, 0xc8e070],
    traits: T({ hunt: 1.4, cold: 0.7, defense: 1.15, farm: 0.95 }),
  },
  {
    id: 'nui_cao',
    name: 'Người Núi cao',
    inspiration: 'lấy cảm hứng từ người Tây Tạng vùng Himalaya',
    homeland: 'rặng núi cao lạnh lẽo, không khí loãng',
    names: ['Tenzin', 'Dolma', 'Pema', 'Norbu', 'Sonam', 'Yangchen', 'Karma', 'Lhamo', 'Dorje', 'Kunga', 'Tashi', 'Dawa'],
    places: ['Lhasa', 'Shigatse', 'Gyantse', 'Lo Manthang', 'Shambhala', 'Tsaparang', 'Samye', 'Yarlung'],
    rulers: ['Tộc trưởng', 'Tsenpo', 'Vua', 'Pháp vương', 'Thủ tướng', 'Tổng thống'],
    states: ['Thị tộc', 'Vương quốc núi', 'Vương quốc', 'Đế quốc', 'Quốc gia', 'Cộng hòa'],
    deity: 'các vị thần núi thiêng',
    belief: 'tin vào luân hồi và treo cờ cầu nguyện trên các con đèo',
    festival: 'Losar – Tết đầu năm trên núi',
    customs: ['treo cờ phướn ngũ sắc', 'uống trà bơ', 'hành hương quanh núi thiêng'],
    craft: 'chăn bò yak và dệt len',
    colors: [0xb06ad6, 0xe07ab0, 0x7a4ab0],
    traits: T({ cold: 0.5, defense: 1.4, tech: 1.05, aggression: 0.6 }),
  },
  {
    id: 'dao_xa',
    name: 'Quần đảo Mặt trời mọc',
    inspiration: 'lấy cảm hứng từ Nhật Bản thời cổ',
    homeland: 'hòn đảo giữa biển khơi',
    names: ['Haru', 'Aiko', 'Kenji', 'Yuki', 'Ren', 'Sakura', 'Takeshi', 'Hana', 'Daichi', 'Mei', 'Sora', 'Kaito'],
    places: ['Yamato', 'Heian', 'Nara', 'Edo', 'Kamakura', 'Izumo', 'Kyushu', 'Asuka'],
    rulers: ['Tộc trưởng', 'Đại vương', 'Thiên hoàng', 'Shogun', 'Thủ tướng', 'Thủ tướng'],
    states: ['Thị tộc', 'Liên minh', 'Vương quốc', 'Mạc phủ', 'Đế quốc', 'Quốc gia'],
    deity: 'Amaterasu nữ thần Mặt Trời và các kami',
    belief: 'tin rằng kami ngự trong núi, cây và đá',
    festival: 'Hanami – ngắm hoa anh đào',
    customs: ['dựng cổng torii đỏ', 'thưởng trà đạo', 'võ sĩ giữ gìn danh dự'],
    craft: 'rèn kiếm và đánh cá',
    colors: [0xf07a8a, 0xffffff, 0xd04a5a],
    traits: T({ attack: 1.2, tech: 1.15, fish: 1.35, defense: 1.1, aggression: 1.1 }),
  },
];

export const cultureById = (id: string) => CULTURES.find((c) => c.id === id) ?? CULTURES[0];

export interface Terrain {
  water: number;
  forest: number;
  mountain: number;
  open: number;
  chill: number;
  landmass: number;
}

/** Measures the land around (x, y) that a newly founded village grows up in. */
export function surveyTerrain(w: World, x: number, y: number): Terrain {
  const r = 10;
  let total = 0;
  let water = 0;
  let forest = 0;
  let mountain = 0;
  let open = 0;
  let chill = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      total++;
      chill += w.chill(i);
      if (w.isWater(i)) water++;
      else if (w.cover[i] === Cover.FOREST) forest++;
      else if (w.height[i] >= GRASS_MAX) mountain += w.height[i] >= HILL_MAX ? 1.5 : 1;
      else open++;
    }
  }
  return {
    water: water / total,
    forest: forest / total,
    mountain: mountain / total,
    open: open / total,
    chill: chill / total,
    landmass: measureLandmass(w, x, y, 2500),
  };
}

function measureLandmass(w: World, x: number, y: number, cap: number) {
  const start = y * W + x;
  if (w.isWater(start)) return 0;
  const seen = new Uint8Array(N);
  const stack = [start];
  seen[start] = 1;
  let n = 0;
  while (stack.length && n < cap) {
    const i = stack.pop()!;
    n++;
    const ix = i % W;
    for (const j of [i - 1, i + 1, i - W, i + W]) {
      if (j < 0 || j >= N || seen[j] || Math.abs((j % W) - ix) > 1 || w.isWater(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return n;
}

/** Pick the culture this terrain would most naturally shape. */
export function cultureForTerrain(t: Terrain, existing = new Map<string, number>()): Culture {
  const cold = t.chill > 9;
  const warm = t.chill < 4;
  const scores: Record<string, number> = {
    bac_hai: (t.water > 0.15 ? t.water * 3 : 0) + (cold ? 1.2 : -1),
    hy_lap: (t.water > 0.2 ? t.water * 3 : 0) + (cold ? -1 : 0.4),
    dao_xa: (t.landmass < 1800 ? 1.6 : -1) + t.water + (cold ? -0.5 : 0),
    nui_cao: t.mountain * 4,
    rung_sau: t.forest * 3 + (cold ? 0.3 : 0),
    thao_nguyen: t.open * 2.4 - t.forest * 3 - t.water * 3 + 0.2,
    lua_nuoc: (t.water > 0.04 && t.water < 0.3 ? 1 : 0) + t.open * 1.2 + (warm ? 0.8 : -0.6),
    hoa_ha: (t.water > 0.03 && t.water < 0.25 ? 0.8 : 0) + t.open * 1.4 + (!warm && !cold ? 0.7 : -0.4),
  };
  let best = CULTURES[0];
  let bestScore = -Infinity;
  for (const c of CULTURES) {
    // Peoples who already exist elsewhere are less likely to arise again: the world stays diverse.
    const s = scores[c.id] + rand() * 0.35 - (existing.get(c.id) ?? 0) * 0.45;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

export function describeTraits(t: Traits): string[] {
  const out: string[] = [];
  if (t.aggression >= 1.3) out.push('hiếu chiến');
  if (t.attack >= 1.25) out.push('thiện chiến');
  if (t.defense >= 1.25) out.push('giỏi phòng thủ');
  if (t.tech >= 1.25) out.push('ham học hỏi');
  if (t.farm >= 1.25) out.push('cần cù làm ruộng');
  if (t.hunt >= 1.25) out.push('săn bắn giỏi');
  if (t.fish >= 1.25) out.push('thạo sông nước');
  if (t.speed >= 1.2) out.push('di chuyển thần tốc');
  if (t.cold <= 0.7) out.push('chịu rét giỏi');
  if (t.aggression <= 0.75) out.push('chuộng hòa bình');
  return out;
}
