import { sim } from '../core';
import { session } from '../net/session';
import { type SaveMeta, deleteSave, exportFile, importFile, listSaves, loadFrom, saveTo } from '../save';

const SLOTS = ['1', '2', '3'];
const AUTO = 'auto';
const AUTOSAVE_MS = 3 * 60 * 1000;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const toast = (icon: string, title: string, text: string) => sim.toasts.push({ icon, title, text });

let modal: HTMLDivElement;

export function mountSaves() {
  modal = document.createElement('div');
  modal.id = 'saves';
  modal.hidden = true;
  document.body.append(modal);

  modal.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t === modal || t.closest('[data-close]')) return close();
    const b = t.closest<HTMLButtonElement>('button[data-act]');
    if (!b) return;
    const slot = b.dataset.slot!;
    try {
      b.disabled = true;
      switch (b.dataset.act) {
        case 'save':
          await saveTo(slot);
          toast('💾', 'Đã lưu', slot === AUTO ? 'Bản tự động' : `Ô lưu ${slot}`);
          break;
        case 'load':
          if (session?.together) {
            alert('Đang chơi chung: hãy rời phòng trước khi tải thế giới khác.');
            break;
          }
          if (!confirm('Tải thế giới này? Thế giới hiện tại chưa lưu sẽ mất.')) break;
          await loadFrom(slot);
          toast('📂', 'Đã tải thế giới', `Năm ${sim.year}`);
          close();
          return;
        case 'delete':
          if (!confirm('Xóa bản lưu này?')) break;
          await deleteSave(slot);
          break;
        case 'export':
          await exportFile();
          break;
        case 'import':
          modal.querySelector<HTMLInputElement>('#import-file')!.click();
          break;
      }
    } catch (err) {
      alert(`Lỗi: ${(err as Error).message}`);
    } finally {
      b.disabled = false;
    }
    render();
  });

  modal.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await importFile(file);
      toast('📥', 'Đã nhập thế giới', `${file.name} · năm ${sim.year}`);
      close();
    } catch (err) {
      alert(`Không đọc được file: ${(err as Error).message}`);
    }
    input.value = '';
  });

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveTo(AUTO).then(() => toast('💾', 'Đã lưu nhanh', 'Bản tự động'));
    }
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  setInterval(() => {
    if (sim.humans.length) saveTo(AUTO).catch(() => {});
  }, AUTOSAVE_MS);
}

export async function openSaves() {
  modal.hidden = false;
  await render();
}

function close() {
  modal.hidden = true;
}

function card(slot: string, m: SaveMeta | undefined) {
  const title = slot === AUTO ? '🔄 Tự động lưu' : `Ô lưu ${slot}`;
  const body = m
    ? `<b>${esc(m.name)}</b>
       <div class="muted">Năm ${m.year} · ${esc(m.era)} · ${m.nations} quốc gia · ${esc(m.people)} dân</div>
       <div class="muted">${new Date(m.savedAt).toLocaleString('vi-VN')} · ${Math.round(m.size / 1024)} KB</div>`
    : '<div class="muted">Trống</div>';
  return `<div class="slot">
    <div class="slot-title">${title}</div>${body}
    <div class="slot-actions">
      ${slot === AUTO ? '' : `<button data-act="save" data-slot="${slot}">💾 Lưu</button>`}
      ${m ? `<button data-act="load" data-slot="${slot}">📂 Tải</button><button data-act="delete" data-slot="${slot}">🗑️</button>` : ''}
    </div>
  </div>`;
}

async function render() {
  const saves = new Map((await listSaves()).map((m) => [m.slot, m]));
  modal.innerHTML = `<div class="dialog">
    <div class="dialog-head"><h3>💾 Lưu & tải thế giới</h3><button data-close>✕</button></div>
    ${card(AUTO, saves.get(AUTO))}
    ${SLOTS.map((s) => card(s, saves.get(s))).join('')}
    <div class="slot-actions file">
      <button data-act="export" data-slot="file">📤 Xuất ra file .chuatroi</button>
      <button data-act="import" data-slot="file">📥 Nhập file</button>
      <input id="import-file" type="file" accept=".chuatroi" hidden />
    </div>
    <p class="muted">Tự động lưu mỗi 3 phút · ⌘S / Ctrl+S để lưu nhanh. File .chuatroi có thể gửi cho bạn bè để họ mở thế giới của bạn.</p>
  </div>`;
}
