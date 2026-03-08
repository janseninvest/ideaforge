'use strict';

// Load .env file
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const logger = require('./utils/logger.cjs');
const { DirectorAgent } = require('./agents/director-agent.cjs');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'default.json'), 'utf-8'));

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

async function main() {
  if (!command) {
    console.log(`IdeaForge — Real-time meeting intelligence & visual ideation

Usage:
  node src/index.cjs start "Meeting Title" [--brief "text"] [--port 3333]
  node src/index.cjs process-audio <sessionId> <audioFile>
  node src/index.cjs process-text <sessionId> "text input"
  node src/index.cjs export <sessionId>
  node src/index.cjs demo
`);
    return;
  }

  const flags = parseFlags(args.slice(1));
  let director;

  switch (command) {
    case 'start': {
      const title = args[1] || 'Untitled Session';
      if (flags.port) config.server.port = parseInt(flags.port);

      director = new DirectorAgent(config);
      const { sessionId, serverUrl } = await director.startSession(title, flags.brief);

      logger.info('index', `Session started: ${sessionId}`);
      logger.info('index', `Moodboard: ${serverUrl}`);
      logger.info('index', 'Press Ctrl+C to end session');

      process.on('SIGINT', async () => {
        logger.info('index', 'Shutting down...');
        const exportPath = await director.exportSession();
        await director.endSession();
        logger.info('index', `Export: ${exportPath}`);
        process.exit(0);
      });

      await new Promise(() => {});
      break;
    }

    case 'process-text': {
      const sessionId = args[1];
      const text = args[2];
      if (!sessionId || !text) { console.error('Usage: process-text <sessionId> "text"'); process.exit(1); }

      const sessionDir = path.resolve(config.session?.baseDir || './sessions', sessionId);
      if (!fs.existsSync(sessionDir)) { console.error(`Session not found: ${sessionId}`); process.exit(1); }

      director = new DirectorAgent(config);
      const { MeetingMemory } = require('./utils/meeting-memory.cjs');
      const { PresenterAgent } = require('./agents/presenter-agent.cjs');
      director.presenter = new PresenterAgent(sessionDir);
      director.session = { id: sessionId, title: 'Resumed', dir: sessionDir, memory: new MeetingMemory(sessionDir) };
      director.startTime = Date.now();

      const result = await director.processTextInput(text);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'process-audio': {
      const sessionId = args[1];
      const audioFile = args[2];
      if (!sessionId || !audioFile) { console.error('Usage: process-audio <sessionId> <audioFile>'); process.exit(1); }

      const sessionDir = path.resolve(config.session?.baseDir || './sessions', sessionId);
      if (!fs.existsSync(sessionDir)) { console.error(`Session not found: ${sessionId}`); process.exit(1); }

      director = new DirectorAgent(config);
      const { MeetingMemory } = require('./utils/meeting-memory.cjs');
      const { PresenterAgent } = require('./agents/presenter-agent.cjs');
      director.presenter = new PresenterAgent(sessionDir);
      director.session = { id: sessionId, title: 'Resumed', dir: sessionDir, memory: new MeetingMemory(sessionDir) };
      director.startTime = Date.now();

      const result = await director.processAudioChunk(audioFile);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'export': {
      const sessionId = args[1];
      if (!sessionId) { console.error('Usage: export <sessionId>'); process.exit(1); }

      const sessionDir = path.resolve(config.session?.baseDir || './sessions', sessionId);
      if (!fs.existsSync(sessionDir)) { console.error(`Session not found: ${sessionId}`); process.exit(1); }

      director = new DirectorAgent(config);
      const { MeetingMemory } = require('./utils/meeting-memory.cjs');
      const { PresenterAgent } = require('./agents/presenter-agent.cjs');
      director.presenter = new PresenterAgent(sessionDir);
      director.session = { id: sessionId, title: 'Export', dir: sessionDir, memory: new MeetingMemory(sessionDir) };
      director.startTime = Date.now();

      const exportPath = await director.exportSession();
      console.log(`Exported to: ${exportPath}`);
      break;
    }

    case 'demo': {
      logger.info('index', '🎨 Starting IdeaForge demo session...');
      director = new DirectorAgent(config);

      const { sessionId, serverUrl } = await director.startSession(
        'Demo: Bærekraftig Klesmerke',
        'Vi skal designe en ny merkevare for et bærekraftig klesmerke rettet mot unge voksne'
      );

      logger.info('index', `Demo session: ${sessionId}`);
      logger.info('index', `Moodboard: ${serverUrl}`);

      await director.processTextInput('Jeg tenker organiske former, jordnære farger, inspirert av norsk natur');

      logger.info('index', 'Demo inputs processed. Press Ctrl+C to end.');

      process.on('SIGINT', async () => {
        const exportPath = await director.exportSession();
        await director.endSession();
        logger.info('index', `Export: ${exportPath}`);
        process.exit(0);
      });

      await new Promise(() => {});
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(e => {
  logger.error('index', e.message);
  console.error(e.stack);
  process.exit(1);
});
