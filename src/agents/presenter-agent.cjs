'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createServer } = require('../canvas/server.cjs');

class PresenterAgent {
  constructor(sessionDir) {
    this.sessionDir = path.resolve(sessionDir);
    this.boardPath = path.join(this.sessionDir, 'board.json');
    this.assetsDir = path.join(this.sessionDir, 'assets');
    fs.mkdirSync(this.assetsDir, { recursive: true });

    if (fs.existsSync(this.boardPath)) {
      this.board = JSON.parse(fs.readFileSync(this.boardPath, 'utf-8'));
    } else {
      this.board = { title: '', startedAt: new Date().toISOString(), mood: {}, sections: [], timeline: [] };
      this._save();
    }
    this._server = null;
  }

  _save() {
    fs.writeFileSync(this.boardPath, JSON.stringify(this.board, null, 2));
  }

  async startServer(port = 3333) {
    this._server = createServer({
      port,
      sessionDir: this.sessionDir,
      publicDir: path.join(__dirname, '..', 'canvas', 'public'),
    });
    await this._server.start();
    return this._server;
  }

  setAudioHandler(fn) {
    if (this._server) this._server.setAudioHandler(fn);
  }

  setTextHandler(fn) {
    if (this._server) this._server.setTextHandler(fn);
  }

  async stopServer() {
    if (this._server) await this._server.stop();
  }

  getBoard() { return this.board; }

  updateBoard(newData) {
    Object.assign(this.board, newData);
    this._save();
  }

  addSection(label) {
    const id = 'section-' + crypto.randomBytes(4).toString('hex');
    const section = { id, label, elements: [] };
    this.board.sections.push(section);
    this._save();
    return section;
  }

  addElement(sectionId, element) {
    const section = this.board.sections.find(s => s.id === sectionId);
    if (!section) throw new Error(`Section ${sectionId} not found`);
    element.timestamp = element.timestamp || new Date().toISOString();
    section.elements.push(element);
    this._save();
    return element;
  }

  addTimelineEvent(event) {
    this.board.timeline.push(event);
    this._save();
  }

  updateMood(description, gradient) {
    this.board.mood = { description, gradient };
    this._save();
  }

  exportHTML() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'canvas', 'public', 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'canvas', 'public', 'style.css'), 'utf-8');
    let js = fs.readFileSync(path.join(__dirname, '..', 'canvas', 'public', 'app.js'), 'utf-8');

    // Inline board data and disable SSE
    const boardJSON = JSON.stringify(this.board);
    const inlineJS = `
      // Self-contained export — no SSE
      const EXPORTED_BOARD = ${boardJSON};
      function connectSSE() {}
      async function fetchBoard() { render(EXPORTED_BOARD); state.board = EXPORTED_BOARD; }
    `;

    // Inline images as base64
    let boardCopy = JSON.parse(boardJSON);
    for (const section of boardCopy.sections || []) {
      for (const el of section.elements || []) {
        if (el.type === 'image' && el.src) {
          const imgPath = el.src.startsWith('/assets/')
            ? path.join(this.assetsDir, el.src.slice(8))
            : path.join(this.sessionDir, el.src);
          try {
            const data = fs.readFileSync(imgPath);
            const ext = path.extname(imgPath).toLowerCase();
            const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'image/png';
            el.src = `data:${mime};base64,${data.toString('base64')}`;
          } catch (e) { /* keep original src */ }
        }
      }
    }

    const exportedJS = inlineJS + '\n' + js.replace('connectSSE();', '').replace('fetchBoard();', 'fetchBoard();');

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${this.board.title || 'Moodboard'} — Export</title><style>${css}</style></head>
<body><div id="mood-overlay"></div><header class="header"><h1 id="title">Moodboard</h1>
<div class="header-meta"><span id="concept-count">0</span><span id="elapsed">00:00:00</span><span class="status-dot connected"></span></div></header>
<main class="board" id="board-content"></main><div class="timeline-bar" id="timeline"></div>
<script>${exportedJS}</script></body></html>`;
  }
}

module.exports = { PresenterAgent };
