import { sim, ui, type Tool } from '../core';
import { mountSaves, openSaves } from './saves';
import { audio } from '../audio/Audio';
import { saveSettings, settings } from '../settings';
import { mountMultiplayer } from './multiplayer';
import { session } from '../net/session';
import { ACHIEVEMENTS } from '../sim/achievements';
import { describeTraits } from '../sim/cultures';
import { ERAS, MAX_ERA, formatPop } from '../sim/eras';
import { cultureById } from '../sim/cultures';
import { ACTION_LABEL, SPECIAL_LABEL, type Human, type Village } from '../sim/Sim';
import { SPECIAL_KINDS } from '../art/buildings';
import { tribeStory } from '../sim/story';
import { BASE_SEA, H, W, WEATHER_LABEL, YEAR, type Weather } from '../world/constants';

interface ToolDef {
  id: Tool;
  label: string;
  hint: string;
}

const TOOL_GROUPS: { name: string; tools: ToolDef[] }[] = [
  {
    name: 'Địa hình',
    tools: [
      { id: 'raise', label: '⛰️ Nâng', hint: 'Giữ chuột để đắp đất thành đồi, núi' },
      { id: 'lower', label: '🕳️ Hạ', hint: 'Giữ chuột để đào thấp, tạo thung lũng, biển hồ' },
      { id: 'smooth', label: '〰️ Phẳng', hint: 'San phẳng địa hình' },
      { id: 'water', label: '🌊 Sông', hint: 'Vẽ sông, hồ nước' },
      { id: 'forest', label: '🌲 Rừng', hint: 'Trồng rừng' },
    ],
  },
  {
    name: 'Thiên tai',
    tools: [
      { id: 'fire', label: '🔥 Lửa', hint: 'Phóng hỏa' },
      { id: 'volcano', label: '🌋 Núi lửa', hint: 'Bấm để dựng núi lửa phun dung nham — gặp biển sẽ thành đất mới' },
      { id: 'quake', label: '🌍 Động đất', hint: 'Bấm để tạo đứt gãy, làm sập nhà (cỡ cọ = cường độ)' },
      { id: 'meteor', label: '☄️ Thiên thạch', hint: 'Bấm để giáng thiên thạch tạo miệng hố' },
    ],
  },
  {
    name: 'Sự sống',
    tools: [
      { id: 'human', label: '🧑 Người', hint: 'Tạo người du mục' },
      { id: 'deer', label: '🦌 Hươu', hint: 'Thả hươu — con mồi của người và sói' },
      { id: 'wolf', label: '🐺 Sói', hint: 'Thả sói — săn hươu và người đi lẻ' },
    ],
  },
  {
    name: 'Thần quyền',
    tools: [
      { id: 'war', label: '⚔️ Gây chiến', hint: 'Bấm nước tấn công, rồi bấm nước bị tấn công (Esc để hủy)' },
      { id: 'peace', label: '🕊️ Hòa bình', hint: 'Bấm vào một nước để chấm dứt mọi cuộc chiến của họ' },
      { id: 'inspect', label: '🔍 Quan sát', hint: 'Bấm vào người hoặc bộ tộc để xem câu chuyện của họ' },
      { id: 'pan', label: '✋ Kéo', hint: 'Kéo bản đồ (phím H). Trackpad: vuốt 2 ngón để di chuyển, chụm để zoom, hoặc giữ ⌥ Option + kéo' },
    ],
  },
];
const TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);
const WEATHERS: Weather[] = ['sun', 'rain', 'storm', 'snow', 'drought'];
const SPEEDS = [1, 2, 4, 8];
type Tab = 'wishes' | 'tribes' | 'history' | 'achievements';

const GOD_COLORS = ['#ffe14d', '#c08aff'];
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

let tab: Tab = 'wishes';

export function mountUI() {
  const toolbar = $('#toolbar');
  let key = 1;
  toolbar.innerHTML = `
    ${TOOL_GROUPS.map(
      (g) => `<div class="group"><span class="glabel">${g.name}</span>${g.tools
        .map((t) => `<button data-tool="${t.id}" title="${t.hint}${key <= 9 ? ` (phím ${key++})` : ''}">${t.label}</button>`)
        .join('')}</div>`,
    ).join('')}
    <div class="group">
      <label title="Cỡ cọ ( [ và ] )">Cọ <input id="brush" type="range" min="1" max="12" value="${ui.brush}"></label>
    </div>
    <div class="group" id="weather">${WEATHERS.map((w) => `<button data-weather="${w}">${WEATHER_LABEL[w]}</button>`).join('')}
      <button data-weather="auto" title="Để thời tiết tự thay đổi">🔄 Tự nhiên</button>
      <button id="weather-mode" title="Bật: bấm một kiểu thời tiết rồi tô lên bản đồ để đổi thời tiết từng vùng. Tắt: áp dụng toàn thế giới.">📍 Theo vùng</button>
    </div>
    <div class="group" id="speed">
      <button data-speed="0" title="Tạm dừng (Space)">⏸</button>
      ${SPEEDS.map((s) => `<button data-speed="${s}">${s}x</button>`).join('')}
    </div>
    <div class="group">
      <button data-zoom="out" title="Thu nhỏ (-)">−</button>
      <button data-zoom="in" title="Phóng to (+)">+</button>
      <button data-zoom="fit" title="Xem toàn bản đồ (0)">🗺️ Toàn cảnh</button>
      <button id="new-world">🌍 Thế giới mới</button>
      <button id="saves-btn" title="Lưu / tải / chia sẻ thế giới (⌘S lưu nhanh)">💾 Lưu</button>
      <button id="mp-btn" title="Chơi chung: hai vị thần cùng một thế giới">👥 Chơi chung</button>
      <button id="mute-btn" title="Tắt/bật âm thanh (M)">🔊</button>
      <button id="menu-btn" title="Về màn hình chính">☰ Menu</button>
    </div>
  `;

  toolbar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.tool) ui.tool = b.dataset.tool as Tool;
    if (b.id === 'weather-mode') ui.weatherMode = ui.weatherMode === 'region' ? 'global' : 'region';
    if (b.dataset.weather) {
      if (b.dataset.weather === 'auto') sim.issue({ god: sim.me, t: 'autoWeather', on: !sim.world.autoWeather });
      else if (ui.weatherMode === 'region') {
        // Arm the regional weather brush.
        ui.weatherBrush = b.dataset.weather as Weather;
        ui.tool = 'weather';
      } else {
        sim.issue({ god: sim.me, t: 'weatherAll', w: b.dataset.weather as Weather });
      }
    }
    if (b.dataset.speed) {
      const s = Number(b.dataset.speed);
      const speed = s || sim.speed;
      if (session?.together) session.setSpeed(speed, s === 0);
      else {
        sim.paused = s === 0;
        sim.speed = speed;
      }
    }
    if (b.dataset.zoom) ui.zoomCmd = b.dataset.zoom as typeof ui.zoomCmd;
    if (b.id === 'saves-btn') openSaves();
    if (b.id === 'mute-btn') toggleMute();
    if (b.id === 'new-world') {
      if (session?.together) alert('Đang chơi chung: hãy rời phòng trước khi tạo thế giới mới.');
      else if (confirm('Tạo thế giới mới? Thế giới hiện tại sẽ biến mất.')) sim.newWorld();
    }
    refreshButtons();
    b.blur();
  });

  const brush = $<HTMLInputElement>('#brush');
  brush.addEventListener('input', () => (ui.brush = Number(brush.value)));

  const god = $<HTMLInputElement>('#god-name');
  god.value = sim.godName;
  god.addEventListener('change', () => sim.issue({ god: sim.me, t: 'godName', name: god.value.trim() || 'Đấng Sáng Thế' }));

  $('#tabs').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab as Tab;
    lastTab = '';
    refreshPanel();
  });

  // The panel is not re-rendered while a press is in progress, so clicks land on what was pressed.
  $('#panel').addEventListener('pointerdown', () => (pressing = true));
  window.addEventListener('pointerup', () => setTimeout(() => (pressing = false), 0));
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-wish],[data-village],[data-focus],[data-war]');
    if (!el) return;
    if (el.dataset.wish) sim.issue({ god: sim.me, t: 'wish', id: Number(el.dataset.wish), yes: el.dataset.answer === 'yes' });
    if (el.dataset.village) {
      const v = sim.villages[Number(el.dataset.village)];
      if (v) {
        sim.selectedVillage = v;
        sim.selectedHuman = null;
        ui.focus = { x: v.cx, y: v.cy };
      }
    }
    if (el.dataset.war) {
      const target = document.querySelector<HTMLSelectElement>('#war-target');
      if (target) sim.issue({ god: sim.me, t: 'war', a: Number(el.dataset.war), b: Number(target.value) });
    }
    if (el.dataset.focus) {
      const v = sim.villages[Number(el.dataset.focus)];
      if (v) ui.focus = { x: v.cx, y: v.cy };
    }
    lastTab = '';
    lastInspect = '';
    setTimeout(refreshPanel, 0);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) ui.tool = TOOLS[n - 1].id;
    if (e.key === 'i') ui.tool = 'inspect';
    if (e.key === 'h') ui.tool = 'pan';
    if (e.key === 'm') toggleMute();
    if (e.key === 'Escape') sim.warFrom = null;
    if (e.key === '+' || e.key === '=') ui.zoomCmd = 'in';
    if (e.key === '-') ui.zoomCmd = 'out';
    if (e.key === '0') ui.zoomCmd = 'fit';
    if (e.key === '[') ui.brush = Math.max(1, ui.brush - 1);
    if (e.key === ']') ui.brush = Math.min(12, ui.brush + 1);
    if (e.key === ' ') {
      if (session?.together) session.setSpeed(sim.speed, !sim.paused);
      else sim.paused = !sim.paused;
      e.preventDefault();
    }
    brush.value = String(ui.brush);
    refreshButtons();
  });

  sim.toasts.push({
    icon: '🖐️',
    title: 'Điều khiển',
    text: 'Trackpad: vuốt 2 ngón để di chuyển, chụm 2 ngón để zoom, giữ ⌥ Option + kéo để kéo bản đồ. Phím mũi tên / WASD cũng được.',
  });
  // Collapsible right panel (remembered).
  const toggle = $<HTMLButtonElement>('#panel-toggle');
  const setCollapsed = (on: boolean) => {
    document.body.classList.toggle('panel-collapsed', on);
    toggle.textContent = on ? '◀' : '▶';
    try {
      localStorage.setItem('saintmia:panel', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  };
  try {
    setCollapsed(localStorage.getItem('saintmia:panel') === '1');
  } catch {
    setCollapsed(false);
  }
  toggle.addEventListener('click', () => setCollapsed(!document.body.classList.contains('panel-collapsed')));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      setCollapsed(!document.body.classList.contains('panel-collapsed'));
    }
  });

  mountSaves();
  mountMultiplayer();
  refreshButtons();
  setInterval(refreshPanel, 400);
  setInterval(showToasts, 250);
  refreshPanel();
}

function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  audio.applyVolumes();
  const b = document.querySelector('#mute-btn');
  if (b) b.textContent = settings.muted ? '🔇' : '🔊';
}

function refreshButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === ui.tool));
  document.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach((b) => {
    const w = b.dataset.weather;
    b.classList.toggle(
      'active',
      w === 'auto' ? sim.world.autoWeather : ui.weatherMode === 'region' ? ui.tool === 'weather' && ui.weatherBrush === w : !sim.world.autoWeather && w === sim.world.weather,
    );
  });
  document.querySelector('#weather-mode')?.classList.toggle('active', ui.weatherMode === 'region');
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
    const s = Number(b.dataset.speed);
    b.classList.toggle('active', s === 0 ? sim.paused : !sim.paused && s === sim.speed);
  });
}

function showToasts() {
  const box = $('#toasts');
  // Only the latest few: during fast-forward dozens can pile up at once.
  if (sim.toasts.length > 3) sim.toasts.splice(0, sim.toasts.length - 3);
  while (sim.toasts.length) {
    const t = sim.toasts.shift()!;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<b>${t.icon} ${esc(t.title)}</b><span>${esc(t.text)}</span>`;
    box.prepend(el);
    setTimeout(() => el.classList.add('out'), 4500);
    setTimeout(() => el.remove(), 5200);
    while (box.children.length > 3) box.lastElementChild?.remove();
  }
}

let lastTab = '';
let lastInspect = '';
let pressing = false;

function refreshPanel() {
  // Don't rebuild the panel under the player's hands (pressing, or a dropdown open).
  if (pressing || document.activeElement instanceof HTMLSelectElement) return;
  const w = sim.world;
  const alive = sim.villages.filter((v) => v.alive);
  const day = w.daylight();
  const tod = day > 0.7 ? 'Trưa' : day > 0.3 ? (w.time % w.dayLength < w.dayLength / 2 ? 'Sáng' : 'Chiều') : 'Đêm';
  const sea = Math.round((w.seaLevel - BASE_SEA) * 1000);
  const topEra = alive.reduce((m, v) => Math.max(m, v.era), 0);
  const believers = Array.from({ length: sim.gods }, (_, g) => `<span style="color:${GOD_COLORS[g]}">✨ ${alive.filter((v) => v.patron === g).length}</span>`).join(' ');
  const here = Math.max(0, Math.min(W * H - 1, Math.round(ui.view.y) * W + Math.round(ui.view.x)));

  $('#stats').innerHTML = `
    <div class="year">📅 Năm ${sim.year} · ${tod} · ${ERAS[topEra].icon} ${ERAS[topEra].name}</div>
    <div>Tại đây: ${WEATHER_LABEL[w.weatherAt(here)]} · 🌡️ ${w.tempAt(here).toFixed(0)}°C${w.autoWeather ? ' · 🔄' : ''} · 🌊 ${sea > 0 ? '+' : ''}${sea}</div>
    <div>👥 ${formatPop(alive.reduce((n, v) => n + v.people, 0))} dân <span class="muted">(${sim.humans.length} trên bản đồ)</span> · 🏘️ ${alive.length} quốc gia · ⚔️ ${sim.wars.length}</div>
    <div>🦌 ${sim.animals.count('deer')} · 🐺 ${sim.animals.count('wolf')} · ${believers} nước thờ thần</div>
  `;

  const h = sim.selectedHuman;
  const v = sim.selectedVillage;
  const inspect = h ? humanCard(h) + (v ? villageCard(v) : '') : v ? villageCard(v) : '';
  if (inspect !== lastInspect) {
    lastInspect = inspect;
    $('#inspect').innerHTML = inspect;
  }

  const wishCount = sim.wishes.length;
  document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === 'wishes') b.innerHTML = `🙏 Ước nguyện${wishCount ? ` <i class="badge">${wishCount}</i>` : ''}`;
  });

  const html = tab === 'wishes' ? wishesTab() : tab === 'tribes' ? tribesTab() : tab === 'history' ? historyTab() : achievementsTab();
  if (html !== lastTab) {
    lastTab = html;
    $('#tab-body').innerHTML = html;
  }
  refreshButtons();
}

function bar(label: string, value: number, color: string) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `<div class="bar"><span>${label}</span><div><i style="width:${pct}%;background:${color}"></i></div></div>`;
}

function humanCard(h: Human) {
  const v = h.village >= 0 ? sim.villages[h.village] : null;
  const carry = [h.carryFood ? `🌾 ${h.carryFood}` : '', h.carryWood ? `🪵 ${h.carryWood}` : ''].filter(Boolean).join(' ');
  const role = h.role === 'soldier' ? ` · ⚔️ Chiến binh (${ERAS[v?.era ?? 0].weapon})` : '';
  const leader = v && v.leaderId === h.id ? `<div class="leader">👑 ${v.culture.rulers[v.era]} của ${esc(v.name)}</div>` : '';
  return `
    <h3>🧑 ${esc(h.name)}, ${Math.floor(h.age / YEAR)} tuổi</h3>
    ${leader}
    <div class="muted">${v ? esc(v.name) : h.colonist ? `Đoàn khai hoang từ ${esc(h.origin)}` : 'Du mục'} · ${ACTION_LABEL[h.action]}${role}${carry ? ' · ' + carry : ''}</div>
    <p class="thought">💭 “${esc(h.thought || '...')}”</p>
    ${bar('No bụng', 1 - h.hunger, '#e0b84a')}
    ${bar('Ấm áp', h.warmth, '#e07a4a')}
    ${bar('Sức khỏe', h.health, '#5ad66a')}
  `;
}

function villageCard(v: Village) {
  const era = ERAS[v.era];
  const next = v.era < MAX_ERA ? ERAS[v.era + 1] : null;
  const progress = next ? (v.tech - era.tech) / (next.tech - era.tech) : 1;
  const history = [...v.history].reverse().slice(0, 14);
  const wars = [...v.enemies].map((e) => sim.villages[e]);
  return `
    <div class="tribe">
      <h3 style="color:${hex(v.color)}">${era.icon} ${esc(v.name)}${v.alive ? '' : v.absorbedBy >= 0 ? ' (đã bị sáp nhập)' : ' (đã biến mất)'}</h3>
      <div class="muted">${esc(v.culture.name)}${v.ruler ? ` · ${esc(v.ruler)}` : ''}</div>
      <div>👥 ${formatPop(v.people)} dân <span class="muted">(${v.pop} người đại diện, mỗi người ≈ ${formatPop(era.popScale)})</span></div>
      <div>🏠 ${v.houses.size} nhà · 🌾 ${v.farms.size} ruộng · Kho 🍞 ${Math.floor(v.food)} 🪵 ${v.wood}</div>
      ${nationBlock(v)}
      ${civics(v)}
      ${influences(v)}
      ${wars.length ? `<div class="war">⚔️ Đang chiến tranh với ${wars.map((o) => esc(o.name)).join(', ')} · hạ ${v.kills} / mất ${v.losses}</div>` : ''}
      ${bar(next ? `→ ${next.icon}` : 'Đỉnh cao', progress, '#7ab0ff')}
      ${Array.from({ length: sim.gods }, (_, g) => bar(`${v.patron === g ? '✨' : '🙏'} ${esc(sim.godNames[g].split(' ').slice(-1)[0])}`, v.faiths[g] / 100, GOD_COLORS[g])).join('')}
      <div class="muted">${v.patron >= 0 ? `Thờ ${esc(sim.godNames[v.patron])}` : `Thờ ${esc(v.culture.deity)}`}</div>
      <div class="tags">${describeTraits(v.culture.traits).map((t) => `<span>${t}</span>`).join('')}</div>
      <h4>📖 Truyền thuyết</h4>
      ${tribeStory(sim, v).map((p) => `<p class="story">${esc(p)}</p>`).join('')}
      <h4>📜 Sử ký</h4>
      <ul class="history">${history.map((e) => `<li><span class="muted">Năm ${e.year}</span> ${esc(e.text)}</li>`).join('')}</ul>
      ${v.alive ? `<div class="card-actions"><button data-focus="${v.id}">📍 Tới ${esc(v.base)}</button>${warPicker(v)}</div>` : ''}
    </div>
  `;
}

function nationBlock(v: Village) {
  const cap = v.capital;
  const cities = sim.citiesOf(cap);
  const names = (ids: Iterable<number>) =>
    [...ids]
      .map((i) => sim.villages[i])
      .filter((o) => o?.alive)
      .map((o) => esc(o.name))
      .join(', ');
  const army = { none: '', rally: '🚩 Quân đội đang tập hợp', march: '⚔️ Quân đội đang hành quân', siege: '🏰 Quân đội đang vây thành' }[cap.armyPhase];
  return `<div class="nation">
    ${v.isCapital ? `🏛️ Thủ đô của ${esc(v.nationName)}` : `🏙️ Thành phố của <b>${esc(v.nationName)}</b> (thủ đô ${esc(cap.base)})`}
    <br>🏘️ ${cities.length} thành phố · 👥 ${formatPop(cities.reduce((n, c) => n + c.people, 0))} dân cả nước
    ${cap.allies.size ? `<br>🛡️ Đồng minh: ${names(cap.allies)}` : ''}
    ${army ? `<br>${army}` : ''}
    ${v.trauma > 0.2 ? `<br>🥀 Tổn thương sau thảm họa: ${Math.round(v.trauma * 100)}%` : ''}
  </div>`;
}

function civics(v: Village) {
  const counts = new Map<number, number>();
  for (const k of v.buildings.values()) counts.set(k, (counts.get(k) ?? 0) + 1);
  if (!counts.size) return '';
  const items = [...counts].map(([k, n]) => `<span>${SPECIAL_LABEL[SPECIAL_KINDS[k]]}${n > 1 ? ` ×${n}` : ''}</span>`);
  return `<div class="tags civic">${items.join('')}</div>`;
}

function influences(v: Village) {
  const list = [...v.influences].filter(([, k]) => k >= 15).sort((a, b) => b[1] - a[1]);
  const partners = [...v.partners].map((p) => sim.villages[p]).filter((o) => o?.alive);
  if (!list.length && !partners.length) return '';
  return `<div class="exchange">${partners.length ? `🤝 Giao thương: ${partners.map((o) => esc(o.base)).join(', ')}` : ''}${
    list.length ? `<br>🎎 Ảnh hưởng văn hóa: ${list.map(([c, k]) => `${esc(cultureById(c).name)} ${Math.round(k)}%`).join(', ')}` : ''
  }</div>`;
}

function warPicker(v: Village) {
  const others = sim.villages.filter((o) => o.alive && o !== v && !v.enemies.has(o.id));
  if (!others.length) return '';
  return `<span class="war-pick"><select id="war-target">${others
    .map((o) => `<option value="${o.id}">${esc(o.name)}</option>`)
    .join('')}</select><button data-war="${v.id}">⚔️ Tuyên chiến</button></span>`;
}

function wishesTab() {
  if (!sim.wishes.length) {
    return `<p class="muted">Chưa có lời cầu nguyện nào. Các dân tộc sẽ cầu xin ${esc(sim.godName)} khi gặp khó khăn — hãy giữ đức tin của họ!</p>`;
  }
  return sim.wishes
    .map((wish) => {
      const v = sim.villages[wish.village];
      const left = Math.max(0, Math.ceil((wish.expires - sim.world.time) / 5) * 5);
      const mine = !sim.strictGods || wish.god === sim.me;
      const to = sim.gods > 1 ? `<span style="color:${GOD_COLORS[wish.god]}"> → ${esc(sim.godNames[wish.god])}</span>` : '';
      return `
        <div class="wish">
          <div><b style="color:${hex(v.color)}">${ERAS[v.era].icon} ${esc(v.name)}</b> <span class="muted">· đức tin ${Math.round(v.faith)} · còn ${left}s</span></div>
          <div class="wish-text">🙏 “${esc(wish.text)}”${to}</div>
          <div class="muted">${esc(wish.reason)}</div>
          ${
            mine
              ? `<div class="wish-actions">
            <button class="yes" data-wish="${wish.id}" data-answer="yes">✅ Đồng ý</button>
            <button class="no" data-wish="${wish.id}" data-answer="no">❌ Từ chối</button>
          </div>`
              : `<div class="muted">Lời cầu nguyện này dành cho ${esc(sim.godNames[wish.god])}.</div>`
          }
        </div>`;
    })
    .join('');
}

function tribesTab() {
  const list = sim.nations().sort((a, b) => sim.nationPop(b) - sim.nationPop(a));
  if (!list.length) return '<p class="muted">Chưa có bộ tộc nào. Những người du mục đang tìm đất lành...</p>';
  return `<p class="muted">Bấm vào một bộ tộc (hoặc dùng 🔍 Quan sát trên bản đồ) để nghe câu chuyện của họ.</p><ul class="tribes">${list
    .map((v) => {
      const flags = `${v.enemies.size ? '⚔️' : ''}${v.religion === 'god' ? '✨' : ''}${v.temple ? '⛩️' : ''}`;
      return `<li data-village="${v.id}" class="${v.alive ? '' : 'gone'}">
        <span class="dot" style="background:${hex(v.color)}"></span>
        <span class="tname">${ERAS[v.era].icon} ${esc(v.name)}</span>
        <span class="muted">${esc(v.culture.name)}</span>
        <span class="tpop">${formatPop(sim.citiesOf(v).reduce((n, c) => n + c.people, 0))} 👥 · ${sim.citiesOf(v).length} 🏙️ ${flags}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

function historyTab() {
  return `<ul id="log">${sim.log.map((e) => `<li><span class="muted">Năm ${e.year}</span> ${esc(e.msg)}</li>`).join('')}</ul>`;
}

function achievementsTab() {
  const got = sim.achieved.size;
  const timeline = [...sim.milestones].reverse();
  return `
    <div class="muted">Đã đạt ${got}/${ACHIEVEMENTS.length} thành tựu</div>
    <div class="achievements">${ACHIEVEMENTS.map((a) => {
      const year = sim.achieved.get(a.id);
      return `<div class="ach ${year ? 'got' : ''}" title="${esc(a.desc)}">
        <span class="aicon">${year ? a.icon : '🔒'}</span>
        <span><b>${esc(a.title)}</b><br><small>${esc(a.desc)}${year ? ` · năm ${year}` : ''}</small></span>
      </div>`;
    }).join('')}</div>
    <h4>🗓️ Dòng thời gian</h4>
    <ul class="history">${timeline.map((m) => `<li><span class="muted">Năm ${m.year}</span> ${m.icon} ${esc(m.title)}</li>`).join('') || '<li class="muted">Lịch sử chưa bắt đầu.</li>'}</ul>
  `;
}
