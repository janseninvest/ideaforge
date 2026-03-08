'use strict';

// Load .env
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { DirectorAgent } = require('../src/agents/director-agent.cjs');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'default.json'), 'utf-8'));
config.server.port = 3400 + Math.floor(Math.random() * 100);
config.session.baseDir = path.join(__dirname, '..', 'sessions');

describe('DirectorAgent', () => {
  let director;
  let sessionId;
  let serverUrl;
  let sessionDir;

  before(async () => {
    director = new DirectorAgent(config);
  });

  after(async () => {
    if (director?.session) {
      try { await director.endSession(); } catch {}
    }
    if (sessionDir && fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  });

  it('should start a session with a brief', async () => {
    const result = await director.startSession(
      'Test: Bærekraftig Klesmerke',
      'Vi skal designe en ny merkevare for et bærekraftig klesmerke rettet mot unge voksne'
    );

    sessionId = result.sessionId;
    serverUrl = result.serverUrl;
    sessionDir = director.session.dir;

    assert.ok(sessionId, 'sessionId should be set');
    assert.ok(serverUrl, 'serverUrl should be set');
    assert.ok(fs.existsSync(sessionDir), 'session dir should exist');
    assert.ok(fs.existsSync(path.join(sessionDir, 'meta.json')), 'meta.json should exist');
    console.log(`  Session: ${sessionId}`);
    console.log(`  Server: ${serverUrl}`);
  });

  it('should have transcript from brief processing', () => {
    const tp = path.join(sessionDir, 'transcript.json');
    assert.ok(fs.existsSync(tp), 'transcript.json should exist');
    const transcript = JSON.parse(fs.readFileSync(tp, 'utf-8'));
    assert.ok(transcript.length > 0, 'transcript should have entries');
  });

  it('should have extracted concepts', () => {
    const cp = path.join(sessionDir, 'concepts.json');
    assert.ok(fs.existsSync(cp), 'concepts.json should exist');
    const concepts = JSON.parse(fs.readFileSync(cp, 'utf-8'));
    console.log(`  Concepts extracted: ${concepts.length}`);
  });

  it('should have a board.json', () => {
    const bp = path.join(sessionDir, 'board.json');
    assert.ok(fs.existsSync(bp), 'board.json should exist');
    const board = JSON.parse(fs.readFileSync(bp, 'utf-8'));
    assert.ok(board.sections !== undefined, 'board should have sections');
    console.log(`  Board sections: ${board.sections.length}`);
  });

  it('should process text input', async () => {
    const result = await director.processTextInput(
      'Jeg tenker organiske former, jordnære farger, inspirert av norsk natur'
    );
    assert.ok(result.status, 'should return status');
    assert.ok(result.conceptsExtracted >= 0, 'should report concepts');
    console.log(`  Status: ${result.status}, Concepts: ${result.conceptsExtracted}, Images: ${result.imagesGenerated}`);
  });

  it('should have a running server that responds', async () => {
    const res = await fetch(serverUrl);
    assert.strictEqual(res.status, 200, 'server should respond with 200');
    const html = await res.text();
    assert.ok(html.includes('html'), 'should serve HTML');
  });

  it('should serve board API', async () => {
    const res = await fetch(`${serverUrl}/api/board`);
    assert.strictEqual(res.status, 200);
    const board = await res.json();
    assert.ok(board.sections !== undefined, 'API should return board with sections');
  });

  it('should end session and cleanup', async () => {
    const summary = await director.endSession();
    assert.ok(summary, 'should return summary');
    assert.ok(summary.duration, 'should have duration');
    assert.ok(fs.existsSync(path.join(sessionDir, 'summary.json')), 'summary.json should exist');
    console.log(`  Duration: ${summary.duration}, Concepts: ${summary.conceptsExtracted}, Images: ${summary.imagesGenerated}`);

    try {
      await fetch(serverUrl);
      // Server might still respond briefly, that's ok
    } catch {
      // Expected - connection refused
    }
  });
});
