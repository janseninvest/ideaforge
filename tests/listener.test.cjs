'use strict';

const { processAudioFile, processAudioBuffer, buildCurlCommand } = require('../src/data/audio-provider.cjs');
const { ListenerAgent } = require('../src/agents/listener-agent.cjs');
const { MeetingMemory } = require('../src/memory/meeting-memory.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

// --- Test 1: Audio Provider (curl command formation) ---
console.log('\n🎤 Audio Provider Tests');

(() => {
  // Test curl command is correctly formed
  const origKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key-123';
  try {
    const cmd = buildCurlCommand('/tmp/test.wav', 'no');
    assert(cmd.includes('whisper-1'), 'curl command includes whisper-1 model');
    assert(cmd.includes('test-key-123'), 'curl command includes API key');
    assert(cmd.includes('language=no'), 'curl command includes Norwegian language');
    assert(cmd.includes('verbose_json'), 'curl command requests verbose JSON');
    assert(cmd.includes('file=@"/tmp/test.wav"'), 'curl command includes file path');
  } finally {
    if (origKey) process.env.OPENAI_API_KEY = origKey;
    else delete process.env.OPENAI_API_KEY;
  }
})();

// Test with real Whisper API if key available
if (process.env.OPENAI_API_KEY) {
  console.log('\n🎤 Audio Provider - Live Whisper API Test');
  (() => {
    // Generate a minimal WAV file (silence, 0.5 seconds, 16kHz mono 16-bit)
    const sampleRate = 16000;
    const duration = 0.5;
    const numSamples = Math.floor(sampleRate * duration);
    const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
    const headerSize = 44;
    const buf = Buffer.alloc(headerSize + dataSize);

    // WAV header
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16); // chunk size
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // mono
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buf.writeUInt16LE(2, 32); // block align
    buf.writeUInt16LE(16, 34); // bits per sample
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    // data is already zeros (silence)

    const tmpWav = path.join(os.tmpdir(), `ideaforge-test-${Date.now()}.wav`);
    fs.writeFileSync(tmpWav, buf);

    try {
      const result = processAudioFile(tmpWav);
      assert(typeof result.text === 'string', 'Whisper returned text field');
      assert(result.language != null, 'Whisper returned language field');
      console.log(`    Transcript: "${result.text}" (${result.duration_seconds}s)`);
    } catch (e) {
      console.log(`    ⚠️  Whisper API call failed (may be expected): ${e.message.slice(0, 100)}`);
    } finally {
      try { fs.unlinkSync(tmpWav); } catch (_) {}
    }
  })();
} else {
  console.log('  ⏭️  Skipping live Whisper test (no OPENAI_API_KEY)');
}

// --- Test 2: Listener Agent ---
console.log('\n🧠 Listener Agent Tests');

(async () => {
  const agent = new ListenerAgent();

  // Test shouldGenerateVisual
  assert(agent.shouldGenerateVisual({ confidence: 0.8, action: 'generate_moodboard_element' }) === true, 'shouldGenerateVisual: high confidence → true');
  assert(agent.shouldGenerateVisual({ confidence: 0.2, action: 'generate_moodboard_element' }) === false, 'shouldGenerateVisual: low confidence → false');
  assert(agent.shouldGenerateVisual({ confidence: 0.8, action: 'wait' }) === false, 'shouldGenerateVisual: wait action → false');
  assert(agent.shouldGenerateVisual(null) === false, 'shouldGenerateVisual: null → false');

  // Live API test
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('\n🧠 Listener Agent - Live API Test');
    try {
      const result = await agent.extractConcepts(
        'Jeg ser for meg noe minimalistisk med skandinaviske farger, mye hvitt og lyst tre'
      );
      assert(Array.isArray(result.concepts), 'extractConcepts returned concepts array');
      assert(result.concepts.length > 0, 'concepts array is non-empty');
      assert(typeof result.mood === 'string' && result.mood.length > 0, 'mood is a non-empty string');
      assert(typeof result.image_prompt_suggestion === 'string', 'image_prompt_suggestion exists');
      assert(typeof result.confidence === 'number', 'confidence is a number');
      assert(typeof result.action === 'string', 'action is a string');
      console.log('    Concepts:', result.concepts);
      console.log('    Mood:', result.mood);
      console.log('    Image prompt:', result.image_prompt_suggestion);
      console.log('    Confidence:', result.confidence);
    } catch (e) {
      console.log(`    ⚠️  Anthropic API call failed: ${e.message.slice(0, 150)}`);
    }
  } else {
    console.log('  ⏭️  Skipping live Anthropic test (no ANTHROPIC_API_KEY)');
  }

  // --- Test 3: Meeting Memory ---
  console.log('\n📝 Meeting Memory Tests');

  const testDir = path.join(os.tmpdir(), `ideaforge-test-sessions-${Date.now()}`);
  const memory = new MeetingMemory('test-session-001', testDir);

  assert(fs.existsSync(memory.sessionDir), 'Session directory created');

  // Add transcripts
  memory.addTranscript('Hei, la oss snakke om designet');
  memory.addTranscript('Jeg tenker skandinavisk minimalistisk');
  memory.addTranscript({ text: 'Med mye hvitt og naturlige materialer', speaker: 'Aksel' });

  const fullTranscript = memory.getFullTranscript();
  assert(fullTranscript.includes('designet'), 'Full transcript contains first segment');
  assert(fullTranscript.includes('minimalistisk'), 'Full transcript contains second segment');
  assert(fullTranscript.includes('naturlige'), 'Full transcript contains third segment');

  // Add concepts
  memory.addConcepts({
    timestamp: new Date().toISOString(),
    concepts: ['minimalism', 'scandinavian'],
    mood: 'calm, clean',
    visual_keywords: ['white', 'wood', 'light'],
    color_palette_suggestion: ['#FFFFFF', '#E8D5B7', '#F5F5F0'],
    action: 'generate_moodboard_element',
    confidence: 0.9,
  });
  memory.addConcepts({
    timestamp: new Date().toISOString(),
    concepts: ['natural materials'],
    mood: 'organic',
    visual_keywords: ['birch', 'linen'],
    action: 'refine_existing',
    confidence: 0.7,
  });

  const recent = memory.getRecentContext(1);
  assert(recent.length === 1, 'getRecentContext(1) returns 1 item');
  assert(recent[0].concepts.includes('natural materials'), 'Recent context has correct data');

  const allConcepts = memory.getRecentContext(10);
  assert(allConcepts.length === 2, 'getRecentContext(10) returns all 2 items');

  // Add asset
  memory.addAsset({ type: 'moodboard_element', path: '/tmp/img1.png', prompt: 'scandinavian minimal' });

  // Summary
  const summary = memory.getSessionSummary();
  assert(summary.sessionId === 'test-session-001', 'Summary has correct sessionId');
  assert(summary.totalSegments === 3, 'Summary shows 3 transcript segments');
  assert(summary.totalConceptBundles === 2, 'Summary shows 2 concept bundles');
  assert(summary.totalAssets === 1, 'Summary shows 1 asset');
  assert(summary.uniqueConcepts.includes('minimalism'), 'Summary includes minimalism concept');

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });

  // --- Summary ---
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
