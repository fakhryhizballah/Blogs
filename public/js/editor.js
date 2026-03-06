/**
 * editor.js — Vanilla JS untuk halaman article editor (admin)
 * Konten ditulis dalam Markdown → disimpan sebagai contentRaw
 * Server mengkonversi ke HTML dengan marked.js saat save
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   TOOLBAR EDITOR
═══════════════════════════════════════════════════════════════════ */
const EditorToolbar = (() => {
  let ta = null; // textarea #contentEditor

  // Definisi semua aksi toolbar
  const ACTIONS = {
    bold         : { wrap: ['**', '**'],   placeholder: 'teks tebal' },
    italic       : { wrap: ['*', '*'],     placeholder: 'teks miring' },
    strikethrough: { wrap: ['~~', '~~'],   placeholder: 'teks coret' },
    h2           : { line: '## ',          placeholder: 'Judul Besar' },
    h3           : { line: '### ',         placeholder: 'Sub Judul' },
    h4           : { line: '#### ',        placeholder: 'Sub-Sub Judul' },
    code         : { wrap: ['`', '`'],     placeholder: 'kode' },
    codeblock    : { block: '```\n$1\n```',placeholder: 'kode di sini' },
    quote        : { line: '> ',           placeholder: 'teks kutipan' },
    ul           : { line: '- ',           placeholder: 'item daftar' },
    ol           : { line: '1. ',          placeholder: 'item bernomor' },
    hr           : { insert: '\n\n---\n\n' },
    link         : { snippet: '[teks link](https://url.com)' },
    image        : { snippet: '![deskripsi gambar](https://url-gambar.com)' },
    table        : { insert: '\n| Kolom 1 | Kolom 2 | Kolom 3 |\n|---------|---------|----------|\n| data    | data    | data     |\n' },
  };

  function init() {
    ta = document.getElementById('contentEditor');
    if (!ta) return;

    const toolbar = document.getElementById('editorToolbar');
    if (!toolbar) return;

    // Event delegation — satu listener untuk semua tombol
    toolbar.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault(); // cegah textarea kehilangan fokus
      applyAction(btn.dataset.action);
    });

    // Tab → 2 spasi
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        insertAt(ta.selectionStart, '  ');
      }
    });

    // Keyboard shortcuts
    ta.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'b') { e.preventDefault(); applyAction('bold'); }
      if (e.key === 'i') { e.preventDefault(); applyAction('italic'); }
      if (e.key === 'k') { e.preventDefault(); applyAction('link'); }
    });

    // Live update preview & word count saat mengetik
    ta.addEventListener('input', () => {
      LivePreview.update();
      updateWordCount();
    });

    updateWordCount();
  }

  function applyAction(name) {
    if (!ta) return;
    const cfg     = ACTIONS[name];
    if (!cfg) return;

    const start    = ta.selectionStart;
    const end      = ta.selectionEnd;
    const selected = ta.value.slice(start, end);

    if (cfg.wrap) {
      const [pre, post] = cfg.wrap;
      // Toggle: jika sudah wrapped → unwrap
      const before = ta.value.slice(Math.max(0, start - pre.length), start);
      const after  = ta.value.slice(end, end + post.length);
      if (before === pre && after === post) {
        // Unwrap
        replaceRange(
          ta.value.slice(0, start - pre.length) + selected + ta.value.slice(end + post.length),
          start - pre.length, start - pre.length + selected.length
        );
      } else {
        const text = selected || cfg.placeholder;
        const repl = pre + text + post;
        replaceRange(
          ta.value.slice(0, start) + repl + ta.value.slice(end),
          start + pre.length,
          start + pre.length + text.length
        );
      }

    } else if (cfg.line) {
      // Prefix setiap baris yang terseleksi
      const lStart = ta.value.lastIndexOf('\n', start - 1) + 1;
      const lEnd   = ta.value.indexOf('\n', end);
      const ePos   = lEnd === -1 ? ta.value.length : lEnd;
      const lines  = ta.value.slice(lStart, ePos).split('\n');
      const newLines = lines.map(l => {
        // Toggle: hapus prefix jika sudah ada
        if (l.startsWith(cfg.line)) return l.slice(cfg.line.length);
        return cfg.line + (l || cfg.placeholder);
      });
      const newText = newLines.join('\n');
      replaceRange(
        ta.value.slice(0, lStart) + newText + ta.value.slice(ePos),
        lStart, lStart + newText.length
      );

    } else if (cfg.block) {
      const text = selected || cfg.placeholder;
      const repl = '\n' + cfg.block.replace('$1', text) + '\n';
      replaceRange(
        ta.value.slice(0, start) + repl + ta.value.slice(end),
        start + 4, start + 4 + text.length
      );

    } else if (cfg.insert) {
      insertAt(start, cfg.insert);

    } else if (cfg.snippet) {
      const repl = selected
        ? cfg.snippet.replace('teks link', selected).replace('deskripsi gambar', selected)
        : cfg.snippet;
      replaceRange(
        ta.value.slice(0, start) + repl + ta.value.slice(end),
        start, start + repl.length
      );
    }

    ta.focus();
    LivePreview.update();
  }

  function replaceRange(newValue, selFrom, selTo) {
    ta.value = newValue;
    ta.setSelectionRange(selFrom, selTo);
  }

  function insertAt(pos, text) {
    ta.value = ta.value.slice(0, pos) + text + ta.value.slice(pos);
    ta.setSelectionRange(pos + text.length, pos + text.length);
  }

  function updateWordCount() {
    const el = document.getElementById('wordCount');
    if (!el || !ta) return;
    const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    const mins  = Math.max(1, Math.ceil(words / 200));
    el.textContent = `${words.toLocaleString()} kata · ~${mins} mnt baca`;
  }

  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════
   LIVE PREVIEW
   Gunakan marked.js (CDN) untuk render Markdown → HTML
═══════════════════════════════════════════════════════════════════ */
const LivePreview = (() => {
  let ta       = null;
  let pane     = null;
  let body     = null;
  let toggleBtn = null;
  let active   = false;

  function init() {
    ta        = document.getElementById('contentEditor');
    pane      = document.getElementById('previewPane');
    body      = document.getElementById('previewContent');
    toggleBtn = document.getElementById('previewToggle');
    if (!ta || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      active = !active;
      if (active) {
        update();
        pane.classList.remove('hidden');
        ta.classList.add('hidden');
        toggleBtn.innerHTML = '✏️ Edit';
        toggleBtn.classList.add('bg-accent-500/10', 'text-accent-600', 'border-accent-300');
        toggleBtn.classList.remove('bg-ink-100', 'text-ink-600');
      } else {
        pane.classList.add('hidden');
        ta.classList.remove('hidden');
        toggleBtn.innerHTML = '👁 Preview';
        toggleBtn.classList.remove('bg-accent-500/10', 'text-accent-600', 'border-accent-300');
        toggleBtn.classList.add('bg-ink-100', 'text-ink-600');
      }
    });
  }

  function update() {
    if (!active || !ta || !body) return;

    // Gunakan marked jika tersedia (dimuat via CDN di head.ejs admin)
    if (typeof window.marked !== 'undefined') {
      body.innerHTML = window.marked.parse(ta.value || '_Belum ada konten..._');
    } else {
      // Fallback parser sederhana jika marked belum load
      body.innerHTML = simpleMarkdown(ta.value);
    }
  }

  // Fallback markdown parser (basic)
  function simpleMarkdown(md) {
    if (!md) return '<p class="text-ink-400 italic">Belum ada konten…</p>';
    let h = md
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm,  '<h3>$1</h3>')
      .replace(/^## (.+)$/gm,   '<h2>$1</h2>')
      .replace(/^# (.+)$/gm,    '<h1>$1</h1>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,         '<em>$1</em>')
      .replace(/~~(.+?)~~/g,         '<del>$1</del>')
      .replace(/```([\s\S]+?)```/g,  '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g,         '<code>$1</code>')
      .replace(/^> (.+)$/gm,         '<blockquote>$1</blockquote>')
      .replace(/^---$/gm,            '<hr>')
      .replace(/^- (.+)$/gm,         '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm,     '<li>$1</li>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,  '<a href="$2" target="_blank">$1</a>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g,   '<br>');
    return '<p>' + h + '</p>';
  }

  return { init, update };
})();


/* ═══════════════════════════════════════════════════════════════════
   TAG MANAGER
   Chip visual, Enter/koma untuk tambah, Backspace untuk hapus terakhir
═══════════════════════════════════════════════════════════════════ */
const TagManager = (() => {
  let tags        = [];
  let hiddenInput = null;
  let chipsWrap   = null;
  let inputField  = null;

  function init() {
    chipsWrap   = document.getElementById('tagChipsContainer');
    inputField  = document.getElementById('tagInputField');
    hiddenInput = document.getElementById('tagsHidden');
    if (!chipsWrap || !inputField || !hiddenInput) return;

    // Muat tag awal (mode edit)
    const init = hiddenInput.value;
    if (init) init.split(',').map(t => t.trim()).filter(Boolean).forEach(addTag);

    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Backspace' && inputField.value === '' && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      }
    });
    inputField.addEventListener('blur', commit);

    // Event delegation hapus chip
    chipsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-tag]');
      if (btn) removeTag(btn.dataset.removeTag);
      else     inputField.focus();
    });
  }

  function commit() {
    const val = inputField.value.replace(/,/g,'').trim();
    if (val) { addTag(val); inputField.value = ''; }
  }

  function addTag(raw) {
    const tag = raw.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g,'-').replace(/^-|-$/g,'');
    if (!tag || tags.includes(tag) || tags.length >= 10) return;
    tags.push(tag);
    render();
    sync();
  }

  function removeTag(tag) {
    tags = tags.filter(t => t !== tag);
    render();
    sync();
  }

  function render() {
    chipsWrap.querySelectorAll('.tag-chip').forEach(el => el.remove());
    const frag = document.createDocumentFragment();
    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip inline-flex items-center gap-1 px-2.5 py-1 bg-accent-500/10 text-accent-700 rounded-full text-xs font-medium border border-accent-200 select-none';
      chip.innerHTML = `<span>#${esc(tag)}</span>
        <button type="button" data-remove-tag="${esc(tag)}"
          class="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-accent-300 text-accent-500 hover:text-white transition leading-none text-xs"
          title="Hapus">×</button>`;
      frag.appendChild(chip);
    });
    chipsWrap.insertBefore(frag, inputField.parentElement);

    const hint = document.getElementById('tagHint');
    if (hint) hint.textContent = tags.length ? `${tags.length}/10 topik ditambahkan` : 'Tekan Enter atau koma untuk menambah topik';
  }

  function sync() { hiddenInput.value = tags.join(', '); }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════
   MEDIA MANAGER
═══════════════════════════════════════════════════════════════════ */
const MediaManager = (() => {
  let files       = [];
  let hiddenInput = null;
  let listEl      = null;
  let activeType  = 'image';

  const CFG = {
    image: { label: 'Foto',  icon: '🖼️', ph: 'https://cdn.example.com/foto.jpg' },
    video: { label: 'Video', icon: '🎥', ph: 'https://cdn.example.com/video.mp4' },
    pdf  : { label: 'PDF',   icon: '📄', ph: 'https://cdn.example.com/dokumen.pdf' },
  };

  function init() {
    hiddenInput = document.getElementById('mediaFilesInput');
    listEl      = document.getElementById('mediaList');
    if (!hiddenInput || !listEl) return;

    try { files = JSON.parse(hiddenInput.value || '[]'); } catch { files = []; }

    // Tombol tipe media
    document.querySelectorAll('[data-media-type]').forEach(btn => {
      btn.addEventListener('click', () => openPanel(btn.dataset.mediaType));
    });

    document.getElementById('addMediaBtn')?.addEventListener('click', addFromInput);

    const urlIn = document.getElementById('mediaUrlInput');
    urlIn?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFromInput(); } });

    document.getElementById('closeUploadPanel')?.addEventListener('click', closePanel);

    // Hapus media via event delegation
    listEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-remove-media]');
      if (btn) remove(parseInt(btn.dataset.removeMedia, 10));
    });

    render();
  }

  function openPanel(type) {
    activeType = type;
    const panel = document.getElementById('uploadPanel');
    if (!panel) return;
    document.getElementById('uploadTypeLabel').textContent  = CFG[type].label;
    document.getElementById('mediaUrlInput').placeholder    = CFG[type].ph;
    document.getElementById('mediaUrlInput').value          = '';
    document.getElementById('mediaNameInput').value         = '';
    panel.classList.remove('hidden');
    document.getElementById('mediaUrlInput').focus();
    document.querySelectorAll('[data-media-type]').forEach(b => b.classList.remove('ring-2','ring-accent-400'));
    document.querySelector(`[data-media-type="${type}"]`)?.classList.add('ring-2','ring-accent-400');
  }

  function closePanel() {
    document.getElementById('uploadPanel')?.classList.add('hidden');
    document.querySelectorAll('[data-media-type]').forEach(b => b.classList.remove('ring-2','ring-accent-400'));
  }

  function addFromInput() {
    const url  = document.getElementById('mediaUrlInput').value.trim();
    const name = document.getElementById('mediaNameInput').value.trim() || url.split('/').pop().split('?')[0] || 'file';
    if (!url) return flash('mediaUrlInput', 'Masukkan URL file');
    try { new URL(url); } catch { return flash('mediaUrlInput', 'Format URL tidak valid'); }
    files.push({ type: activeType, url, name });
    sync(); render(); closePanel();
  }

  function remove(i) { files.splice(i, 1); sync(); render(); }

  function render() {
    if (!listEl) return;
    if (!files.length) {
      listEl.innerHTML = '<p class="text-sm text-ink-400 col-span-3 py-3 italic">Belum ada lampiran</p>';
      return;
    }
    listEl.innerHTML = files.map((m, i) => `
      <div class="relative group rounded-xl border border-ink-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
        ${m.type === 'image'
          ? `<img src="${esc(m.url)}" alt="${esc(m.name)}" class="w-full h-24 object-cover bg-ink-100" onerror="this.src='/images/broken.png'">`
          : m.type === 'video'
          ? `<video src="${esc(m.url)}" class="w-full h-24 bg-ink-900"></video>`
          : `<div class="w-full h-24 flex items-center justify-center bg-red-50 text-4xl">📄</div>`}
        <div class="p-2 flex items-center gap-1.5">
          <span class="text-sm">${CFG[m.type]?.icon}</span>
          <p class="text-xs text-ink-600 truncate" title="${esc(m.name)}">${esc(m.name)}</p>
        </div>
        <button type="button" data-remove-media="${i}"
          class="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow">
          ×</button>
      </div>`).join('');
  }

  function sync() { if (hiddenInput) hiddenInput.value = JSON.stringify(files); }

  function flash(id, msg) {
    const input = document.getElementById(id);
    if (!input) return;
    input.classList.add('border-red-400','focus:ring-red-400');
    let err = input.parentElement.querySelector('.field-error');
    if (!err) { err = document.createElement('p'); err.className = 'field-error text-xs text-red-500 mt-1'; input.parentElement.appendChild(err); }
    err.textContent = msg;
    input.focus();
    setTimeout(() => { input.classList.remove('border-red-400','focus:ring-red-400'); err?.remove(); }, 2500);
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════
   COVER IMAGE PREVIEW
═══════════════════════════════════════════════════════════════════ */
const CoverPreview = (() => {
  function init() {
    const input   = document.getElementById('coverImageUrl');
    const wrap    = document.getElementById('coverPreview');
    const img     = document.getElementById('coverPreviewImg');
    const btn     = document.getElementById('coverPreviewBtn');
    if (!input) return;

    function preview() {
      const url = input.value.trim();
      if (!url) return;
      img.src      = url;
      img.onerror  = () => wrap.classList.add('hidden');
      img.onload   = () => wrap.classList.remove('hidden');
      wrap.classList.remove('hidden');
    }

    btn?.addEventListener('click', preview);
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 600); });
    if (input.value.trim()) preview();
  }
  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════
   META CHAR COUNTER
═══════════════════════════════════════════════════════════════════ */
const MetaCounter = (() => {
  function init() {
    const ta = document.getElementById('metaDesc');
    const el = document.getElementById('metaCharCount');
    if (!ta || !el) return;
    const update = () => {
      const n = ta.value.length;
      el.textContent = `${n}/160`;
      el.className = n > 160 ? 'font-normal ml-1 text-red-500'
                   : n > 140 ? 'font-normal ml-1 text-orange-500'
                   :            'font-normal ml-1 text-ink-400';
    };
    ta.addEventListener('input', update);
    update();
  }
  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════
   AUTO-SAVE ke localStorage
═══════════════════════════════════════════════════════════════════ */
const AutoSave = (() => {
  const PREFIX = 'blogdraft_';
  let key = null;

  function init() {
    const form    = document.getElementById('articleForm');
    const ta      = document.getElementById('contentEditor');
    const titleIn = document.querySelector('[name="title"]');
    if (!form || !ta) return;

    key = PREFIX + (form.dataset.articleId || 'new');

    // Cek draft tersimpan (hanya untuk artikel baru)
    if (form.dataset.articleId === 'new') {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const d      = JSON.parse(raw);
          const banner = document.getElementById('autosaveBanner');
          if (banner) {
            banner.classList.remove('hidden');
            document.getElementById('restoreDraftBtn')?.addEventListener('click', () => {
              if (d.title && titleIn)  titleIn.value = d.title;
              if (d.content)           ta.value      = d.content;
              banner.classList.add('hidden');
              LivePreview.update();
            });
            document.getElementById('discardDraftBtn')?.addEventListener('click', () => {
              localStorage.removeItem(key);
              banner.classList.add('hidden');
            });
          }
        } catch { localStorage.removeItem(key); }
      }
    }

    setInterval(() => save(titleIn, ta), 30000);
    form.addEventListener('submit', () => localStorage.removeItem(key));
  }

  function save(titleIn, ta) {
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({
      title  : titleIn?.value || '',
      content: ta.value,
      at     : new Date().toISOString(),
    }));
    const el = document.getElementById('autosaveStatus');
    if (el) {
      el.textContent = 'Tersimpan ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      el.style.opacity = '1';
      setTimeout(() => { el.style.opacity = '0'; }, 3000);
    }
  }

  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════
   UNSAVED WARNING
═══════════════════════════════════════════════════════════════════ */
const UnsavedWarning = (() => {
  function init() {
    let dirty = false;
    const form = document.getElementById('articleForm');
    if (!form) return;
    form.querySelectorAll('input,textarea,select').forEach(el => {
      el.addEventListener('input', () => { dirty = true; });
    });
    form.addEventListener('submit', () => { dirty = false; });
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  return { init };
})();


/* ═══════════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  EditorToolbar.init();
  LivePreview.init();
  TagManager.init();
  MediaManager.init();
  CoverPreview.init();
  MetaCounter.init();
  AutoSave.init();
  UnsavedWarning.init();
});
