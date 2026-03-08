#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon',
};

function parseArgs(argv) {
  const args = { port: 3333, session: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) args.port = parseInt(argv[++i], 10);
    if (argv[i] === '--session' && argv[i + 1]) args.session = argv[++i];
  }
  return args;
}

function createServer(opts = {}) {
  const port = opts.port || 3333;
  const sessionDir = opts.sessionDir;
  const publicDir = opts.publicDir || path.join(__dirname, 'public');
  const boardPath = path.join(sessionDir, 'board.json');
  const assetsDir = path.join(sessionDir, 'assets');

  const sseClients = new Set();
  let watcher = null;

  function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  function serveFile(filePath, res) {
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  function broadcast() {
    for (const client of sseClients) {
      client.write(`data: {"type":"update"}\n\n`);
    }
  }

  // Audio processing callback — set by DirectorAgent
  let onAudioReceived = opts.onAudioReceived || null;
  let onTextReceived = opts.onTextReceived || null;

  const server = http.createServer((req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://0.0.0.0:${port}`);
    const pathname = url.pathname;

    // SSE events
    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(`data: {"type":"connected"}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Board data
    if (pathname === '/api/board') {
      serveFile(boardPath, res);
      return;
    }

    // Audio upload from browser mic
    if (pathname === '/api/upload-audio' && req.method === 'POST') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        const audioFile = path.join(sessionDir, 'audio', `chunk_${Date.now()}.webm`);
        fs.mkdirSync(path.dirname(audioFile), { recursive: true });
        fs.writeFileSync(audioFile, buffer);
        console.log(`[server] Audio received: ${(buffer.length / 1024).toFixed(0)}KB → ${audioFile}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (onAudioReceived) {
          try {
            const result = await onAudioReceived(audioFile);
            res.end(JSON.stringify({ status: 'ok', ...result }));
          } catch (e) {
            console.error('[server] Audio processing error:', e.message);
            res.end(JSON.stringify({ status: 'error', error: e.message }));
          }
        } else {
          res.end(JSON.stringify({ status: 'saved', file: audioFile }));
        }
      });
      return;
    }

    // Text input from browser
    if (pathname === '/api/send-text' && req.method === 'POST') {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const text = body.text || '';
          console.log(`[server] Text received: "${text.substring(0, 60)}..."`);

          res.writeHead(200, { 'Content-Type': 'application/json' });

          if (onTextReceived) {
            const result = await onTextReceived(text);
            res.end(JSON.stringify({ status: 'ok', ...result }));
          } else {
            res.end(JSON.stringify({ status: 'received', text }));
          }
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', error: e.message }));
        }
      });
      return;
    }

    // Status endpoint
    if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'running', clients: sseClients.size, hasAudioHandler: !!onAudioReceived }));
      return;
    }

    // Assets
    if (pathname.startsWith('/assets/')) {
      const assetPath = path.join(assetsDir, pathname.slice(8));
      serveFile(assetPath, res);
      return;
    }

    // Static files from public/
    let filePath = pathname === '/' ? path.join(publicDir, 'index.html') : path.join(publicDir, pathname.slice(1));
    serveFile(filePath, res);
  });

  function setAudioHandler(fn) { onAudioReceived = fn; }
  function setTextHandler(fn) { onTextReceived = fn; }

  function start() {
    return new Promise((resolve) => {
      server.listen(port, '0.0.0.0', () => {
        const nets = require('os').networkInterfaces();
        const ips = Object.values(nets).flat().filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address);
        console.log(`Moodboard server running at http://localhost:${port}`);
        if (ips.length) console.log(`Network access: ${ips.map(ip => 'http://' + ip + ':' + port).join(', ')}`);
        // Watch board.json
        try {
          fs.mkdirSync(path.dirname(boardPath), { recursive: true });
          if (!fs.existsSync(boardPath)) {
            fs.writeFileSync(boardPath, JSON.stringify({ title: '', startedAt: new Date().toISOString(), mood: {}, sections: [], timeline: [] }, null, 2));
          }
          watcher = fs.watch(boardPath, { persistent: false }, () => broadcast());
        } catch (e) { /* ignore watch errors */ }
        resolve(server);
      });
    });
  }

  function stop() {
    return new Promise((resolve) => {
      if (watcher) watcher.close();
      for (const client of sseClients) client.end();
      sseClients.clear();
      server.close(resolve);
    });
  }

  return { server, start, stop, broadcast, port, setAudioHandler, setTextHandler };
}

// CLI mode
if (require.main === module) {
  const args = parseArgs(process.argv);
  if (!args.session) { console.error('Usage: node server.cjs --session <sessionId> [--port 3333]'); process.exit(1); }
  const sessionDir = path.resolve('sessions', args.session);
  const s = createServer({ port: args.port, sessionDir });
  s.start();
}

module.exports = { createServer };
