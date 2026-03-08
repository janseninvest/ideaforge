'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger.cjs');
const { MeetingMemory } = require('../utils/meeting-memory.cjs');
const { ListenerAgent } = require('./listener-agent.cjs');
const { VisualizerAgent } = require('./visualizer-agent.cjs');
const { CuratorAgent } = require('./curator-agent.cjs');
const { PresenterAgent } = require('./presenter-agent.cjs');
const { StyleExtractor } = require('../tools/style-extractor.cjs');

class DirectorAgent {
  constructor(config = {}) {
    this.config = config;
    this.listener = new ListenerAgent(config.listener || {});
    this.visualizer = new VisualizerAgent(config.visualizer || {});
    this.curator = new CuratorAgent(config.curator || {});
    this.styleExtractor = new StyleExtractor();
    this.presenter = null;

    this.session = null;
    this.startTime = null;
    this.activeStyle = null; // URL-extracted style theme
    this.stats = { conceptsExtracted: 0, imagesGenerated: 0, boardUpdates: 0 };
  }

  async startSession(title, briefText) {
    const sessionId = `session_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const baseDir = this.config.session?.baseDir || './sessions';
    const sessionDir = path.resolve(baseDir, sessionId);
    fs.mkdirSync(path.join(sessionDir, 'assets'), { recursive: true });

    // Create presenter with session dir
    this.presenter = new PresenterAgent(sessionDir);
    this.presenter.updateBoard({ title });

    const memory = new MeetingMemory(sessionDir);
    this.session = { id: sessionId, title, dir: sessionDir, memory };
    this.startTime = Date.now();

    // Write session metadata
    fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify({
      id: sessionId, title, startedAt: new Date().toISOString(),
    }, null, 2));

    logger.info('director', `Starting session "${title}" [${sessionId}]`);

    // Start live presenter server
    const port = this.config.server?.port || 3333;
    const srv = await this.presenter.startServer(port);

    // Wire browser handlers to pipeline
    this.presenter.setAudioHandler(async (audioFile) => {
      logger.info('director', `Processing browser audio: ${audioFile}`);
      return this.processAudioChunk(audioFile);
    });
    this.presenter.setTextHandler(async (text) => {
      logger.info('director', `Processing browser text: ${text.substring(0, 60)}...`);
      return this.processTextInput(text);
    });
    this.presenter.setUrlHandler(async (url) => {
      logger.info('director', `Extracting style from URL: ${url}`);
      return this.applyUrlStyle(url);
    });

    const nets = require('os').networkInterfaces();
    const ips = Object.values(nets).flat().filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address);
    const serverUrl = ips.length ? `http://${ips[0]}:${port}` : `http://localhost:${port}`;

    // Pre-process brief if provided
    if (briefText) {
      logger.info('director', 'Processing initial brief...');
      await this.processTextInput(briefText);
    }

    return { sessionId, serverUrl };
  }

  /**
   * Extract style from a URL and apply it as the active theme.
   */
  async applyUrlStyle(url) {
    this._ensureSession();
    const style = await this.styleExtractor.extractFromURL(url);
    this.activeStyle = style;

    // Apply style to board theme
    if (this.presenter) {
      this.presenter.updateBoard({
        theme: {
          colors: style.colors,
          backgroundColor: style.backgroundColor,
          textColor: style.textColor,
          accentColor: style.accentColor,
          fonts: style.fonts,
          layoutStyle: style.layoutStyle,
          sourceUrl: style.sourceUrl,
        },
      });
      this.presenter.updateMood(
        style.mood || style.description,
        style.colors.length >= 2 ? [style.colors[0], style.colors[1]] : ['#6b8afd', '#1e293b']
      );
      this.presenter.addTimelineEvent({
        label: `Style applied from ${new URL(url).hostname}`,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info('director', `Style applied: ${style.mood} (${style.layoutStyle}) from ${url}`);
    return { status: 'styled', style };
  }

  async processAudioChunk(audioFilePath) {
    this._ensureSession();
    logger.info('director', `Processing audio: ${audioFilePath}`);

    const { transcript, concepts } = await this.listener.processAudio(audioFilePath);
    this.session.memory.addTranscript(transcript, 'audio');

    if (concepts.concepts?.length) {
      this.session.memory.addConcepts(concepts.concepts);
      this.stats.conceptsExtracted += concepts.concepts.length;
    }

    if (concepts.action === 'wait') {
      logger.info('director', 'Waiting for more context before generating visuals');
      return { status: 'waiting', conceptsExtracted: concepts.concepts?.length || 0, imagesGenerated: 0, boardUpdated: false };
    }

    return this._generateAndCurate(concepts);
  }

  async processTextInput(text) {
    this._ensureSession();
    logger.info('director', 'Processing text input');

    const { concepts } = await this.listener.processText(text);
    this.session.memory.addTranscript(text, 'text');

    if (concepts.concepts?.length) {
      this.session.memory.addConcepts(concepts.concepts);
      this.stats.conceptsExtracted += concepts.concepts.length;
    }

    if (concepts.action === 'wait') {
      logger.info('director', 'Waiting for more context');
      return { status: 'waiting', conceptsExtracted: concepts.concepts?.length || 0, imagesGenerated: 0, boardUpdated: false };
    }

    return this._generateAndCurate(concepts);
  }

  async _generateAndCurate(concepts) {
    // Build concept objects for the visualizer
    const conceptItems = (concepts.concepts || []).map((c, i) => {
      if (typeof c === 'string') {
        return { keyword: c, description: c, visualPrompt: concepts.image_prompt_suggestion || c };
      }
      return c;
    });

    // Apply active URL style to image prompts
    if (this.activeStyle?.imageStylePrompt) {
      for (const c of conceptItems) {
        c.visualPrompt = `${c.visualPrompt || c.description}. Style: ${this.activeStyle.imageStylePrompt}`;
      }
    }

    const [visuals, palette] = await Promise.all([
      this.visualizer.generateImages(conceptItems, this.session.dir),
      this.visualizer.generatePalette(concepts.mood, concepts.color_palette_suggestion || concepts.colors),
    ]);

    this.session.memory.addVisuals(visuals);
    this.stats.imagesGenerated += visuals.length;

    // Curate into board
    const boardUpdate = await this.curator.curate(visuals, this.session.memory, this.session.memory.getBoard());
    this.session.memory.updateBoard(boardUpdate);
    this.stats.boardUpdates++;

    // Apply to presenter board
    this._applyBoardUpdate(boardUpdate);

    return {
      status: 'updated',
      conceptsExtracted: concepts.concepts?.length || 0,
      imagesGenerated: visuals.length,
      boardUpdated: true,
    };
  }

  _applyBoardUpdate(boardUpdate) {
    if (!this.presenter) return;

    for (const section of (boardUpdate.add_sections || [])) {
      const created = this.presenter.addSection(section.label);
      for (const el of (section.elements || [])) {
        this.presenter.addElement(created.id, {
          id: el.id,
          type: 'image',
          src: el.filename ? `/assets/${el.filename}` : '',
          label: el.annotation || el.concept || '',
        });
      }
    }

    for (const update of (boardUpdate.add_to_existing || [])) {
      for (const el of (update.elements || [])) {
        try {
          this.presenter.addElement(update.sectionId, {
            id: el.id,
            type: 'image',
            src: el.filename ? `/assets/${el.filename}` : '',
            label: el.annotation || el.concept || '',
          });
        } catch (e) {
          logger.warn('director', `Could not add to section ${update.sectionId}: ${e.message}`);
        }
      }
    }

    if (boardUpdate.update_mood) {
      this.presenter.updateMood(boardUpdate.update_mood.description, boardUpdate.update_mood.gradient);
    }

    if (boardUpdate.timeline_event) {
      this.presenter.addTimelineEvent({
        label: boardUpdate.timeline_event,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async processImageInput(imagePath) {
    this._ensureSession();
    logger.info('director', `Processing reference image: ${imagePath}`);

    const filename = path.basename(imagePath);
    const destPath = path.join(this.session.dir, 'assets', filename);
    fs.copyFileSync(imagePath, destPath);

    const visual = {
      id: `ref_${Date.now()}`,
      concept: 'Reference image',
      prompt: 'User-provided reference',
      path: destPath,
      filename,
      type: 'reference',
    };

    this.session.memory.addVisuals([visual]);

    const boardUpdate = await this.curator.curate([visual], this.session.memory, this.session.memory.getBoard());
    this.session.memory.updateBoard(boardUpdate);
    this.stats.boardUpdates++;
    this._applyBoardUpdate(boardUpdate);

    return { status: 'added', imagePath: destPath };
  }

  async exportSession() {
    this._ensureSession();
    logger.info('director', 'Exporting session...');

    // Use presenter's built-in HTML export
    if (this.presenter) {
      const html = this.presenter.exportHTML();
      const exportPath = path.join(this.session.dir, 'export.html');
      fs.writeFileSync(exportPath, html);
      logger.info('director', `Exported to ${exportPath}`);
      return exportPath;
    }

    // Fallback: simple export
    const transcript = this.session.memory.getFullTranscript();
    const concepts = this.session.memory.getAllConcepts();
    const board = this.session.memory.getBoard();

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>IdeaForge Export: ${this.session.title}</title></head>
<body><h1>${this.session.title}</h1>
<h2>Transcript</h2><pre>${transcript || '(none)'}</pre>
<h2>Concepts (${concepts.length})</h2><pre>${JSON.stringify(concepts, null, 2)}</pre>
<h2>Board</h2><pre>${JSON.stringify(board, null, 2)}</pre>
</body></html>`;

    const exportPath = path.join(this.session.dir, 'export.html');
    fs.writeFileSync(exportPath, html);
    return exportPath;
  }

  async endSession() {
    if (!this.session) return;
    logger.info('director', 'Ending session...');

    await this.presenter?.stopServer();

    const duration = Date.now() - this.startTime;
    const summary = {
      id: this.session.id,
      title: this.session.title,
      duration: `${Math.round(duration / 1000)}s`,
      conceptsExtracted: this.stats.conceptsExtracted,
      imagesGenerated: this.stats.imagesGenerated,
      boardUpdates: this.stats.boardUpdates,
      endedAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(this.session.dir, 'summary.json'), JSON.stringify(summary, null, 2));
    logger.info('director', `Session ended. Duration: ${summary.duration}, Concepts: ${summary.conceptsExtracted}, Images: ${summary.imagesGenerated}`);

    this.session = null;
    return summary;
  }

  _ensureSession() {
    if (!this.session) throw new Error('No active session. Call startSession() first.');
  }
}

module.exports = { DirectorAgent };
