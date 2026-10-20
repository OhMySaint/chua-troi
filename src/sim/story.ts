import { describeTraits } from './cultures';
import { ERAS, formatPop } from './eras';
import type { Sim, Village } from './Sim';

function terrainPhrase(v: Village) {
  const t = v.terrain;
  const parts: string[] = [];
  if (t.landmass > 0 && t.landmass < 1800) parts.push('một hòn đảo giữa biển khơi');
  else if (t.water > 0.25) parts.push('một vùng bờ biển lộng gió');
  else if (t.water > 0.05) parts.push('bên bờ sông nước');
  if (t.mountain > 0.25) parts.push('dưới chân những rặng núi cao');
  if (t.forest > 0.35) parts.push('giữa cánh rừng già');
  if (t.open > 0.5 && t.forest < 0.15) parts.push('trên thảo nguyên rộng mở');
  if (t.chill > 9) parts.push('nơi mùa đông kéo dài');
  return parts.length ? parts.join(', ') : 'một vùng đất màu mỡ';
}

/** A short legend of the people: origin, culture, character, and what they are like today. */
export function tribeStory(sim: Sim, v: Village): string[] {
  const c = v.culture;
  const traits = describeTraits(c.traits);
  const deity = v.patron >= 0 ? sim.godNames[v.patron] : c.deity;
  const out: string[] = [];

  const origin = v.parentName ? `Hậu duệ của những người rời bỏ ${v.parentName}, ` : 'Từ thuở hồng hoang, ';
  out.push(
    `${origin}${v.founder || 'tổ tiên họ'} dẫn đầu đoàn người dừng chân ở ${terrainPhrase(v)} vào năm ${v.foundYear}, đặt tên vùng đất là ${v.base}.`,
  );
  out.push(
    `Cuộc sống nơi ${c.homeland} đã hun đúc nên ${c.name} — ${c.inspiration}. Họ ${c.belief}, nổi tiếng với nghề ${c.craft}, và có tục ${c.customs.join(', ')}.`,
  );
  if (traits.length) out.push(`Người ${v.base} được biết đến là dân tộc ${traits.join(', ')}.`);

  const faith =
    v.religion === 'god'
      ? `Ngày nay họ tôn thờ ${deity}${v.temple ? ' trong ngôi đền thiêng giữa làng' : ''}, mỗi năm mở ${c.festival} để tạ ơn.`
      : `Họ vẫn giữ tín ngưỡng thờ ${c.deity} và mở ${c.festival} hằng năm. Niềm tin dành cho ${sim.deityOf(v)}: ${Math.round(v.faith)}/100.`;
  out.push(faith);

  const lessons: string[] = [];
  if (v.floods) lessons.push(`${v.floods} trận lũ dạy họ dựng nhà trên đất cao`);
  if (v.fires) lessons.push(`${v.fires} trận hỏa hoạn khiến họ phát quang quanh làng`);
  if (v.winters) lessons.push(`${v.winters} mùa đông dạy họ tích trữ lương thực`);
  if (v.stormWary) lessons.push('những tia sét dạy họ tránh cây cao khi bão');
  if (v.quakes) lessons.push(`${v.quakes} trận động đất làm họ kính sợ thần linh`);
  if (lessons.length) out.push(`Qua bao thăng trầm, ${lessons.join('; ')}.`);

  const infl = [...v.influences].filter(([, k]) => k >= 30).map(([c]) => c);
  if (infl.length) {
    const names = infl.map((c) => sim.villages.find((o) => o.culture.id === c)?.culture.name ?? c);
    out.push(`Nhờ giao thương, văn hóa của họ hòa quyện với ${names.join(', ')}.`);
  }

  const war = v.enemies.size
    ? ` Hiện họ đang giao chiến với ${[...v.enemies].map((e) => sim.villages[e].name).join(', ')}.`
    : v.kills || v.losses
      ? ` Trong chiến tranh họ đã hạ ${v.kills} kẻ thù và mất ${v.losses} chiến binh.`
      : '';
  const ruler = v.ruler ? `${v.ruler} đang trị vì` : 'Họ sống';
  out.push(`${ruler} ${formatPop(v.people)} dân ở ${v.houses.size} khu nhà, trong ${ERAS[v.era].name}.${war}`);
  return out;
}
