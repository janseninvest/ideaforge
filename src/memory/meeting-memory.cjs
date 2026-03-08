'use strict';

const fs = require('fs');
const path = require('path');

class MeetingMemory {
  /**
   * @param {string} sessionId
   * @param {string} [baseDir] - Override base sessions directory
   */
  constructor(sessionId, baseDir) {
    this.sessionId = sessionId;
    const base = baseDir || path.join(require('os').homedir(), 'projects', 'ideaforge', 'sessions');
    this.sessionDir = path.join(base, sessionId);
    fs.mkdirSync(this.sessionDir, { recursive: true });

    this.transcriptFile = path.join(this.sessionDir, 'transcript.jsonl');
    this.conceptsFile = path.join(this.sessionDir, 'concepts.jsonl');
    this.assetsFile = path.join(this.sessionDir, 'assets.jsonl');
  }

  _appendJsonl(file, obj) {
    fs.appendFileSync(file, JSON.stringify(obj) + '\n');
  }

  _readJsonl(file) {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l));
  }

  addTranscript(segment) {
    const entry = {
      timestamp: new Date().toISOString(),
      text: typeof segment === 'string' ? segment : segment.text,
      ...(typeof segment === 'object' ? segment : {}),
    };
    this._appendJsonl(this.transcriptFile, entry);
    return entry;
  }

  addConcepts(conceptBundle) {
    this._appendJsonl(this.conceptsFile, conceptBundle);
    return conceptBundle;
  }

  addAsset(assetInfo) {
    const entry = { timestamp: new Date().toISOString(), ...assetInfo };
    this._appendJsonl(this.assetsFile, entry);
    return entry;
  }

  getFullTranscript() {
    return this._readJsonl(this.transcriptFile)
      .map(e => e.text)
      .join(' ');
  }

  getRecentContext(lastN = 5) {
    const concepts = this._readJsonl(this.conceptsFile);
    return concepts.slice(-lastN);
  }

  getSessionSummary() {
    const transcripts = this._readJsonl(this.transcriptFile);
    const concepts = this._readJsonl(this.conceptsFile);
    const assets = this._readJsonl(this.assetsFile);

    const allConcepts = concepts.flatMap(c => c.concepts || []);
    const allKeywords = concepts.flatMap(c => c.visual_keywords || []);
    const allMoods = concepts.map(c => c.mood).filter(Boolean);

    return {
      sessionId: this.sessionId,
      totalSegments: transcripts.length,
      totalConceptBundles: concepts.length,
      totalAssets: assets.length,
      uniqueConcepts: [...new Set(allConcepts)],
      uniqueKeywords: [...new Set(allKeywords)],
      moods: allMoods,
      startTime: transcripts[0]?.timestamp || null,
      lastUpdate: transcripts[transcripts.length - 1]?.timestamp || null,
    };
  }
}

module.exports = { MeetingMemory };
