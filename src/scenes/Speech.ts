import Phaser from 'phaser';
import type { Human, Sim } from '../sim/Sim';
import { CELL } from '../world/constants';

/** Only this close in do people's voices show. */
export const SPEECH_ZOOM = 2.6;
const MAX_BUBBLES = 7;
const LIFE = 3.6;

const CHAT: string[][] = [
  ['Hôm nay săn được hươu to!', 'Lửa trại ấm quá', 'Đêm qua nghe sói tru gần lắm', 'Mai đi hái quả không?'],
  ['Đồ đồng mới đúc sắc thật', 'Năm nay lúa trổ bông đẹp', 'Nghe nói làng bên có chợ phiên'],
  ['Thợ rèn vừa rèn xong thanh kiếm mới', 'Tường thành cao thế này thì yên tâm', 'Đường mới làm đi sướng thật'],
  ['Nghe nói nhà vua sắp mở hội', 'Thầy đồ dạy chữ hay lắm', 'Thuyền buôn vừa cập bến'],
  ['Nhà máy ồn quá đi mất', 'Tàu hỏa nhanh thật!', 'Lương tháng này được tăng'],
  ['Tối nay xem phim không?', 'Kẹt xe quá trời', 'Điện thoại mới xịn ghê', 'Cuối tuần đi biển nhé'],
  ['Mai mình lên trạm vũ trụ chơi nhé', 'Xe bay đời mới êm thật', 'Nghe nói sắp mở thuộc địa trên Mặt Trăng'],
];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** What this person might say right now: complaints, praise, fear, or idle chatter. */
function line(sim: Sim, h: Human): string {
  const v = h.village >= 0 ? sim.villages[h.village] : null;
  const era = v?.era ?? 0;
  if (h.action === 'fight' || h.role === 'soldier') return pick([`Vì ${v?.capital.base ?? 'quê hương'}!`, 'Xông lên!', 'Giữ vững hàng ngũ!', 'Không lùi bước!']);
  if (h.action === 'flee' || h.action === 'swim') return pick(['Cứu với!', 'Chạy mau!', 'Trời ơi!']);
  if (h.action === 'pray' && v) return pick([`Lạy ${sim.deityOf(v)} phù hộ!`, 'Xin ban phước lành!', `Mừng ${v.culture.festival}!`]);
  if (h.hunger > 0.65)
    return era >= 4 ? pick(['Giá thực phẩm đắt quá', 'Siêu thị hết hàng rồi', 'Lương không đủ mua gạo']) : pick(['Đói quá...', 'Kho lúa sắp cạn rồi', 'Bao giờ mới được bữa no?']);
  if (h.warmth < 0.4) return pick(['Lạnh cóng cả người', 'Mùa đông này dài quá', 'Củi đâu hết rồi?']);
  if (v && v.sick > 0.2) return pick([`${v.plague[0].toUpperCase() + v.plague.slice(1)} lan khắp nơi rồi...`, 'Nhà bên lại có người ốm', 'Phải đun sôi nước mà uống', era >= 4 ? 'Bệnh viện quá tải rồi' : 'Thầy lang bảo phải cách ly']);
  if (v && v.pollution > 0.4 && Math.random() < 0.5) return pick(['Khói bụi thế này sao thở nổi', 'Sông bẩn quá, cá chết hết', 'Phải trồng thêm cây thôi']);
  if (sim.world.season() === 3 && Math.random() < 0.25) return pick(['Mùa đông lạnh quá', 'Kho lúa còn đủ không nhỉ?', 'Ngồi bên bếp lửa cho ấm']);
  if (sim.world.season() === 2 && Math.random() < 0.25) return pick(['Lúa chín vàng đồng rồi!', 'Mùa gặt bận rộn quá', 'Năm nay được mùa']);
  if (sim.world.season() === 0 && Math.random() < 0.2) return pick(['Xuân về hoa nở khắp nơi', 'Đến mùa gieo hạt rồi']);
  if (v && v.trauma > 0.4) return pick(['Thiên tai tàn phá hết rồi...', 'Phải làm lại từ đầu thôi', 'Bao giờ mới yên ổn đây?']);
  if (v && v.enemies.size) return pick(['Chiến tranh bao giờ mới hết?', 'Con tôi đã ra trận...', 'Nghe nói giặc sắp tới']);
  if (v && v.patron >= 0 && v.faith > 60 && Math.random() < 0.3) return pick([`${sim.deityOf(v)} thật nhân từ!`, 'Mùa này bội thu, tạ ơn thần linh', 'Đền thờ mới đẹp quá']);
  if (v && v.faith < 15 && Math.random() < 0.3) return pick(['Thần linh bỏ rơi chúng ta rồi', 'Cầu mãi chẳng ai nghe']);
  if (v && Math.random() < 0.15) return `Sắp tới ${v.culture.festival} rồi!`;
  if (h.carryWood) return pick(['Gỗ tốt đây!', 'Nặng quá đi mất']);
  if (h.carryFood) return pick(['Về nhà nấu cơm thôi', 'Được mùa rồi!']);
  if (h.age < 16 * 6) return pick(['Chơi trốn tìm không?', 'Mẹ ơi con đói', 'Đuổi bắt nè!']);
  return pick(CHAT[Math.min(era, CHAT.length - 1)]);
}

interface Bubble {
  text: Phaser.GameObjects.Text;
  who: Human;
  life: number;
}

/** Speech bubbles above people, shown only when zoomed in and never piled on top of each other. */
export class Speech {
  private scene: Phaser.Scene;
  private bubbles: Bubble[] = [];
  private pool: Phaser.GameObjects.Text[] = [];
  private spoke = new WeakMap<Human, number>();
  private acc = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  update(dt: number, sim: Sim, cam: Phaser.Cameras.Scene2D.Camera, enabled: boolean) {
    const zoom = cam.zoom;
    if (!enabled || zoom < SPEECH_ZOOM) {
      for (const b of this.bubbles.splice(0)) this.release(b.text);
      return;
    }
    // Age, follow and fade the bubbles we have.
    for (const b of this.bubbles) {
      b.life -= dt;
      b.text.setPosition(b.who.x * CELL, b.who.y * CELL - 12).setScale(1 / zoom);
      b.text.setAlpha(Math.min(1, b.life * 2));
    }
    for (const b of this.bubbles.filter((x) => x.life <= 0 || x.who.dead || x.who.inside)) this.release(b.text);
    this.bubbles = this.bubbles.filter((x) => x.life > 0 && !x.who.dead && !x.who.inside);

    this.acc += dt;
    if (this.acc < 0.5 || this.bubbles.length >= MAX_BUBBLES) return;
    this.acc = 0;
    const view = cam.worldView;
    const now = performance.now();
    const candidates = sim.humans.filter(
      (h) => !h.inside && h.x * CELL > view.x && h.x * CELL < view.right && h.y * CELL > view.y + 20 && h.y * CELL < view.bottom && now - (this.spoke.get(h) ?? -1e9) > 20000,
    );
    if (!candidates.length) return;
    const h = candidates[Math.floor(Math.random() * candidates.length)];
    const msg = line(sim, h);
    // Skip if it would overlap a bubble already on screen.
    const w = (msg.length * 6.5 + 12) / zoom;
    const x = h.x * CELL;
    const y = h.y * CELL - 12;
    for (const b of this.bubbles) {
      const bw = b.text.displayWidth;
      if (Math.abs(b.text.x - x) < (bw + w) / 2 + 4 / zoom && Math.abs(b.text.y - y) < 26 / zoom) return;
    }
    this.spoke.set(h, now);
    const text = this.obtain();
    text.setText(msg).setPosition(x, y).setScale(1 / zoom).setAlpha(1).setVisible(true);
    this.bubbles.push({ text, who: h, life: LIFE });
  }

  private obtain() {
    return (
      this.pool.pop() ??
      this.scene.add
        .text(0, 0, '', {
          fontFamily: 'VT323, monospace',
          fontSize: '17px',
          color: '#2a2418',
          backgroundColor: '#fff8e0',
          padding: { x: 5, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setResolution(2)
        .setDepth(39)
    );
  }

  private release(t: Phaser.GameObjects.Text) {
    t.setVisible(false);
    this.pool.push(t);
  }
}
