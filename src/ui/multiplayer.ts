import { sim } from '../core';
import { endSession, newRoomCode, session, startSession } from '../net/session';
import { currentUser, displayName, onUser, online, signInWithGoogle, signOut } from '../net/supabase';
import { GOOGLE_CLIENT_ID, googleProfile, googleSignOut, onProfile, renderGoogleButton } from '../net/google';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
export const GOD_COLORS = ['#ffe14d', '#c08aff'];

let modal: HTMLDivElement;
let pill: HTMLButtonElement;

const STATE_LABEL: Record<string, string> = {
  connecting: 'Đang kết nối…',
  waiting: 'Chờ người chơi thứ hai',
  syncing: 'Đang đồng bộ thế giới…',
  playing: 'Đang chơi chung',
  alone: 'Người kia đã rời đi',
  closed: 'Đã rời phòng',
};

export function mountMultiplayer() {
  modal = document.createElement('div');
  modal.id = 'mp';
  modal.className = 'modal';
  modal.hidden = true;
  document.body.append(modal);

  pill = document.querySelector<HTMLButtonElement>('#mp-btn')!;
  pill.addEventListener('click', () => open());

  modal.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t === modal || t.closest('[data-close]')) return close();
    const b = t.closest<HTMLButtonElement>('button[data-act]');
    if (!b) return;
    try {
      switch (b.dataset.act) {
        case 'login':
          await signInWithGoogle();
          break;
        case 'logout':
          if (online) await signOut();
          else googleSignOut();
          break;
        case 'host':
          begin(newRoomCode(), 'host');
          break;
        case 'join': {
          const code = modal.querySelector<HTMLInputElement>('#room-code')!.value.trim().toUpperCase();
          if (code.length < 4) return alert('Nhập mã phòng gồm 6 ký tự');
          begin(code, 'guest');
          break;
        }
        case 'leave':
          endSession();
          break;
        case 'copy':
          await navigator.clipboard.writeText(inviteLink());
          b.textContent = '✅ Đã sao chép';
          return;
        case 'chat':
          sendChat();
          return;
      }
    } catch (err) {
      alert((err as Error).message);
    }
    render();
  });
  modal.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).id === 'chat-input' && e.key === 'Enter') sendChat();
    e.stopPropagation(); // typing here must not trigger game shortcuts
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  onUser(() => {
    if (!modal.hidden) render();
    updatePill();
  });
  onProfile(() => {
    if (!modal.hidden) render();
  });

  // Invitation links: ?room=CODE opens the join dialog.
  const code = new URLSearchParams(location.search).get('room');
  if (code) {
    open();
    setTimeout(() => {
      const input = modal.querySelector<HTMLInputElement>('#room-code');
      if (input) input.value = code;
    }, 0);
  }
  setInterval(updatePill, 500);
}

function inviteLink() {
  return `${location.origin}${location.pathname}?room=${session?.room ?? ''}`;
}

function myName(role: 'host' | 'guest') {
  if (online) return displayName(currentUser());
  const typed = modal.querySelector<HTMLInputElement>('#god-input')?.value.trim();
  return googleProfile()?.name || typed || (role === 'host' ? 'Đấng Sáng Thế' : 'Đấng Hắc Nguyệt');
}

function begin(room: string, role: 'host' | 'guest') {
  if (online && !currentUser()) throw new Error('Hãy đăng nhập bằng Google trước');
  const s = startSession(room, role, myName(role), true);
  s.onChange = () => {
    if (!modal.hidden) render();
    updatePill();
  };
}

function sendChat() {
  const input = modal.querySelector<HTMLInputElement>('#chat-input');
  if (!input || !session) return;
  session.say(input.value);
  input.value = '';
  render();
  modal.querySelector<HTMLInputElement>('#chat-input')?.focus();
}

function updatePill() {
  if (!pill) return;
  if (!session || session.state === 'closed') {
    pill.textContent = '👥 Chơi chung';
    pill.classList.remove('active');
    return;
  }
  const peer = session.together ? ` · ${session.peerName || 'vị thần kia'}` : '';
  pill.textContent = `👥 ${session.room}${peer}`;
  pill.classList.toggle('active', session.together);
  pill.title = STATE_LABEL[session.state];
}

function open() {
  modal.hidden = false;
  render();
}
export const openMultiplayer = open;
function close() {
  modal.hidden = true;
}

function render() {
  const user = currentUser();
  const gp = googleProfile();
  const account = online
    ? user
      ? `<div class="mp-user">${user.user_metadata?.avatar_url ? `<img src="${esc(user.user_metadata.avatar_url)}" alt="">` : '👤'} <b>${esc(displayName(user))}</b> <button data-act="logout">Đăng xuất</button></div>`
      : `<button data-act="login" class="google">🔐 Đăng nhập bằng Google</button>`
    : gp
      ? `<div class="mp-user">${gp.picture ? `<img src="${esc(gp.picture)}" alt="" referrerpolicy="no-referrer">` : '👤'} <b>${esc(gp.name)}</b> <button data-act="logout">Đăng xuất</button></div>`
      : `${GOOGLE_CLIENT_ID ? '<div id="gsi-btn" class="gsi"></div><div class="muted">hoặc</div>' : ''}
         <div class="slot-actions"><input id="god-input" maxlength="32" placeholder="Danh xưng vị thần của bạn"></div>`;

  let room = '';
  if (session && session.state !== 'closed') {
    const gods = sim.godNames
      .slice(0, 2)
      .map((n, g) => `<span style="color:${GOD_COLORS[g]}">${g === sim.me ? '⭐ ' : ''}${esc(n)}</span>`)
      .join(' &amp; ');
    room = `
      <div class="slot">
        <div class="slot-title">Phòng <b class="code">${esc(session.room)}</b> · ${STATE_LABEL[session.state]}</div>
        ${session.error ? `<div class="war">⚠️ ${esc(session.error)}</div>` : ''}
        ${session.role === 'host' ? `<div class="muted">Gửi mã phòng hoặc đường link cho bạn của bạn.</div><div class="slot-actions"><button data-act="copy">🔗 Sao chép link mời</button></div>` : ''}
        ${session.together ? `<div>Hai vị thần: ${gods}</div>` : ''}
        <div class="slot-actions"><button data-act="leave">🚪 Rời phòng</button></div>
      </div>
      ${
        session.together
          ? `<div class="slot chat">
              <div class="chat-log">${session.chat
                .slice(-30)
                .map((c) => `<div><b style="color:${GOD_COLORS[c.god]}">${esc(sim.godNames[c.god])}:</b> ${esc(c.text)}</div>`)
                .join('') || '<span class="muted">Chưa có tin nhắn.</span>'}</div>
              <div class="slot-actions"><input id="chat-input" maxlength="200" placeholder="Nhắn cho vị thần kia..."><button data-act="chat">Gửi</button></div>
            </div>`
          : ''
      }`;
  } else {
    room = `
      <div class="slot">
        <div class="slot-title">Tạo thế giới chung</div>
        <div class="muted">Bạn là thần thứ nhất; thế giới hiện tại sẽ được chia sẻ.</div>
        <div class="slot-actions"><button data-act="host">🌍 Tạo phòng</button></div>
      </div>
      <div class="slot">
        <div class="slot-title">Vào thế giới của bạn bè</div>
        <div class="slot-actions"><input id="room-code" maxlength="6" placeholder="Mã phòng" style="text-transform:uppercase"><button data-act="join">🚪 Vào phòng</button></div>
      </div>`;
  }

  queueMicrotask(() => {
    const el = modal.querySelector<HTMLElement>('#gsi-btn');
    if (el) void renderGoogleButton(el);
  });
  modal.innerHTML = `<div class="dialog">
    <div class="dialog-head"><h3>👥 Chơi chung — hai vị thần</h3><button data-close>✕</button></div>
    ${account}
    ${room}
    <p class="muted">Kết nối trực tiếp giữa hai trình duyệt (P2P) — không cần server. Hai vị thần cùng cai quản một thế giới: mỗi dân tộc có thể thờ thần này hoặc thần kia, cầu xin đúng vị thần họ tin. Mọi thao tác của bạn đều hiện ra ở thế giới của người kia.</p>
  </div>`;
}
