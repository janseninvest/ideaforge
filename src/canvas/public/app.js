'use strict';

// ─── State ───
let board = { title: '', sections: [], timeline: [], mood: {} };
let startedAt = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let isProcessing = false;

// ─── DOM ───
const $ = id => document.getElementById(id);
const boardEl = $('board');
const titleEl = $('title');
const elapsedEl = $('elapsed');
const countEl = $('element-count');
const statusDot = $('status-dot');
const statusText = $('status-text');
const emptyState = $('empty-state');
const moodOverlay = $('mood-overlay');
const timelineEl = $('timeline');
const timelineItems = $('timeline-items');
const recordingIndicator = $('recording-indicator');
const processingIndicator = $('processing-indicator');
const processingText = $('processing-text');

// ─── SSE Connection ───
function connectSSE() {
  const es = new EventSource('/api/events');
  es.onopen = () => {
    statusDot.className = 'dot connected';
    statusText.textContent = 'Live';
  };
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'update' || data.type === 'connected') {
      fetchBoard();
    }
  };
  es.onerror = () => {
    statusDot.className = 'dot disconnected';
    statusText.textContent = 'Reconnecting...';
  };
}

// ─── Fetch & Render Board ───
async function fetchBoard() {
  try {
    const res = await fetch('/api/board');
    board = await res.json();
    renderBoard();
  } catch (e) {
    console.error('Failed to fetch board:', e);
  }
}

function renderBoard() {
  titleEl.textContent = board.title || 'IdeaForge';
  if (board.startedAt) startedAt = new Date(board.startedAt);

  // Count elements
  const total = board.sections.reduce((sum, s) => sum + (s.elements || []).length, 0);
  countEl.textContent = `${total} element${total !== 1 ? 's' : ''}`;

  // Empty state
  if (board.sections.length === 0) {
    if (!boardEl.contains(emptyState)) boardEl.appendChild(emptyState);
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  // Mood overlay
  if (board.mood?.gradient) {
    moodOverlay.style.background = `linear-gradient(135deg, ${board.mood.gradient[0]}, ${board.mood.gradient[1]})`;
  }

  // Render sections
  const existingIds = new Set();
  for (const section of board.sections) {
    existingIds.add(section.id);
    let sectionEl = document.querySelector(`[data-section="${section.id}"]`);
    
    if (!sectionEl) {
      sectionEl = document.createElement('div');
      sectionEl.className = 'board-section';
      sectionEl.dataset.section = section.id;
      sectionEl.innerHTML = `
        <div class="section-label">${escHtml(section.label)}</div>
        <div class="section-grid"></div>
      `;
      boardEl.appendChild(sectionEl);
    }

    const grid = sectionEl.querySelector('.section-grid');
    const label = sectionEl.querySelector('.section-label');
    label.textContent = section.label;

    // Render elements
    const existingElIds = new Set();
    for (const el of (section.elements || [])) {
      existingElIds.add(el.id);
      if (grid.querySelector(`[data-el="${el.id}"]`)) continue;

      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.el = el.id;

      if (el.type === 'image') {
        card.innerHTML = `
          <img src="${escHtml(el.src)}" alt="${escHtml(el.label || '')}" loading="lazy" onerror="this.style.display='none'">
          ${el.label ? `<div class="card-label">${escHtml(el.label)}</div>` : ''}
        `;
      } else if (el.type === 'palette') {
        card.className = 'card palette-card';
        const swatches = (el.colors || []).map(c => `<div class="swatch" style="background:${c}" title="${c}"></div>`).join('');
        card.innerHTML = `<div class="palette-swatches">${swatches}</div><div class="card-label">${escHtml(el.name || '')}</div>`;
      } else if (el.type === 'keyword') {
        card.className = 'card keyword-card';
        card.innerHTML = `<span class="keyword-pill">${escHtml(el.text)}</span>`;
      } else {
        card.innerHTML = `<div class="card-label">${escHtml(el.label || el.text || '')}</div>`;
      }

      grid.appendChild(card);
    }
  }

  // Timeline
  if (board.timeline?.length) {
    timelineEl.classList.remove('hidden');
    timelineItems.innerHTML = board.timeline.map(t => 
      `<div class="timeline-item"><span class="timeline-dot"></span>${escHtml(t.label)}</div>`
    ).join('');
  }
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Microphone Recording ───
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      if (blob.size > 1000) { // Only process if > 1KB (not just silence)
        await uploadAudio(blob);
      }
    };

    mediaRecorder.start(1000); // Collect in 1s chunks
    isRecording = true;
    $('btn-mic').classList.add('recording');
    $('btn-mic').querySelector('.mic-label').textContent = 'Stop';
    recordingIndicator.classList.remove('hidden');
  } catch (e) {
    alert('Microphone access denied. Please allow microphone access and try again.');
    console.error('Mic error:', e);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  $('btn-mic').classList.remove('recording');
  $('btn-mic').querySelector('.mic-label').textContent = 'Record';
  recordingIndicator.classList.add('hidden');
}

async function uploadAudio(blob) {
  isProcessing = true;
  processingText.textContent = 'Transcribing & generating visuals...';
  processingIndicator.classList.remove('hidden');
  
  try {
    const res = await fetch('/api/upload-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/webm' },
      body: blob,
    });
    const data = await res.json();
    console.log('Audio processed:', data);
    if (data.status === 'error') {
      alert('Processing failed: ' + data.error);
    }
  } catch (e) {
    console.error('Upload failed:', e);
    alert('Failed to process audio. Check server connection.');
  } finally {
    isProcessing = false;
    processingIndicator.classList.add('hidden');
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
  isProcessing = true;
  processingText.textContent = 'Processing concept...';
  processingIndicator.classList.remove('hidden');

  try {
    const res = await fetch('/api/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    console.log('Text processed:', data);
  } catch (e) {
    console.error('Send failed:', e);
    alert('Failed to process text.');
  } finally {
    isProcessing = false;
    processingIndicator.classList.add('hidden');
  }
}

// ─── Elapsed Timer ───
setInterval(() => {
  if (!startedAt) return;
  const diff = Math.floor((Date.now() - startedAt.getTime()) / 1000);
  const m = String(Math.floor(diff / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  elapsedEl.textContent = `${m}:${s}`;
}, 1000);

// ─── Event Listeners ───
$('btn-mic').addEventListener('click', () => {
  if (isProcessing) return;
  if (isRecording) stopRecording();
  else startRecording();
});

$('btn-text').addEventListener('click', showTextModal);
$('btn-send-text').addEventListener('click', sendText);
$('btn-cancel-text').addEventListener('click', hideTextModal);
$('btn-fullscreen').addEventListener('click', () => document.body.classList.toggle('fullscreen'));

$('text-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' && !e.target.closest('textarea,input')) document.body.classList.toggle('fullscreen');
  if (e.key === 'Escape') { hideTextModal(); if (isRecording) stopRecording(); }
});

// ─── Init ───
connectSSE();
fetchBoard();
