import { audio } from '../audio/Audio';
import { sim, ui } from '../core';
import { session } from '../net/session';
import { listSaves, loadFrom } from '../save';
import { saveSettings, settings } from '../settings';
import { GOOGLE_CLIENT_ID, googleProfile, googleSignOut, onProfile, renderGoogleButton } from '../net/google';
import { hostRoom, openMultiplayer } from './multiplayer';
import { openSaves } from './saves';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

let home: HTMLDivElement;
let view: 'main' | 'solo' | 'setup' | 'msetup' | 'settings' | 'bye' = 'main';
const setup = { layout: 'random' as 'random' | 'halves', tribes: 12 };

/** The title screen: a living world drifts by behind the menu. */
export function mountHome() {
  home = document.createElement('div');
  home.id = 'home';
  document.body.append(home);
  showHome();

  home.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
    if (!b) return;
    switch (b.dataset.go) {
      case 'solo':
        view = 'solo';
        break;
      case 'new':
        setup.layout = 'random';
        view = 'setup';
        break;
      case 'start':
        sim.newWorld(undefined, { layout: setup.layout, tribes: setup.tribes });
        return enterGame();
      case 'layout':
        setup.layout = b.dataset.value as 'random' | 'halves';
        break;
      case 'mhost':
        sim.newWorld(undefined, { layout: setup.layout, tribes: setup.tribes });
        enterGame();
        hostRoom();
        return;
      case 'mjoin':
        enterGame();
        openMultiplayer();
        return;
      case 'continue':
        try {
          await loadFrom('auto');
          return enterGame();
        } catch {
          alert('Chưa có bản tự động lưu.');
        }
        break;
      case 'load':
        enterGame();
        openSaves();
        return;
      case 'multi':
        setup.layout = 'halves';
        view = 'msetup';
        break;
      case 'settings':
        view = 'settings';
        break;
      case 'quit':
        view = 'bye';
        render();
        window.close(); // only works if the game was opened by a script; otherwise we show the farewell
        return;
      case 'back':
        view = 'main';
        break;
      case 'logout':
        googleSignOut();
        break;
    }
    render();
  });

  home.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'tribes') {
      setup.tribes = Number(t.value);
      const out = home.querySelector('#tribes-out');
      if (out) out.textContent = setup.tribes ? `${setup.tribes} bộ lạc` : 'Thế giới trống';
      return;
    }
    onSetting(e);
  });
  home.addEventListener('mouseover', (e) => {
    if ((e.target as HTMLElement).closest('.menu button')) audio.hover();
  });

  onProfile(() => render());

  // ☰ in the toolbar opens the pause menu (settings / quit to title).
  mountPause();
  document.querySelector('#menu-btn')?.addEventListener('click', () => openPause());

  // Invitation links skip the title screen and go straight to joining.
  if (new URLSearchParams(location.search).get('room')) enterGame();
}

export function showHome() {
  view = 'main';
  ui.attract = true;
  // A still backdrop: the world holds its breath behind the menu.
  if (!session?.together) sim.paused = true;
  document.body.classList.add('at-home');
  home.hidden = false;
  render();
}

function enterGame() {
  ui.attract = false;
  home.hidden = true;
  document.body.classList.remove('at-home');
  if (!session?.together) {
    sim.speed = settings.speed;
    sim.paused = false;
  }
  ui.enter = true;
}

function settingsHTML(backAction: string) {
  const slider = (k: keyof typeof settings, label: string) =>
    `<label class="set"><span>${label}</span><input type="range" min="0" max="1" step="0.05" data-set="${k}" value="${settings[k]}"></label>`;
  const check = (k: keyof typeof settings, label: string) =>
    `<label class="set check"><input type="checkbox" data-set="${k}" ${settings[k] ? 'checked' : ''}><span>${label}</span></label>`;
  return `<div class="menu settings">
    <h3>⚙ Cài đặt</h3>
    ${slider('master', '🔊 Âm lượng chung')}
    ${slider('music', '🎵 Nhạc nền')}
    ${slider('sfx', '💥 Hiệu ứng')}
    ${slider('ambience', '🌧 Âm thanh môi trường')}
    ${check('muted', 'Tắt tiếng (phím M)')}
    ${check('particles', 'Hiện mưa, tuyết rơi')}
    ${check('labels', 'Hiện tên quốc gia trên bản đồ')}
    ${check('speech', 'Hiện lời nói của dân khi zoom gần')}
    <label class="set"><span>⏩ Tốc độ khi bắt đầu</span><input type="range" min="1" max="8" step="1" data-set="speed" value="${settings.speed}"></label>
    <button data-go="${backAction}">← Quay lại</button>
  </div>`;
}

function onSetting(e: Event) {
  const t = e.target as HTMLInputElement;
  const k = t.dataset.set as keyof typeof settings | undefined;
  if (!k) return;
  if (t.type === 'checkbox') (settings[k] as boolean) = t.checked;
  else (settings[k] as number) = Number(t.value);
  saveSettings();
  audio.applyVolumes();
  if (k === 'sfx') audio.click();
}

// ---------- in-game pause menu ----------

let pause: HTMLDivElement;
let wasPaused = false;

function mountPause() {
  pause = document.createElement('div');
  pause.id = 'pause';
  pause.className = 'modal';
  pause.hidden = true;
  document.body.append(pause);
  pause.addEventListener('input', onSetting);
  pause.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === pause) return closePause();
    const b = t.closest<HTMLElement>('[data-go]');
    if (!b) return;
    if (b.dataset.go === 'p-close') closePause();
    else if (b.dataset.go === 'p-settings') renderPause('settings');
    else if (b.dataset.go === 'p-back') renderPause('main');
    else if (b.dataset.go === 'p-quit') {
      pause.hidden = true;
      showHome();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pause.hidden) closePause();
  });
}

function openPause() {
  wasPaused = sim.paused;
  if (!session?.together) sim.paused = true; // a shared world keeps turning
  pause.hidden = false;
  renderPause('main');
}

function closePause() {
  pause.hidden = true;
  if (!session?.together) sim.paused = wasPaused;
}

function renderPause(v: 'main' | 'settings') {
  pause.innerHTML = `<div class="pause-box">
    <div class="dialog-head"><h3>☰ Tạm dừng</h3><button data-go="p-close" title="Tiếp tục chơi (Esc)">✕</button></div>
    ${
      v === 'main'
        ? `<div class="menu">
            <button data-go="p-settings">⚙ Cài đặt</button>
            <button data-go="p-quit">⏻ Thoát ra màn hình chính</button>
          </div>`
        : settingsHTML('p-back')
    }
  </div>`;
}

async function render() {
  if (home.hidden) return;
  const p = googleProfile();
  const account = p
    ? `<div class="home-user">${p.picture ? `<img src="${esc(p.picture)}" alt="" referrerpolicy="no-referrer">` : '👤'}<span>${esc(p.name)}</span><button data-go="logout">Đăng xuất</button></div>`
    : GOOGLE_CLIENT_ID
      ? '<div class="home-user"><div id="home-gsi"></div></div>'
      : '';

  let body = '';
  if (view === 'main') {
    body = `<div class="menu">
      <button data-go="solo">▶ Chơi một mình</button>
      <button data-go="multi">👥 Chơi nhiều người</button>
      <button data-go="settings">⚙ Cài đặt</button>
      <button data-go="quit">⏻ Thoát</button>
    </div>`;
  } else if (view === 'solo') {
    const saves = await listSaves().catch(() => []);
    const auto = saves.find((s) => s.slot === 'auto');
    body = `<div class="menu">
      ${auto ? `<button data-go="continue">⏵ Tiếp tục<small>Năm ${auto.year} · ${esc(auto.era)}</small></button>` : ''}
      <button data-go="new">🌍 Thế giới mới</button>
      <button data-go="load">📂 Tải thế giới</button>
      <button data-go="back">← Quay lại</button>
    </div>`;
  } else if (view === 'setup' || view === 'msetup') {
    const opt = (v: string, label: string, sub: string) =>
      `<button data-go="layout" data-value="${v}" class="${setup.layout === v ? 'active' : ''}">${label}<small>${sub}</small></button>`;
    body = `<div class="menu settings">
      <h3>${view === 'setup' ? '🌍 Thế giới mới' : '👥 Thế giới chung'}</h3>
      <div class="set-title">Bản đồ</div>
      <div class="choice">
        ${opt('random', '🎲 Ngẫu nhiên', '3–5 lục địa lớn')}
        ${opt('halves', '⚖️ Chia đôi', '2 lục địa cân bằng, mỗi thần một bên')}
      </div>
      <label class="set"><span>🏕️ Bộ lạc thời đồ đá</span><input id="tribes" type="range" min="0" max="30" step="1" value="${setup.tribes}"></label>
      <div class="muted" id="tribes-out">${setup.tribes ? `${setup.tribes} bộ lạc` : 'Thế giới trống'}</div>
      <p class="muted">${setup.tribes ? 'Các bộ lạc sẽ tự lớn thành thành bang, rồi quốc gia.' : 'Chưa có ai — dùng 🧑 Người để gieo dân; họ sẽ tự lập bộ lạc và phát triển.'}</p>
      ${
        view === 'setup'
          ? '<button data-go="start">▶ Bắt đầu</button>'
          : '<button data-go="mhost">🌍 Tạo phòng với thế giới này</button><button data-go="mjoin">🚪 Vào phòng của bạn bè</button>'
      }
      <button data-go="back">← Quay lại</button>
    </div>`;
  } else if (view === 'settings') {
    body = settingsHTML('back');
  } else {
    body = `<div class="menu"><p class="bye">Hẹn gặp lại, vị thần!<br><small>Bạn có thể đóng tab này.</small></p><button data-go="back">← Quay lại</button></div>`;
  }

  home.innerHTML = `
    <div class="home-inner">
      ${account}
      <h1 class="logo"><span>SaintMia's</span><span>World</span></h1>
      <p class="tagline">Kiến tạo thế giới · Dẫn dắt nhân loại từ thời đồ đá tới các vì sao</p>
      ${body}
      <p class="home-foot">Bấm bất kỳ đâu để bật âm thanh · <a href="https://github.com/OhMySaint/chua-troi" target="_blank" rel="noopener">mã nguồn</a></p>
    </div>`;
  const gsi = home.querySelector<HTMLElement>('#home-gsi');
  if (gsi) void renderGoogleButton(gsi);
}
