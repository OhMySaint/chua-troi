/**
 * How a people is governed: its political system, taxes, military stance, trade and faith.
 * Every nation has these (the AI sets them); the player sets them for the people they guide.
 */

export type Gov =
  | 'council'
  | 'chief'
  | 'monarchy'
  | 'republic'
  | 'feudal'
  | 'absolute'
  | 'merchant'
  | 'capitalism'
  | 'socialism'
  | 'communism';

export interface GovInfo {
  name: string;
  icon: string;
  /** Ages (inclusive) in which this system can be chosen. */
  from: number;
  to: number;
  desc: string;
  /** Multipliers / bonuses. */
  tech: number;
  army: number;
  mood: number;
  tax: number;
}

export const GOVS: Record<Gov, GovInfo> = {
  council: { name: 'Hội đồng già làng', icon: '🔥', from: 0, to: 1, desc: 'Các bô lão cùng bàn bạc. Dân hòa thuận, ít binh lính.', tech: 1, army: -0.05, mood: 8, tax: 0.9 },
  chief: { name: 'Tù trưởng', icon: '🪓', from: 0, to: 1, desc: 'Một người mạnh nhất cầm quyền. Quân đông, dân ít tiếng nói.', tech: 1, army: 0.08, mood: -4, tax: 1.1 },
  monarchy: { name: 'Quân chủ', icon: '👑', from: 1, to: 3, desc: 'Vua cha truyền con nối. Ổn định, thu thuế tốt.', tech: 1, army: 0.03, mood: 0, tax: 1.15 },
  republic: { name: 'Cộng hòa', icon: '🏛️', from: 1, to: 3, desc: 'Công dân bầu người lãnh đạo. Khoa học và buôn bán phát triển.', tech: 1.12, army: -0.03, mood: 4, tax: 1 },
  feudal: { name: 'Phong kiến', icon: '🏰', from: 2, to: 3, desc: 'Lãnh chúa giữ đất, nông dân nộp tô. Quân mạnh, học vấn chậm.', tech: 0.9, army: 0.1, mood: -3, tax: 1.1 },
  absolute: { name: 'Quân chủ chuyên chế', icon: '⚜️', from: 3, to: 4, desc: 'Vua nắm mọi quyền. Thuế nặng, triều đình xa hoa.', tech: 0.95, army: 0.06, mood: -8, tax: 1.35 },
  merchant: { name: 'Cộng hòa thương nhân', icon: '⚖️', from: 3, to: 3, desc: 'Các phường hội cai trị. Thương mại cực thịnh, quân yếu.', tech: 1.1, army: -0.06, mood: 3, tax: 1.25 },
  capitalism: { name: 'Tư bản chủ nghĩa', icon: '💰', from: 4, to: 6, desc: 'Thị trường tự do. Tăng trưởng nhanh nhất, hay khủng hoảng.', tech: 1.12, army: 0, mood: 0, tax: 1.2 },
  socialism: { name: 'Xã hội chủ nghĩa', icon: '🌹', from: 4, to: 6, desc: 'Phúc lợi cho mọi người. Ổn định, dân hài lòng.', tech: 1, army: 0, mood: 8, tax: 1 },
  communism: { name: 'Cộng sản chủ nghĩa', icon: '☭', from: 4, to: 6, desc: 'Kinh tế kế hoạch. Quân đông, ít khủng hoảng, chậm đổi mới.', tech: 0.92, army: 0.08, mood: -2, tax: 1.05 },
};

export const govsFor = (era: number) => (Object.keys(GOVS) as Gov[]).filter((g) => era >= GOVS[g].from && era <= GOVS[g].to);

export const TAXES = [
  { name: 'Thấp', icon: '🪶', income: 0.5, mood: 10 },
  { name: 'Vừa', icon: '⚖️', income: 1, mood: 0 },
  { name: 'Cao', icon: '💰', income: 1.6, mood: -14 },
];

export type Stance = 'peace' | 'defend' | 'expand';
export const STANCES: Record<Stance, { name: string; icon: string; desc: string }> = {
  peace: { name: 'Hòa bình', icon: '🕊️', desc: 'Không bao giờ tự gây chiến, ít lính.' },
  defend: { name: 'Phòng thủ', icon: '🛡️', desc: 'Giữ quân đủ để bảo vệ bờ cõi.' },
  expand: { name: 'Bành trướng', icon: '⚔️', desc: 'Sẵn sàng tranh đất với láng giềng.' },
};

export type FaithPolicy = 'ancestral' | 'god' | 'secular';
export const FAITHS: Record<FaithPolicy, { name: string; icon: string; desc: string; from: number }> = {
  ancestral: { name: 'Tín ngưỡng tổ tiên', icon: '🏮', desc: 'Thờ thần linh của dân tộc mình.', from: 0 },
  god: { name: 'Thờ Đấng Sáng Thế', icon: '✨', desc: 'Cả nước tôn thờ vị thần đã tạo ra họ: đức tin mạnh, cầu nguyện nhiều.', from: 0 },
  secular: { name: 'Nhà nước thế tục', icon: '🔬', desc: 'Tách tôn giáo khỏi nhà nước: khoa học nhanh hơn, ít cầu nguyện.', from: 4 },
};

/** Gold a civic building costs, rising with the age. */
export const civicGold = (era: number) => 15 + era * 12;
