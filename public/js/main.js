/**
 * main.js — Vanilla JS untuk halaman publik blog
 * Meliputi: komentar, like/dislike, guest identity
 */

'use strict';

/* ─────────────────────────────────────────────
   GUEST IDENTITY
   Menyimpan guestId (UUID) & guestName di localStorage
───────────────────────────────────────────── */
const GuestIdentity = (() => {
  const KEY_ID   = 'blog_guest_id';
  const KEY_NAME = 'blog_guest_name';

  function getId() {
    let id = localStorage.getItem(KEY_ID);
    if (!id) {
      id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(KEY_ID, id);
    }
    return id;
  }

  function getName()       { return localStorage.getItem(KEY_NAME) || ''; }
  function setName(name)   { localStorage.setItem(KEY_NAME, name.trim()); }
  function clearName()     { localStorage.removeItem(KEY_NAME); }

  return { getId, getName, setName, clearName };
})();


/* ─────────────────────────────────────────────
   TOAST NOTIFICATION
   Tampil pesan ringan tanpa alert()
───────────────────────────────────────────── */
const Toast = (() => {
  let container = null;

  function ensureContainer() {
    if (container) return;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }

  function show(message, type = 'info') {
    ensureContainer();
    const colors = {
      success : '#16a34a',
      error   : '#dc2626',
      info    : '#1e1a12',
    };
    const toast = document.createElement('div');
    toast.style.cssText = `
      background:${colors[type] || colors.info};color:#fff;
      padding:12px 18px;border-radius:10px;font-size:14px;
      box-shadow:0 4px 14px rgba(0,0,0,.25);
      max-width:320px;line-height:1.4;
      animation:slideIn .2s ease;
    `;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut .3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Inject keyframes once
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeOut  { to   { opacity:0; transform:translateY(8px); } }
  `;
  document.head.appendChild(style);

  return { show };
})();


/* ─────────────────────────────────────────────
   REACTION (LIKE / DISLIKE)
───────────────────────────────────────────── */
const Reaction = (() => {
  function init() {
    const likeBtn    = document.getElementById('likeBtn');
    const dislikeBtn = document.getElementById('dislikeBtn');
    if (!likeBtn || !dislikeBtn) return;

    const articleId = likeBtn.dataset.articleId;
    const guestId   = GuestIdentity.getId();

    // Highlight tombol jika sudah pernah bereaksi
    const initialLikes    = JSON.parse(document.getElementById('initialLikes').textContent    || '[]');
    const initialDislikes = JSON.parse(document.getElementById('initialDislikes').textContent || '[]');

    if (initialLikes.includes(guestId))    likeBtn.classList.add('active-like');
    if (initialDislikes.includes(guestId)) dislikeBtn.classList.add('active-dislike');

    likeBtn.addEventListener('click',    () => sendReact(articleId, guestId, 'like'));
    dislikeBtn.addEventListener('click', () => sendReact(articleId, guestId, 'dislike'));
  }

  async function sendReact(articleId, guestId, type) {
    try {
      const res  = await fetch(`/articles/${articleId}/react`, {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify({ guestId, type }),
      });
      const data = await res.json();
      if (!data.success) return;

      document.getElementById('likeCount').textContent    = data.likes;
      document.getElementById('dislikeCount').textContent = data.dislikes;

      const likeBtn    = document.getElementById('likeBtn');
      const dislikeBtn = document.getElementById('dislikeBtn');

      // Toggle active state
      if (type === 'like') {
        likeBtn.classList.toggle('active-like');
        dislikeBtn.classList.remove('active-dislike');
      } else {
        dislikeBtn.classList.toggle('active-dislike');
        likeBtn.classList.remove('active-like');
      }
    } catch {
      Toast.show('Gagal mengirim reaksi', 'error');
    }
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   COMMENT SYSTEM
───────────────────────────────────────────── */
const Comments = (() => {
  const guestId = GuestIdentity.getId();
  let articleId = null;

  function init() {
    const section = document.getElementById('comments-section');
    if (!section) return;

    articleId = section.dataset.articleId;

    initGuestName();
    initForm();
    initDeleteButtons();
    showOwnDeleteButtons();
  }

  /* ── Guest name UI ── */
  function initGuestName() {
    const nameWrap    = document.getElementById('nameInputWrapper');
    const savedWrap   = document.getElementById('savedNameDisplay');
    const nameInput   = document.getElementById('commentName');
    const savedText   = document.getElementById('savedNameText');
    const saveBtn     = document.getElementById('saveNameBtn');
    const changeBtn   = document.getElementById('changeNameBtn');

    if (!nameWrap) return;

    const saved = GuestIdentity.getName();
    if (saved) {
      nameWrap.classList.add('hidden');
      savedWrap.classList.remove('hidden');
      savedText.textContent = saved;
    }

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { Toast.show('Masukkan nama Anda', 'error'); return; }
      GuestIdentity.setName(name);
      nameWrap.classList.add('hidden');
      savedWrap.classList.remove('hidden');
      savedText.textContent = name;
      Toast.show('Nama tersimpan ✓', 'success');
    });

    changeBtn.addEventListener('click', () => {
      GuestIdentity.clearName();
      nameInput.value = '';
      nameWrap.classList.remove('hidden');
      savedWrap.classList.add('hidden');
    });

    // Simpan jika tekan Enter di input nama
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
    });
  }

  /* ── Submit form ── */
  function initForm() {
    const form = document.getElementById('commentForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name    = GuestIdentity.getName() || document.getElementById('commentName')?.value.trim();
      const content = document.getElementById('commentText').value.trim();
      const btn     = form.querySelector('button[type="submit"]');

      if (!name)    { Toast.show('Isi nama Anda terlebih dahulu', 'error'); return; }
      if (!content) { Toast.show('Tulis komentar terlebih dahulu', 'error'); return; }

      btn.disabled    = true;
      btn.textContent = 'Mengirim…';

      try {
        const res  = await fetch(`/articles/${articleId}/comment`, {
          method  : 'POST',
          headers : { 'Content-Type': 'application/json' },
          body    : JSON.stringify({ guestName: name, guestId, content }),
        });
        const data = await res.json();

        if (data.success) {
          document.getElementById('commentText').value = '';
          prependComment(data.comment, true);
          updateCount(1);
          Toast.show('Komentar berhasil dikirim ✓', 'success');
        } else {
          Toast.show(data.message || 'Gagal mengirim komentar', 'error');
        }
      } catch {
        Toast.show('Koneksi gagal, coba lagi', 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = 'Kirim Komentar';
      }
    });
  }

  /* ── Tampilkan tombol hapus untuk komentar milik sendiri ── */
  function showOwnDeleteButtons() {
    document.querySelectorAll('[data-comment-guest-id]').forEach(btn => {
      if (btn.dataset.commentGuestId === guestId) {
        btn.classList.remove('hidden');
      }
    });
  }

  /* ── Event delegation untuk tombol hapus ── */
  function initDeleteButtons() {
    const list = document.getElementById('commentsList');
    if (!list) return;

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-delete-comment]');
      if (!btn) return;

      const commentId    = btn.dataset.deleteComment;
      const ownerGuestId = btn.dataset.commentGuestId;

      if (ownerGuestId !== guestId) {
        Toast.show('Anda tidak bisa menghapus komentar ini', 'error');
        return;
      }

      if (!confirm('Hapus komentar ini?')) return;

      btn.disabled = true;
      try {
        const res  = await fetch(`/articles/${articleId}/comment/${commentId}`, {
          method  : 'DELETE',
          headers : { 'Content-Type': 'application/json' },
          body    : JSON.stringify({ guestId }),
        });
        const data = await res.json();

        if (data.success) {
          document.getElementById(`comment-${commentId}`)?.remove();
          updateCount(-1);
          Toast.show('Komentar dihapus', 'success');
        } else {
          Toast.show(data.message || 'Gagal menghapus', 'error');
          btn.disabled = false;
        }
      } catch {
        Toast.show('Koneksi gagal', 'error');
        btn.disabled = false;
      }
    });
  }

  /* ── Render & prepend komentar baru ke DOM ── */
  function prependComment(comment, isOwn = false) {
    const list = document.getElementById('commentsList');
    const el   = buildCommentEl(comment, isOwn);
    list.insertBefore(el, list.firstChild);
  }

  function buildCommentEl(comment, isOwn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'bg-white rounded-xl border border-ink-200 p-5 comment-item';
    wrapper.id = `comment-${comment._id}`;

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    wrapper.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 bg-accent-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span class="text-accent-600 font-medium text-sm">${escapeHtml(comment.guestName.charAt(0).toUpperCase())}</span>
          </div>
          <div>
            <p class="font-semibold text-ink-800 text-sm">${escapeHtml(comment.guestName)}</p>
            <p class="text-xs text-ink-400 mb-2">${dateStr}</p>
            <p class="text-ink-700 text-sm leading-relaxed">${escapeHtml(comment.content)}</p>
          </div>
        </div>
        ${isOwn ? `
          <button
            class="flex-shrink-0 text-ink-300 hover:text-red-500 transition"
            data-delete-comment="${comment._id}"
            data-comment-guest-id="${guestId}"
            title="Hapus komentar"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>` : ''}
      </div>`;

    return wrapper;
  }

  function updateCount(delta) {
    const el = document.getElementById('commentCount');
    if (el) el.textContent = Math.max(0, parseInt(el.textContent || '0') + delta);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Reaction.init();
  Comments.init();
});
