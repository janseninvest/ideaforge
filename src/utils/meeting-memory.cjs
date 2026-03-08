'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger.cjs');

class MeetingMemory {
  constructor(sessionDir) {
    this.sessionDir = sessionDir;
    this.transcript = [];
    this.concepts = [];
    this.visuals = [];
    this.board = { sections: [], mood: null, timeline: [] };
    this._load();
  }

  _load() {
    const boardPath = path.join(this.sessionDir, 'board.json');
    if (fs.existsSync(boardPath)) {
      try {
        this.board = JSON.parse(fs.readFileSync(boardPath, 'utf-8'));
      } catch (e) {
        logger.warn('memory', 'Failed to load board.json');
      }
    }
  }

  addTranscript(text, source = 'audio') {
    const entry = { text, source, timestamp: new Date().toISOString() };
    this.transcript.push(entry);
    this._appendJson('transcript.json', entry);
  }

  addConcepts(concepts) {
    this.concepts.push(...(Array.isArray(concepts) ? concepts : [concepts]));
    this._writeJson('concepts.json', this.concepts);
  }

  addVisuals(visuals) {
    this.visuals.push(...(Array.isArray(visuals) ? visuals : [visuals]));
    this._writeJson('visuals.json', this.visuals);
  }

  updateBoard(boardUpdate) {
    if (boardUpdate.add_sections) {
      this.board.sections.push(...boardUpdate.add_sections);
    }
    if (boardUpdate.add_to_existing) {
      for (const update of boardUpdate.add_to_existing) {
        const section = this.board.sections.find(s => s.id === update.sectionId || s.label === update.sectionId);
        if (section) {
          section.elements = (section.elements || []).concat(update.elements);
        }
      }
    }
    if (boardUpdate.remove_elements) {
      for (const section of this.board.sections) {
        section.elements = (section.elements || []).filter(e => !boardUpdate.remove_elements.includes(e.id));
      }
    }
    if (boardUpdate.update_mood) {
      this.board.mood = boardUpdate.update_mood;
    }
    if (boardUpdate.timeline_event) {
      this.board.timeline = this.board.timeline || [];
      this.board.timeline.push({ event: boardUpdate.timeline_event, timestamp: new Date().toISOString() });
    }
    this._writeJson('board.json', this.board);
  }

  getContext() {
    return {
      recentTranscript: this.transcript.slice(-10).map(t => t.text).join('\n'),
      conceptCount: this.concepts.length,
      recentConcepts: this.concepts.slice(-5),
      boardSections: this.board.sections.map(s => ({ label: s.label, elementCount: (s.elements || []).length })),
      mood: this.board.mood,
    };
  }

  getFullTranscript() { return this.transcript.map(t => t.text).join('\n'); }
  getAllConcepts() { return this.concepts; }
  getAllVisuals() { return this.visuals; }
  getBoard() { return this.board; }

  _writeJson(filename, data) {
    fs.writeFileSync(path.join(this.sessionDir, filename), JSON.stringify(data, null, 2));
  }

  _appendJson(filename, entry) {
    const fp = path.join(this.sessionDir, filename);
    let arr = [];
    if (fs.existsSync(fp)) {
      try { arr = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {}
    }
    arr.push(entry);
    fs.writeFileSync(fp, JSON.stringify(arr, null, 2));
  }
}

module.exports = { MeetingMemory };
