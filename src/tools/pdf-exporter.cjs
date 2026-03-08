'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Export a session board to a self-contained HTML report (printable as PDF).
 * Uses inline base64 images and print-optimized CSS.
 */
class PdfExporter {
  constructor(sessionDir) {
    this.sessionDir = path.resolve(sessionDir);
    this.assetsDir = path.join(this.sessionDir, 'assets');
  }

  /**
   * Generate a comprehensive HTML report.
   * @returns {string} HTML string
   */
  generate() {
    const board = this._readJSON('board.json');
    const meta = this._readJSON('meta.json');
    const concepts = this._readJSON('concepts.json');
    const transcript = this._readJSON('transcript.json');

    const sections = (board.sections || []).map(s => this._renderSection(s)).join('\n');
    const transcriptHTML = (transcript || []).map(t =>
      `<div class="transcript-entry">
        <span class="ts">${new Date(t.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="source">${t.source || 'text'}</span>
        <p>${this._esc(t.text)}</p>
      </div>`
    ).join('\n');

    const timelineHTML = (board.timeline || []).map(t =>
      `<li><strong>${new Date(t.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</strong> ${this._esc(t.label)}</li>`
    ).join('\n');

    const themeHTML = board.theme ? `
      <div class="theme-section">
        <h3>Applied Style</h3>
        <div class="palette-row">
          ${(board.theme.colors || []).map(c => `<div class="swatch" style="background:${c}"><span>${c}</span></div>`).join('')}
        </div>
        <p><strong>Source:</strong> ${board.theme.sourceUrl || 'Custom'} • <strong>Layout:</strong> ${board.theme.layoutStyle || 'N/A'}</p>
      </div>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${this._esc(board.title || 'IdeaForge Report')}</title>
  <style>
    @page { margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; line-height: 1.6; padding: 40px; max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 4px; }
    h2 { font-size: 1.3rem; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e0e0e0; color: #333; }
    h3 { font-size: 1rem; margin-bottom: 8px; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 24px; }
    .meta span { margin-right: 16px; }
    .stats { display: flex; gap: 24px; margin: 16px 0; }
    .stat { background: #f5f5f5; padding: 12px 20px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #6366f1; }
    .stat-label { font-size: 0.8rem; color: #888; }

    .section { margin-bottom: 32px; page-break-inside: avoid; }
    .section-title { font-size: 1.1rem; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { border: 1px solid #e8e8e8; border-radius: 10px; overflow: hidden; }
    .card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
    .card-caption { padding: 8px 12px; font-size: 0.8rem; color: #666; }

    .palette-row { display: flex; gap: 8px; margin: 8px 0; }
    .swatch { width: 60px; height: 40px; border-radius: 6px; display: flex; align-items: end; justify-content: center; border: 1px solid #ddd; }
    .swatch span { font-size: 0.6rem; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5); padding-bottom: 2px; }

    .transcript-entry { margin-bottom: 8px; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
    .transcript-entry .ts { font-size: 0.75rem; color: #999; margin-right: 8px; }
    .transcript-entry .source { font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: #f0f0f0; color: #666; }
    .transcript-entry p { margin-top: 4px; }

    .timeline { list-style: none; }
    .timeline li { padding: 4px 0; font-size: 0.85rem; }
    .timeline li strong { color: #6366f1; margin-right: 8px; }

    .theme-section { background: #f8f8fc; padding: 16px; border-radius: 10px; margin: 16px 0; }

    @media print {
      body { padding: 0; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>🎨 ${this._esc(board.title || 'IdeaForge Session')}</h1>
  <div class="meta">
    <span>📅 ${meta?.startedAt ? new Date(meta.startedAt).toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown date'}</span>
    <span>⏱ Started ${meta?.startedAt ? new Date(meta.startedAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-value">${board.sections?.length || 0}</div><div class="stat-label">Sections</div></div>
    <div class="stat"><div class="stat-value">${(board.sections || []).reduce((s, sec) => s + (sec.elements || []).length, 0)}</div><div class="stat-label">Elements</div></div>
    <div class="stat"><div class="stat-value">${(concepts || []).length}</div><div class="stat-label">Concepts</div></div>
    <div class="stat"><div class="stat-value">${(transcript || []).length}</div><div class="stat-label">Inputs</div></div>
  </div>

  ${themeHTML}

  <h2>Moodboard</h2>
  ${sections || '<p style="color:#999">No sections generated.</p>'}

  ${transcriptHTML ? `<h2>Transcript</h2>${transcriptHTML}` : ''}
  ${timelineHTML ? `<h2>Timeline</h2><ul class="timeline">${timelineHTML}</ul>` : ''}

  <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 0.75rem; color: #aaa; text-align: center;">
    Generated by IdeaForge • ${new Date().toLocaleDateString('en')}
  </div>
</body>
</html>`;
  }

  _renderSection(section) {
    const cards = (section.elements || []).map(el => {
      let imgSrc = '';
      if (el.type === 'image' && el.src) {
        const imgPath = el.src.startsWith('/assets/')
          ? path.join(this.assetsDir, el.src.slice(8))
          : path.join(this.sessionDir, el.src);
        try {
          const data = fs.readFileSync(imgPath);
          const ext = path.extname(imgPath).toLowerCase();
          const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext] || 'image/png';
          imgSrc = `data:${mime};base64,${data.toString('base64')}`;
        } catch (e) { imgSrc = el.src; }
      }
      return `<div class="card">
        ${imgSrc ? `<img src="${imgSrc}" alt="${this._esc(el.label || '')}">` : ''}
        ${el.label ? `<div class="card-caption">${this._esc(el.label)}</div>` : ''}
      </div>`;
    }).join('\n');

    return `<div class="section">
      <div class="section-title">${this._esc(section.label)} · ${(section.elements || []).length}</div>
      <div class="grid">${cards}</div>
    </div>`;
  }

  _readJSON(filename) {
    const p = path.join(this.sessionDir, filename);
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return null; }
  }

  _esc(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = { PdfExporter };
