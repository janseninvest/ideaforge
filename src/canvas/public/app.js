'use strict';

// ─── State ───
const state = {
  board: { title: '', sections: [], timeline: [], mood: {}, theme: null },
  startedAt: null,
  isRecording: false,
  isContinuous: false,
  mediaRecorder: null,
  audioChunks: [],
  processing: 0,
};

// ─── DOM ───
const $ = id => document.getElementById(id);
const board = $('board');
const emptyState = $('empty-state');

// ─── SSE ───
function connectSSE() {
  const es = new EventSource('/api/events');
  es.onopen = () => {
    $('status-dot').classList.add('connected');
    $('status-text').textContent = 'Live';
  };
  es.onmessage = () => fetchBoard();
  es.onerror = () => {
    $('status-dot').classList.remove('connected');
    $('status-text').textContent = 'Reconnecting';
    setTimeout(() => { if (es.readyState === 2) connectSSE(); }, 3000);
  };
}

// ─── Board Rendering ───
async function fetchBoard() {
  try {
    const res = await fetch('/api/board');
    state.board = await res.json();
    render(state.board);
  } catch (e) { console.error('Fetch failed:', e); }
}

function render(b) {
  $('session-title').textContent = b.title || '';
  if (b.startedAt) state.startedAt = new Date(b.startedAt);

  const total = b.sections.reduce((s, sec) => s + (sec.elements || []).length, 0);
  $('element-count').textContent = `${total} element${total !== 1 ? 's' : ''}`;

  // Empty state
  if (!b.sections.length) {
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  // Mood overlay
  if (b.mood?.gradient) {
    $('mood-overlay').style.background = `linear-gradient(135deg, ${b.mood.gradient[0]}, ${b.mood.gradient[1]})`;
  }

  // Apply URL theme
  if (b.theme) applyTheme(b.theme);

  // Sections
  const existingIds = new Set();
  for (const section of b.sections) {
    existingIds.add(section.id);
    let el = document.querySelector(`[data-section="${section.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'board-section';
      el.dataset.section = section.id;
      el.innerHTML = `
        <div class="section-header">
          <span class="section-label"></span>
          <span class="section-count"></span>
        </div>
        <div class="section-grid"></div>
      `;
      board.appendChild(el);
    }
    el.querySelector('.section-label').textContent = section.label;
    el.querySelector('.section-count').textContent = `${(section.elements || []).length}`;

    const grid = el.querySelector('.section-grid');
    for (const item of (section.elements || [])) {
      if (grid.querySelector(`[data-el="${item.id}"]`)) continue;
      const card = createCard(item);
      grid.appendChild(card);
    }
  }

  // Remove stale sections
  document.querySelectorAll('[data-section]').forEach(el => {
    if (!existingIds.has(el.dataset.section)) el.remove();
  });

  // Timeline
  if (b.timeline?.length) {
    $('timeline').classList.remove('hidden');
    $('timeline-items').innerHTML = b.timeline.map(t =>
      `<div class="timeline-item"><span class="timeline-dot"></span>${esc(t.label)}</div>`
    ).join('');
  }
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.el = item.id;
  card.draggable = true;

  if (item.type === 'image' || item.type === 'generated' || item.type === 'reference') {
    if (!item.src) return null; // Skip broken images
    const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : '';
    card.innerHTML = `
      <button class="card-delete" title="Remove">✕</button>
      <img src="${esc(item.src)}" alt="${esc(item.label || '')}" loading="lazy" onerror="this.parentElement.remove()">
      <div class="card-body">
        ${item.label ? `<div class="card-label">${esc(item.label)}</div>` : ''}
        ${timeStr ? `<div class="card-time">${timeStr}</div>` : ''}
      </div>
    `;
    card.querySelector('.card-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      card.style.opacity = '0';
      card.style.transform = 'scale(0.8)';
      card.style.transition = 'all 0.3s';
      setTimeout(() => card.remove(), 300);
    });
  } else if (item.type === 'palette') {
    card.classList.add('palette-card');
    const swatches = (item.colors || []).map(c =>
      `<div class="palette-swatch" style="background:${c}" data-color="${c}"></div>`
    ).join('');
    card.innerHTML = `<div class="card-body">
      <div class="palette-swatches">${swatches}</div>
      <div class="palette-name">${esc(item.name || '')}</div>
    </div>`;
  } else if (item.type === 'keyword') {
    card.classList.add('keyword-card');
    const pills = (item.keywords || [item.text]).map(k =>
      `<span class="keyword-pill">${esc(k)}</span>`
    ).join('');
    card.innerHTML = `<div class="card-body">${pills}</div>`;
  } else {
    card.innerHTML = `<div class="card-body"><div class="card-label">${esc(item.label || item.text || '')}</div></div>`;
  }

  return card;
}

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Theme Application ───
function applyTheme(theme) {
  if (!theme) return;
  const r = document.documentElement.style;

  // Apply colors with fallbacks
  const accent = theme.accentColor || theme.colors?.[0] || '#6366f1';
  const bg = theme.backgroundColor || '#0a0a0f';
  const text = theme.textColor || '#e4e4ed';

  r.setProperty('--accent', accent);
  r.setProperty('--bg', bg);
  r.setProperty('--text', text);
  r.setProperty('--accent-soft', accent + '22');
  if (theme.colors?.[1]) r.setProperty('--border', theme.colors[1] + '33');

  // Apply font if available
  if (theme.fonts?.[0]) {
    r.setProperty('--font', `'${theme.fonts[0]}', -apple-system, system-ui, sans-serif`);
  }

  // Mood overlay from palette
  if (theme.colors?.length >= 2) {
    $('mood-overlay').style.background = `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]}, ${theme.colors[2] || theme.colors[0]})`;
    $('mood-overlay').style.opacity = '0.08';
  }

  // Show style bar with larger swatches
  const bar = $('style-bar');
  bar.classList.remove('hidden');
  bar.classList.add('themed-visible');
  board.classList.add('has-style-bar');

  $('style-swatches').innerHTML = (theme.colors || []).map(c =>
    `<div class="style-swatch" style="background:${c}" title="${c}"></div>`
  ).join('');
  $('style-mood').textContent = theme.layoutStyle ? theme.layoutStyle.charAt(0).toUpperCase() + theme.layoutStyle.slice(1) : '';
  $('style-source').textContent = theme.sourceUrl ? '← ' + new URL(theme.sourceUrl).hostname : '';
  document.body.classList.add('themed');

  // Flash effect to signal theme change
  document.body.style.transition = 'background 0.8s ease';
  
  // Update empty state to reflect theme
  const emptyH2 = document.querySelector('.empty-state h2');
  if (emptyH2) {
    const host = theme.sourceUrl ? new URL(theme.sourceUrl).hostname : '';
    emptyH2.textContent = `Styled from ${host}`;
    emptyH2.style.color = accent;
    const emptyP = document.querySelector('.empty-state p');
    if (emptyP) emptyP.textContent = `${theme.layoutStyle ? theme.layoutStyle.charAt(0).toUpperCase() + theme.layoutStyle.slice(1) + ' aesthetic. ' : ''}Click Record or Type to generate matching visuals.`;
  }
}

// ─── Microphone Recording (with continuous mode) ───
let continuousInterval = null;
let activeStream = null;

async function startRecording() {
  try {
    activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    beginChunk(activeStream);

    state.isRecording = true;
    state.isContinuous = true;
    $('btn-mic').classList.add('active');
    $('mic-label').textContent = 'Stop';
    $('status-dot').classList.add('recording');
    showToast('recording', 'Listening continuously... click 🎤 to stop');

    // Auto-chunk every 20 seconds for continuous processing
    continuousInterval = setInterval(() => {
      if (state.mediaRecorder?.state === 'recording') {
        state.mediaRecorder.stop(); // triggers onstop → upload → beginChunk
      }
    }, 20000);
  } catch (e) {
    alert('Microphone access denied. Please allow mic access and retry.');
  }
}

function beginChunk(stream) {
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  state.mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
  state.audioChunks = [];

  state.mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) state.audioChunks.push(e.data);
  };

  state.mediaRecorder.onstop = async () => {
    const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
    if (blob.size > 2000) uploadAudio(blob); // fire-and-forget, don't await

    // Start next chunk if still in continuous mode
    if (state.isContinuous && activeStream?.active) {
      beginChunk(activeStream);
    }
  };

  state.mediaRecorder.start(1000);
}

function stopRecording() {
  state.isContinuous = false;
  clearInterval(continuousInterval);
  continuousInterval = null;

  if (state.mediaRecorder?.state !== 'inactive') state.mediaRecorder?.stop();
  if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }

  state.isRecording = false;
  $('btn-mic').classList.remove('active');
  $('mic-label').textContent = 'Record';
  $('status-dot').classList.remove('recording');
  hideToast();
}

async function uploadAudio(blob) {
  state.processing++;
  showToast('processing', 'Transcribing & generating visuals...');
  try {
    const res = await fetch('/api/upload-audio', { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: blob });
    const data = await res.json();
    if (data.status === 'error') console.error('Audio error:', data.error);
  } catch (e) {
    console.error('Upload failed:', e);
  } finally {
    state.processing--;
    if (!state.processing) hideToast();
  }
}

// ─── Text Input ───
function showTextModal() {
  $('text-modal').classList.remove('hidden');
  $('text-input').focus();
}
function hideTextModal() {
  $('text-modal').classList.add('hidden');
  $('text-input').value = '';
}

async function sendText() {
  const text = $('text-input').value.trim();
  if (!text) return;
  hideTextModal();
  state.processing++;
  showToast('processing', 'Processing concept...');
  try {
    await fetch('/api/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) { console.error(e); }
  finally {
    state.processing--;
    if (!state.processing) hideToast();
  }
}

// ─── URL Style ───
function showUrlModal() {
  $('url-modal').classList.remove('hidden');
  $('url-input').focus();
}
function hideUrlModal() {
  $('url-modal').classList.add('hidden');
  $('url-input').value = '';
}

async function sendUrl() {
  const url = $('url-input').value.trim();
  if (!url) return;
  hideUrlModal();
  state.processing++;
  showToast('processing', 'Extracting style from ' + new URL(url).hostname + '...');
  try {
    const res = await fetch('/api/add-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (data.style) applyTheme(data.style);
  } catch (e) { console.error(e); }
  finally {
    state.processing--;
    if (!state.processing) hideToast();
  }
}

// ─── Toast ───
function showToast(type, text) {
  const toast = $('toast');
  toast.className = `toast ${type}`;
  $('toast-text').textContent = text;
}
function hideToast() {
  $('toast').classList.add('hidden');
}

// ─── Timer ───
setInterval(() => {
  if (!state.startedAt) return;
  const d = Math.floor((Date.now() - state.startedAt.getTime()) / 1000);
  $('elapsed').textContent = `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
}, 1000);

// ─── Event Listeners ───
$('btn-mic').addEventListener('click', () => {
  if (state.isRecording) stopRecording(); else startRecording();
});
$('btn-text').addEventListener('click', showTextModal);
$('btn-url').addEventListener('click', showUrlModal);
$('btn-brief').addEventListener('click', showBriefModal);
$('btn-sessions').addEventListener('click', showSessionsModal);
$('btn-export').addEventListener('click', () => window.open('/api/export', '_blank'));
$('btn-fullscreen').addEventListener('click', () => document.body.classList.toggle('fullscreen'));

$('btn-send-text').addEventListener('click', sendText);
$('btn-close-text').addEventListener('click', hideTextModal);
$('text-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } });

$('btn-send-url').addEventListener('click', sendUrl);
$('btn-close-url').addEventListener('click', hideUrlModal);
$('url-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendUrl(); });

$('btn-send-brief').addEventListener('click', sendBrief);
$('btn-close-brief').addEventListener('click', hideBriefModal);
$('brief-input').addEventListener('keydown', e => { if (e.key === 'Enter' && e.ctrlKey) sendBrief(); });

$('btn-close-sessions').addEventListener('click', hideSessionsModal);

$('btn-clear-style').addEventListener('click', () => {
  document.documentElement.removeAttribute('style');
  $('style-bar').classList.add('hidden');
  board.classList.remove('has-style-bar');
  document.body.classList.remove('themed');
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.target.closest('textarea, input')) return;
  if (e.key === 'r' || e.key === 'R') $('btn-mic').click();
  if (e.key === 't' || e.key === 'T') showTextModal();
  if (e.key === 'u' || e.key === 'U') showUrlModal();
  if (e.key === 'b' || e.key === 'B') showBriefModal();
  if (e.key === 's' || e.key === 'S') showSessionsModal();
  if (e.key === 'e' || e.key === 'E') window.open('/api/export', '_blank');
  if (e.key === 'f' || e.key === 'F') document.body.classList.toggle('fullscreen');
  if (e.key === 'Escape') { hideTextModal(); hideUrlModal(); hideBriefModal(); hideSessionsModal(); if (state.isRecording) stopRecording(); }
});

// Click outside modal to close
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});

// ─── Brief Input ───
function showBriefModal() {
  $('brief-modal').classList.remove('hidden');
  $('brief-input').focus();
}
function hideBriefModal() {
  $('brief-modal').classList.add('hidden');
  $('brief-input').value = '';
}
async function sendBrief() {
  const brief = $('brief-input').value.trim();
  if (!brief) return;
  hideBriefModal();
  state.processing++;
  showToast('processing', 'Generating from brief...');
  try {
    await fetch('/api/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief }),
    });
  } catch (e) { console.error(e); }
  finally {
    state.processing--;
    if (!state.processing) hideToast();
  }
}

// ─── Sessions ───
function showSessionsModal() {
  $('sessions-modal').classList.remove('hidden');
  loadSessions();
}
function hideSessionsModal() {
  $('sessions-modal').classList.add('hidden');
}
async function loadSessions() {
  const list = $('sessions-list');
  try {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();
    if (!sessions.length) {
      list.innerHTML = '<div class="no-sessions">No past sessions found</div>';
      return;
    }
    list.innerHTML = sessions.map(s => {
      const date = s.startedAt ? new Date(s.startedAt) : null;
      const dateStr = date ? date.toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="session-item" data-id="${s.id}">
        <div>
          <div class="session-item-title">${s.title || s.id}</div>
          <div class="session-item-meta">
            <span>${dateStr}</span>
          </div>
        </div>
        <span class="session-item-count">${s.elements} elements</span>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div class="no-sessions">Failed to load sessions</div>';
  }
}

// ─── Drag & Drop Reorder ───
let draggedCard = null;

document.addEventListener('dragstart', e => {
  const card = e.target.closest('.card');
  if (!card) return;
  draggedCard = card;
  card.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
});

document.addEventListener('dragover', e => {
  const card = e.target.closest('.card');
  if (!card || card === draggedCard) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  card.style.borderColor = 'var(--accent)';
});

document.addEventListener('dragleave', e => {
  const card = e.target.closest('.card');
  if (card) card.style.borderColor = '';
});

document.addEventListener('drop', e => {
  const target = e.target.closest('.card');
  if (!target || !draggedCard || target === draggedCard) return;
  e.preventDefault();
  const grid = target.closest('.section-grid');
  if (!grid) return;
  const cards = [...grid.children];
  const fromIdx = cards.indexOf(draggedCard);
  const toIdx = cards.indexOf(target);
  if (fromIdx < toIdx) target.after(draggedCard);
  else target.before(draggedCard);
  target.style.borderColor = '';
});

document.addEventListener('dragend', () => {
  if (draggedCard) { draggedCard.style.opacity = ''; draggedCard = null; }
  document.querySelectorAll('.card').forEach(c => c.style.borderColor = '');
});

// ─── Init ───
connectSSE();
fetchBoard();
