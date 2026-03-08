'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PresenterAgent } = require('../src/agents/presenter-agent.cjs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ideaforge-test-'));
  let passed = 0, failed = 0;

  function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ ${msg}`); }
  }

  console.log('PresenterAgent tests\n');

  const agent = new PresenterAgent(tmpDir);
  assert(fs.existsSync(path.join(tmpDir, 'board.json')), 'board.json created');

  // Add data
  agent.updateBoard({ title: 'Test Meeting' });
  const section = agent.addSection('Visuell Stil');
  agent.addElement(section.id, { type: 'image', src: '/assets/test.png', caption: 'Test image' });
  agent.addElement(section.id, { type: 'palette', colors: ['#ff0000', '#00ff00'], name: 'Primary' });
  agent.addElement(section.id, { type: 'keyword', text: 'minimalism', weight: 0.9 });
  agent.addElement(section.id, { type: 'annotation', text: 'Jonas sa: "enklere"' });
  agent.addTimelineEvent({ time: '00:01:00', event: 'Test event', type: 'concept' });
  agent.updateMood('Calm', ['#1a1a2e', '#16213e']);

  const board = agent.getBoard();
  assert(board.title === 'Test Meeting', 'title set');
  assert(board.sections.length === 1, 'one section');
  assert(board.sections[0].elements.length === 4, 'four elements');
  assert(board.mood.gradient.length === 2, 'mood gradient set');

  // Start server
  const port = 30000 + Math.floor(Math.random() * 10000);
  await agent.startServer(port);

  const htmlRes = await fetch(`http://localhost:${port}/`);
  assert(htmlRes.status === 200, 'HTML page returns 200');
  assert(htmlRes.body.includes('Moodboard'), 'HTML contains Moodboard');

  const boardRes = await fetch(`http://localhost:${port}/api/board`);
  assert(boardRes.status === 200, 'Board API returns 200');
  const boardData = JSON.parse(boardRes.body);
  assert(boardData.title === 'Test Meeting', 'Board API returns correct title');
  assert(boardData.sections[0].elements.length === 4, 'Board API returns elements');

  // CORS
  assert(boardRes.headers['access-control-allow-origin'] === '*', 'CORS header present');

  await agent.stopServer();

  // Verify board.json on disk
  const onDisk = JSON.parse(fs.readFileSync(path.join(tmpDir, 'board.json'), 'utf-8'));
  assert(onDisk.title === 'Test Meeting', 'board.json persisted');

  // Export HTML
  const exported = agent.exportHTML();
  assert(exported.includes('Test Meeting'), 'export contains title');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
