'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getApiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  return key;
}

/**
 * Process an audio file through OpenAI Whisper API.
 * @param {string} filePath - Path to audio file (webm, m4a, mp3, wav, ogg)
 * @param {object} [opts] - Options
 * @param {string} [opts.language='no'] - Language code
 * @returns {{ text: string, language: string, duration_seconds: number|null }}
 */
function processAudioFile(filePath, opts = {}) {
  const language = opts.language || 'no';
  const apiKey = getApiKey();

  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const cmd = [
    'curl', '-s', '-X', 'POST',
    'https://api.openai.com/v1/audio/transcriptions',
    '-H', `"Authorization: Bearer ${apiKey}"`,
    '-F', `file=@"${filePath}"`,
    '-F', 'model=whisper-1',
    '-F', `language=${language}`,
    '-F', 'response_format=verbose_json',
  ].join(' ');

  const result = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
  const parsed = JSON.parse(result);

  return {
    text: parsed.text || '',
    language: parsed.language || language,
    duration_seconds: parsed.duration || null,
  };
}

/**
 * Process an audio buffer through OpenAI Whisper API.
 * @param {Buffer} buffer - Audio data
 * @param {string} format - File extension (e.g. 'wav', 'mp3')
 * @param {object} [opts] - Options
 * @returns {{ text: string, language: string, duration_seconds: number|null }}
 */
function processAudioBuffer(buffer, format = 'wav', opts = {}) {
  const tmpFile = path.join(os.tmpdir(), `ideaforge-audio-${Date.now()}.${format}`);
  try {
    fs.writeFileSync(tmpFile, buffer);
    return processAudioFile(tmpFile, opts);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

/**
 * Build the curl command string (useful for testing/debugging).
 */
function buildCurlCommand(filePath, language = 'no') {
  const apiKey = getApiKey();
  return [
    'curl', '-s', '-X', 'POST',
    'https://api.openai.com/v1/audio/transcriptions',
    '-H', `"Authorization: Bearer ${apiKey}"`,
    '-F', `file=@"${filePath}"`,
    '-F', 'model=whisper-1',
    '-F', `language=${language}`,
    '-F', 'response_format=verbose_json',
  ].join(' ');
}

module.exports = { processAudioFile, processAudioBuffer, buildCurlCommand };
