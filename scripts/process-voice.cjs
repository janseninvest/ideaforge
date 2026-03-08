'use strict';

/**
 * Process a voice message / audio file through the full pipeline.
 * Usage: node scripts/process-voice.cjs <sessionId> <audioFile>
 * 
 * Can also be used as a module:
 *   const { processVoice } = require('./process-voice.cjs');
 *   await processVoice(sessionId, '/path/to/audio.ogg');
 */

const { DirectorAgent } = require('../src/agents/director-agent.cjs');
const path = require('path');
const fs = require('fs');

async function processVoice(sessionId, audioFile) {
  if (!fs.existsSync(audioFile)) {
    throw new Error(`Audio file not found: ${audioFile}`);
  }

  const director = new DirectorAgent();
  
  // Load existing session
  const sessionDir = path.join(__dirname, '..', 'sessions', sessionId);
  if (!fs.existsSync(sessionDir)) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  director._sessionId = sessionId;
  director._sessionDir = sessionDir;

  console.log(`Processing audio: ${path.basename(audioFile)}`);
  const result = await director.processAudioChunk(audioFile);
  console.log(`✅ Transcript: "${result.transcript?.substring(0, 100)}..."`);
  console.log(`   Concepts: ${result.conceptsExtracted}, Images: ${result.imagesGenerated}`);
  
  return result;
}

if (require.main === module) {
  const [sessionId, audioFile] = process.argv.slice(2);
  if (!sessionId || !audioFile) {
    console.error('Usage: node scripts/process-voice.cjs <sessionId> <audioFile>');
    process.exit(1);
  }
  processVoice(sessionId, audioFile).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { processVoice };
