import type { Sim } from './Sim';

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  check: (s: Sim) => boolean;
}

const maxEra = (s: Sim) => s.villages.reduce((m, v) => (v.alive ? Math.max(m, v.era) : m), 0);
const aliveCultures = (s: Sim) => new Set(s.villages.filter((v) => v.alive).map((v) => v.culture.id)).size;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_village', icon: '🏕️', title: 'Bình minh văn minh', desc: 'Ngôi làng đầu tiên được lập nên', check: (s) => s.villages.length > 0 },
  { id: 'pop100', icon: '👥', title: 'Trăm họ', desc: 'Thế giới có 100 người', check: (s) => s.humans.length >= 100 },
  { id: 'pop1000', icon: '🏘️', title: 'Vạn dân', desc: 'Dân số thế giới vượt 10 nghìn', check: (s) => s.villages.reduce((n, v) => n + (v.alive ? v.people : 0), 0) >= 1e4 },
  { id: 'era1', icon: '🏺', title: 'Thời đồ đồng', desc: 'Một dân tộc bước vào Thời đồ đồng', check: (s) => maxEra(s) >= 1 },
  { id: 'era2', icon: '🗡️', title: 'Thời đồ sắt', desc: 'Một dân tộc bước vào Thời đồ sắt', check: (s) => maxEra(s) >= 2 },
  { id: 'era3', icon: '🏰', title: 'Trung cổ', desc: 'Một dân tộc bước vào Trung cổ', check: (s) => maxEra(s) >= 3 },
  { id: 'era4', icon: '🏭', title: 'Cách mạng công nghiệp', desc: 'Một dân tộc bước vào Thời công nghiệp', check: (s) => maxEra(s) >= 4 },
  { id: 'era5', icon: '🏙️', title: 'Kỷ nguyên hiện đại', desc: 'Một dân tộc bước vào Thời hiện đại', check: (s) => maxEra(s) >= 5 },
  { id: 'era6', icon: '🚀', title: 'Chinh phục vũ trụ', desc: 'Một dân tộc bước vào Kỷ nguyên vũ trụ', check: (s) => maxEra(s) >= 6 },
  { id: 'voyage', icon: '⛵', title: 'Vượt đại dương', desc: 'Đoàn thuyền đầu tiên vượt biển khai phá đảo xa', check: (s) => s.stats.voyages > 0 },
  { id: 'union', icon: '🤝', title: 'Thống nhất', desc: 'Hai quốc gia hợp nhất trong hòa bình', check: (s) => s.stats.unions > 0 },
  { id: 'exchange', icon: '🎎', title: 'Giao lưu văn hóa', desc: 'Văn hóa của một dân tộc lan tỏa sang dân tộc khác', check: (s) => s.stats.exchanges > 0 },
  { id: 'million', icon: '🌆', title: 'Triệu dân', desc: 'Dân số thế giới vượt 1 triệu', check: (s) => s.villages.reduce((n, v) => n + (v.alive ? v.people : 0), 0) >= 1e6 },
  { id: 'billion', icon: '🌍', title: 'Tỷ người', desc: 'Dân số thế giới vượt 1 tỷ', check: (s) => s.villages.reduce((n, v) => n + (v.alive ? v.people : 0), 0) >= 1e9 },
  { id: 'city', icon: '🌆', title: 'Thành phố đầu tiên', desc: 'Một nước đạt 60 dân từ Trung cổ trở đi', check: (s) => s.villages.some((v) => v.alive && v.era >= 3 && v.pop >= 60) },
  { id: 'first_war', icon: '⚔️', title: 'Máu đầu tiên', desc: 'Cuộc chiến tranh đầu tiên nổ ra', check: (s) => s.stats.wars > 0 },
  { id: 'peace', icon: '🕊️', title: 'Hòa ước', desc: 'Một cuộc chiến kết thúc bằng hòa bình', check: (s) => s.stats.treaties > 0 },
  { id: 'conquest', icon: '👑', title: 'Kẻ chinh phạt', desc: 'Một nước sáp nhập nước khác', check: (s) => s.stats.annexations > 0 },
  { id: 'empire', icon: '🏛️', title: 'Đế chế', desc: 'Một nước sáp nhập 3 nước khác', check: (s) => s.villages.some((v) => v.annexed >= 3) },
  { id: 'cultures4', icon: '🎭', title: 'Thế giới đa sắc', desc: '4 nền văn hóa cùng tồn tại', check: (s) => aliveCultures(s) >= 4 },
  { id: 'cultures6', icon: '🌐', title: 'Vạn quốc', desc: '6 nền văn hóa cùng tồn tại', check: (s) => aliveCultures(s) >= 6 },
  { id: 'faith', icon: '🙏', title: 'Đấng được tôn thờ', desc: 'Một dân tộc cải đạo theo bạn', check: (s) => s.villages.some((v) => v.alive && v.religion === 'god') },
  { id: 'temple', icon: '⛩️', title: 'Đền thờ đầu tiên', desc: 'Một dân tộc dựng đền thờ bạn', check: (s) => s.villages.some((v) => v.temple) },
  { id: 'world_faith', icon: '✨', title: 'Độc thần', desc: 'Mọi dân tộc đều thờ bạn (ít nhất 3)', check: (s) => { const a = s.villages.filter((v) => v.alive); return a.length >= 3 && a.every((v) => v.religion === 'god'); } },
  { id: 'wishes10', icon: '🌟', title: 'Đấng ban phước', desc: 'Đáp ứng 10 lời cầu nguyện', check: (s) => s.stats.wishesGranted >= 10 },
  { id: 'cruel', icon: '😈', title: 'Vị thần lạnh lùng', desc: 'Từ chối 10 lời cầu nguyện', check: (s) => s.stats.wishesDenied >= 10 },
  { id: 'apostasy', icon: '💔', title: 'Bị chối bỏ', desc: 'Một dân tộc bỏ đạo của bạn', check: (s) => s.stats.apostasies > 0 },
  { id: 'hunter', icon: '🦌', title: 'Thợ săn', desc: 'Loài người săn được 100 con thú', check: (s) => s.stats.hunted >= 100 },
  { id: 'wolf', icon: '🐺', title: 'Sói dữ', desc: 'Sói giết người lần đầu', check: (s) => s.stats.wolfKills > 0 },
  { id: 'winter', icon: '❄️', title: 'Vượt qua mùa đông', desc: 'Một dân tộc sống sót qua mùa đông', check: (s) => s.villages.some((v) => v.alive && v.winters > 0 && !v.inWinter) },
  { id: 'volcano', icon: '🌋', title: 'Núi lửa thức giấc', desc: 'Tạo ra một ngọn núi lửa', check: (s) => s.stats.volcanoes > 0 },
  { id: 'meteor', icon: '☄️', title: 'Sao băng hủy diệt', desc: 'Giáng thiên thạch xuống thế giới', check: (s) => s.stats.meteors > 0 },
  { id: 'quake', icon: '🌍', title: 'Rung chuyển', desc: 'Gây ra động đất', check: (s) => s.stats.quakes > 0 },
  { id: 'extinct', icon: '💀', title: 'Diệt vong', desc: 'Một dân tộc biến mất khỏi lịch sử', check: (s) => s.stats.extinctions > 0 },
  { id: 'year100', icon: '📜', title: 'Thế kỷ đầu tiên', desc: 'Lịch sử bước sang năm 100', check: (s) => s.year >= 100 },
  { id: 'year500', icon: '📚', title: 'Nửa thiên niên kỷ', desc: 'Lịch sử bước sang năm 500', check: (s) => s.year >= 500 },
  { id: 'elder', icon: '👴', title: 'Trường thọ', desc: 'Một người sống đến 80 tuổi', check: (s) => s.humans.some((h) => h.age >= 80 * 6) },
];
