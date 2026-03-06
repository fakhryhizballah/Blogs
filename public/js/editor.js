/**
 * editor.js — Vanilla JS untuk halaman article editor (admin)
 * Meliputi: toolbar editor, markdown preview, tag manager, media manager,
 *           cover image preview, meta char counter, auto-save draft
 */

'use strict';

/* ─────────────────────────────────────────────
   TOOLBAR EDITOR
   Operasi teks pada <textarea> #contentEditor
───────────────────────────────────────────── */
const EditorToolbar = (() => {
  let textarea = null;

  const ACTIONS = {
    bold        : { wrap: ['**', '**'],         placeholder: 'teks tebal' },
    italic      : { wrap: ['*', '*'],            placeholder: 'teks miring' },
    strikethrough: { wrap: ['~~', '~~'],         placeholder: 'teks coret' },
    h2          : { line: '## ',                 placeholder: 'Judul Besar' },
    h3          : { line: '### ',                placeholder: 'Sub Judul' },
    h4          : { line: '#### ',              placeholder: 'Sub-Sub Judul' },
    code        : { wrap: ['`', '`'],            placeholder: 'kode' },
    codeblock   : { block: '```\n$1\n```',       placeholder: 'kode di sini' },
    quote       : { line: '> ',                  placeholder: 'kutipan' },
    ul          : { line: '- ',                  placeholder: 'item daftar' },
    ol          : { line: '1. ',                 placeholder: 'item bernomor' },
    hr          : { insert: '\n---\n' },
    link        : { snippet: '[teks link](https://url.com)' },
    image       : { snippet: '![alt text](https://url-gambar.com)' },
    table       : { insert: '\n| Kolom 1 | Kolom 2 | Kolom 3 |\n|---------|---------|----------|\n| data    | data    | data     |\n' },
  };

  function init() {
    textarea = document.getElementById('contentEditor');
    if (!textarea) return;

    // Delegasi event ke toolbar container
    const toolbar = document.getElementById('editorToolbar');
    if (!toolbar) return;

    toolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      applyAction(btn.dataset.action);
      textarea.focus();
    });

    // Tab key → insert 2 spasi, bukan berpindah fokus
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        insertAtCursor('  ');
      }
    });
  }

  function applyAction(actionName) {
    const cfg = ACTIONS[actionName];
    if (!cfg) return;

    const { selectionStart: start, selectionEnd: end, value } = textarea;
    const selected = value.slice(start, end);

    if (cfg.wrap) {
      const [before, after] = cfg.wrap;
      const text = selected || cfg.placeholder;
      replaceSelection(before + text + after, start, end, before.length, before.length + text.length);

    } else if (cfg.line) {
      // Tambah prefix di awal baris
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd   = value.indexOf('\n', end);
      const endPos    = lineEnd === -1 ? value.length : lineEnd;
      const line      = value.slice(lineStart, endPos);
      const newLine   = cfg.line + (selected || line || cfg.placeholder);
      textarea.value  = value.slice(0, lineStart) + newLine + value.slice(endPos);
      const newPos    = lineStart + newLine.length;
      textarea.setSelectionRange(newPos, newPos);

    } else if (cfg.block) {
      const text   = selected || cfg.placeholder;
      const result = cfg.block.replace('$1', text);
      const before = '\n' + result + '\n';
      replaceSelection(before, start, end, 4, 4 + text.length);

    } else if (cfg.insert) {
      insertAtCursor(cfg.insert);

    } else if (cfg.snippet) {
      replaceSelection(cfg.snippet, start, end, 0, cfg.snippet.length);
    }

    // Update preview jika sedang aktif
    MarkdownPreview.update();
  }

  function replaceSelection(text, start, end, selectFrom, selectTo) {
    const { value } = textarea;
    textarea.value = value.slice(0, start) + text + value.slice(end);
    textarea.setSelectionRange(start + selectFrom, start + selectTo);
  }

  function insertAtCursor(text) {
    const { selectionStart: pos, value } = textarea;
    textarea.value = value.slice(0, pos) + text + value.slice(pos);
    textarea.setSelectionRange(pos + text.length, pos + text.length);
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   MARKDOWN PREVIEW
───────────────────────────────────────────── */
const MarkdownPreview = (() => {
  let textarea    = null;
  let previewPane = null;
  let previewBody = null;
  let toggleBtn   = null;
  let active      = false;

  const RULES = [
    // Headings
    [/^#{4} (.+)$/gm,          '<h4>$1</h4>'],
    [/^#{3} (.+)$/gm,          '<h3>$1</h3>'],
    [/^#{2} (.+)$/gm,          '<h2>$1</h2>'],
    [/^# (.+)$/gm,             '<h1>$1</h1>'],
    // Bold & italic
    [/\*\*\*(.+?)\*\*\*/g,     '<strong><em>$1</em></strong>'],
    [/\*\*(.+?)\*\*/g,         '<strong>$1</strong>'],
    [/\*(.+?)\*/g,             '<em>$1</em>'],
    [/~~(.+?)~~/g,             '<del>$1</del>'],
    // Code block (must be before inline code)
    [/```[\w]*\n([\s\S]+?)```/gm, '<pre><code>$1</code></pre>'],
    // Inline code
    [/`([^`]+)`/g,             '<code>$1</code>'],
    // Blockquote
    [/^> (.+)$/gm,             '<blockquote>$1</blockquote>'],
    // HR
    [/^---$/gm,                '<hr>'],
    // Table (basic)
    [/^\|(.+)\|$/gm,           (_, row) => {
      const cells = row.split('|').map(c => c.trim());
      return cells.every(c => /^[-:]+$/.test(c))
        ? '' // separator row
        : '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    }],
    // Lists
    [/^- (.+)$/gm,             '<li class="ul-item">$1</li>'],
    [/^\d+\. (.+)$/gm,         '<li class="ol-item">$1</li>'],
    // Links & images
    [/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">'],
    [/\[([^\]]+)\]\(([^)]+)\)/g,  '<a href="$2" target="_blank">$1</a>'],
    // Paragraphs
    [/\n\n/g,                  '</p><p>'],
    [/\n/g,                    '<br>'],
  ];

  function parseMarkdown(md) {
    let html = md;
    for (const [pattern, replacement] of RULES) {
      html = html.replace(pattern, replacement);
    }
    // Wrap adjacent li items
    html = html
      .replace(/(<li class="ul-item">.*?<\/li>(\s*<br>)?)+/g, m => `<ul>${m.replace(/<br>/g,'')}</ul>`)
      .replace(/(<li class="ol-item">.*?<\/li>(\s*<br>)?)+/g, m => `<ol>${m.replace(/<br>/g,'')}</ol>`);
    return '<p>' + html + '</p>';
  }

  function update() {
    if (!active || !textarea || !previewBody) return;
    previewBody.innerHTML = parseMarkdown(textarea.value);
  }

  function init() {
    textarea    = document.getElementById('contentEditor');
    previewPane = document.getElementById('previewPane');
    previewBody = document.getElementById('previewContent');
    toggleBtn   = document.getElementById('previewToggle');

    if (!textarea || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      active = !active;
      if (active) {
        update();
        previewPane.classList.remove('hidden');
        textarea.classList.add('hidden');
        toggleBtn.textContent = '✏️ Edit';
        toggleBtn.classList.add('bg-accent-500', 'text-white');
        toggleBtn.classList.remove('bg-ink-200', 'text-ink-700');
      } else {
        previewPane.classList.add('hidden');
        textarea.classList.remove('hidden');
        toggleBtn.textContent = '👁 Preview';
        toggleBtn.classList.remove('bg-accent-500', 'text-white');
        toggleBtn.classList.add('bg-ink-200', 'text-ink-700');
      }
    });

    // Live update word count
    textarea.addEventListener('input', () => {
      updateWordCount();
      update();
    });

    updateWordCount();
  }

  function updateWordCount() {
    const el = document.getElementById('wordCount');
    if (!el || !textarea) return;
    const words = textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0;
    const mins  = Math.max(1, Math.ceil(words / 200));
    el.textContent = `${words} kata · ~${mins} mnt baca`;
  }

  return { init, update };
})();


/* ─────────────────────────────────────────────
   TAG MANAGER
   Input tag dengan chip visual, Enter/koma untuk tambah
───────────────────────────────────────────── */
const TagManager = (() => {
  let tags       = [];
  let hiddenInput = null;
  let container   = null;
  let input       = null;

  function init() {
    container   = document.getElementById('tagChipsContainer');
    input       = document.getElementById('tagInputField');
    hiddenInput = document.getElementById('tagsHidden');

    if (!container || !input || !hiddenInput) return;

    // Load existing tags dari hidden input (mode edit)
    const existing = hiddenInput.value;
    if (existing) {
      existing.split(',').map(t => t.trim()).filter(Boolean).forEach(addTag);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = input.value.trim().replace(/,$/, '');
        if (val) addTag(val);
        input.value = '';
      }
      // Backspace pada input kosong → hapus tag terakhir
      if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
        removeTag(tags[tags.length - 1]);
      }
    });

    input.addEventListener('blur', () => {
      const val = input.value.trim();
      if (val) { addTag(val); input.value = ''; }
    });

    // Klik area container → fokus input
    container.addEventListener('click', (e) => {
      if (e.target === container || e.target.classList.contains('tag-input-area')) {
        input.focus();
      }
    });

    // Hapus chip via event delegation
    container.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-tag]');
      if (removeBtn) removeTag(removeBtn.dataset.removeTag);
    });
  }

  function addTag(raw) {
    const tag = raw.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!tag || tags.includes(tag) || tags.length >= 10) return;
    tags.push(tag);
    renderChips();
    syncHidden();
  }

  function removeTag(tag) {
    tags = tags.filter(t => t !== tag);
    renderChips();
    syncHidden();
  }

  function renderChips() {
    // Hapus chip lama (bukan input)
    container.querySelectorAll('.tag-chip').forEach(el => el.remove());

    tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip inline-flex items-center gap-1 px-2.5 py-1 bg-accent-500/10 text-accent-700 rounded-full text-xs font-medium border border-accent-200';
      chip.innerHTML = `
        <span>#${escapeHtml(tag)}</span>
        <button type="button" data-remove-tag="${escapeHtml(tag)}"
          class="ml-0.5 text-accent-500 hover:text-red-500 transition leading-none"
          title="Hapus tag">×</button>`;
      container.insertBefore(chip, input.parentElement || input);
    });

    // Hint teks
    const hint = document.getElementById('tagHint');
    if (hint) hint.textContent = tags.length > 0 ? `${tags.length}/10 topik` : 'Tekan Enter atau koma untuk menambah';
  }

  function syncHidden() {
    hiddenInput.value = tags.join(', ');
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   MEDIA MANAGER
   Kelola lampiran foto/video/PDF via URL API
───────────────────────────────────────────── */
const MediaManager = (() => {
  let mediaFiles  = [];
  let hiddenInput = null;
  let listEl      = null;
  let currentType = 'image';

  const TYPE_CONFIG = {
    image : { label: 'Foto',  accept: 'image/*',    placeholder: 'https://cdn.example.com/foto.jpg', icon: '🖼️' },
    video : { label: 'Video', accept: 'video/*',    placeholder: 'https://cdn.example.com/video.mp4', icon: '🎥' },
    pdf   : { label: 'PDF',   accept: '.pdf',       placeholder: 'https://cdn.example.com/dokumen.pdf', icon: '📄' },
  };

  function init() {
    hiddenInput = document.getElementById('mediaFilesInput');
    listEl      = document.getElementById('mediaList');

    if (!hiddenInput || !listEl) return;

    // Load existing media (edit mode)
    try {
      mediaFiles = JSON.parse(hiddenInput.value || '[]');
    } catch { mediaFiles = []; }

    // Tombol pilih tipe
    document.querySelectorAll('[data-media-type]').forEach(btn => {
      btn.addEventListener('click', () => showUploadPanel(btn.dataset.mediaType));
    });

    // Tombol tambah
    const addBtn = document.getElementById('addMediaBtn');
    if (addBtn) addBtn.addEventListener('click', addMediaFromInput);

    // Enter di URL input
    const urlInput = document.getElementById('mediaUrlInput');
    if (urlInput) {
      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addMediaFromInput(); }
      });
    }

    // Tutup panel
    const closeBtn = document.getElementById('closeUploadPanel');
    if (closeBtn) closeBtn.addEventListener('click', hideUploadPanel);

    // Event delegation untuk hapus item
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-media]');
      if (btn) removeMedia(parseInt(btn.dataset.removeMedia));
    });

    renderList();
  }

  function showUploadPanel(type) {
    currentType = type;
    const cfg   = TYPE_CONFIG[type];
    const panel = document.getElementById('uploadPanel');
    const label = document.getElementById('uploadTypeLabel');
    const urlIn = document.getElementById('mediaUrlInput');

    if (!panel) return;

    label.textContent    = cfg.label;
    urlIn.placeholder    = cfg.placeholder;
    urlIn.value          = '';
    document.getElementById('mediaNameInput').value = '';

    panel.classList.remove('hidden');
    urlIn.focus();

    // Highlight tombol aktif
    document.querySelectorAll('[data-media-type]').forEach(b => b.classList.remove('ring-2', 'ring-accent-400'));
    document.querySelector(`[data-media-type="${type}"]`)?.classList.add('ring-2', 'ring-accent-400');
  }

  function hideUploadPanel() {
    document.getElementById('uploadPanel')?.classList.add('hidden');
    document.querySelectorAll('[data-media-type]').forEach(b => b.classList.remove('ring-2', 'ring-accent-400'));
  }

  function addMediaFromInput() {
    const url  = document.getElementById('mediaUrlInput').value.trim();
    const name = document.getElementById('mediaNameInput').value.trim() || url.split('/').pop().split('?')[0];

    if (!url) {
      showInputError('mediaUrlInput', 'Masukkan URL file');
      return;
    }
    if (!isValidUrl(url)) {
      showInputError('mediaUrlInput', 'URL tidak valid');
      return;
    }

    mediaFiles.push({ type: currentType, url, name });
    syncHidden();
    renderList();
    hideUploadPanel();
    document.getElementById('mediaUrlInput').value  = '';
    document.getElementById('mediaNameInput').value = '';
  }

  function removeMedia(index) {
    mediaFiles.splice(index, 1);
    syncHidden();
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    if (mediaFiles.length === 0) {
      listEl.innerHTML = '<p class="text-sm text-ink-400 col-span-3 py-2">Belum ada lampiran</p>';
      return;
    }

    listEl.innerHTML = '';
    mediaFiles.forEach((m, i) => {
      const card = document.createElement('div');
      card.className = 'relative group rounded-xl border border-ink-200 overflow-hidden bg-white shadow-sm';

      let preview = '';
      if (m.type === 'image') {
        preview = `<img src="${escapeHtml(m.url)}" alt="${escapeHtml(m.name)}" class="w-full h-24 object-cover" onerror="this.style.display='none'">`;
      } else if (m.type === 'video') {
        preview = `<video src="${escapeHtml(m.url)}" class="w-full h-24 bg-ink-900 object-cover"></video>`;
      } else {
        preview = `<div class="w-full h-24 flex items-center justify-center bg-red-50 text-3xl">📄</div>`;
      }

      card.innerHTML = `
        ${preview}
        <div class="p-2 flex items-center gap-1.5">
          <span class="text-xs">${TYPE_CONFIG[m.type]?.icon || '📎'}</span>
          <p class="text-xs text-ink-600 truncate flex-1" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</p>
        </div>
        <button type="button"
          data-remove-media="${i}"
          title="Hapus lampiran"
          class="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow">
          ×
        </button>`;

      listEl.appendChild(card);
    });
  }

  function syncHidden() {
    if (hiddenInput) hiddenInput.value = JSON.stringify(mediaFiles);
  }

  function isValidUrl(str) {
    try { new URL(str); return true; } catch { return false; }
  }

  function showInputError(inputId, msg) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.classList.add('border-red-400');
    const err = document.createElement('p');
    err.className = 'text-xs text-red-500 mt-1 input-error';
    err.textContent = msg;
    input.parentElement.appendChild(err);
    setTimeout(() => {
      input.classList.remove('border-red-400');
      err.remove();
    }, 2500);
    input.focus();
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   COVER IMAGE PREVIEW
───────────────────────────────────────────── */
const CoverPreview = (() => {
  function init() {
    const input   = document.getElementById('coverImageUrl');
    const preview = document.getElementById('coverPreview');
    const img     = document.getElementById('coverPreviewImg');
    const btn     = document.getElementById('coverPreviewBtn');

    if (!input) return;

    function doPreview() {
      const url = input.value.trim();
      if (!url) return;
      if (img) { img.src = url; img.onerror = () => { preview.classList.add('hidden'); }; }
      if (preview) preview.classList.remove('hidden');
    }

    if (btn) btn.addEventListener('click', doPreview);

    // Debounced auto-preview saat mengetik
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(doPreview, 600);
    });

    // Preview on load jika sudah ada value (edit mode)
    if (input.value.trim()) doPreview();
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   META DESCRIPTION COUNTER
───────────────────────────────────────────── */
const MetaCounter = (() => {
  function init() {
    const textarea = document.getElementById('metaDesc');
    const counter  = document.getElementById('metaCharCount');
    if (!textarea || !counter) return;

    function update() {
      const len = textarea.value.length;
      counter.textContent = `${len}/160`;
      counter.className = len > 150
        ? 'font-normal ml-1 text-orange-500'
        : len > 160
          ? 'font-normal ml-1 text-red-500'
          : 'font-normal ml-1 text-ink-400';
    }

    textarea.addEventListener('input', update);
    update();
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   AUTO-SAVE DRAFT (localStorage)
   Menyimpan konten editor setiap 30 detik
───────────────────────────────────────────── */
const AutoSave = (() => {
  const KEY_PREFIX = 'blog_draft_';
  let articleId    = null;
  let timer        = null;

  function init() {
    const form    = document.getElementById('articleForm');
    const textarea = document.getElementById('contentEditor');
    const titleIn = document.querySelector('[name="title"]');

    if (!form || !textarea) return;

    articleId = form.dataset.articleId || 'new';
    const key = KEY_PREFIX + articleId;

    // Restore draft jika ada (hanya untuk artikel baru)
    if (articleId === 'new') {
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          const banner = document.getElementById('autosaveBanner');
          if (banner) {
            banner.classList.remove('hidden');
            document.getElementById('restoreDraftBtn')?.addEventListener('click', () => {
              if (draft.title && titleIn)  titleIn.value  = draft.title;
              if (draft.content)           textarea.value = draft.content;
              banner.classList.add('hidden');
              MarkdownPreview.update();
            });
            document.getElementById('discardDraftBtn')?.addEventListener('click', () => {
              localStorage.removeItem(key);
              banner.classList.add('hidden');
            });
          }
        } catch { localStorage.removeItem(key); }
      }
    }

    // Auto-save setiap 30 detik
    timer = setInterval(() => saveDraft(key, titleIn, textarea), 30000);

    // Hapus draft saat form disubmit berhasil
    form.addEventListener('submit', () => localStorage.removeItem(key));

    // Tampilkan status
    showStatus('');
  }

  function saveDraft(key, titleIn, textarea) {
    const data = {
      title  : titleIn?.value || '',
      content: textarea.value,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(data));
    showStatus('Draft tersimpan ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
  }

  function showStatus(msg) {
    const el = document.getElementById('autosaveStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    if (msg) setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

  return { init };
})();


/* ─────────────────────────────────────────────
   UNSAVED CHANGES WARNING
───────────────────────────────────────────── */
const UnsavedWarning = (() => {
  function init() {
    let dirty = false;
    const form = document.getElementById('articleForm');
    if (!form) return;

    form.querySelectorAll('input, textarea, select').forEach(el => {
      el.addEventListener('input', () => { dirty = true; });
    });

    form.addEventListener('submit', () => { dirty = false; });

    window.addEventListener('beforeunload', (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }
  return { init };
})();


/* ─────────────────────────────────────────────
   FORM VALIDATION
   Validasi konten sebelum submit
───────────────────────────────────────────── */
const FormValidator = (() => {
  function init() {
    const form = document.getElementById('articleForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      const titleInput = document.getElementById('titleInput');
      const contentEditor = document.getElementById('contentEditor');
      const errors = [];

      if (!titleInput?.value?.trim()) {
        errors.push('Judul artikel diperlukan');
      }

      if (!contentEditor?.value?.trim()) {
        errors.push('Konten artikel diperlukan');
      }

      if (errors.length > 0) {
        e.preventDefault();
        alert('Mohon lengkapi form:\n\n' + errors.map(err => '• ' + err).join('\n'));
        contentEditor?.focus();
      }
    });
  }
  return { init };
})();


/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  EditorToolbar.init();
  MarkdownPreview.init();
  TagManager.init();
  MediaManager.init();
  CoverPreview.init();
  MetaCounter.init();
  AutoSave.init();
  UnsavedWarning.init();
  FormValidator.init();
});
