'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger.cjs');

class VisualizerAgent {
  constructor(config = {}) {
    this.dalleModel = config.dalleModel || 'dall-e-3';
    this.dalleSize = config.dalleSize || '1024x1024';
    this.dalleQuality = config.dalleQuality || 'standard';
    this.maxImages = config.maxImagesPerCycle || 3;
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  async generateImages(concepts, sessionDir) {
    logger.info('visualizer', `Generating images for ${concepts.length} concepts`);
    const results = [];

    const toGenerate = concepts.slice(0, this.maxImages);
    const promises = toGenerate.map(async (concept, i) => {
      try {
        const image = await this._generateDalle(concept.visualPrompt || concept.description);
        const filename = `visual_${Date.now()}_${i}.png`;
        const filepath = path.join(sessionDir, 'assets', filename);
        fs.mkdirSync(path.dirname(filepath), { recursive: true });

        if (image.url) {
          const res = await fetch(image.url);
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(filepath, buf);
        } else if (image.b64_json) {
          fs.writeFileSync(filepath, Buffer.from(image.b64_json, 'base64'));
        }

        return {
          id: `vis_${Date.now()}_${i}`,
          concept: concept.keyword || concept.description,
          prompt: concept.visualPrompt || concept.description,
          path: filepath,
          filename,
          type: 'generated',
        };
      } catch (e) {
        logger.error('visualizer', `Image generation failed: ${e.message}`);
        return null;
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }

    return results;
  }

  async generatePalette(mood, colors) {
    logger.info('visualizer', `Generating palette for mood: ${mood}`);
    // Simple palette generation from color keywords
    const colorMap = {
      'earth': '#8B7355', 'green': '#4a7c59', 'blue': '#4a6fa5', 'warm': '#c4956a',
      'cool': '#6b9bc3', 'natural': '#87a96b', 'dark': '#2d3436', 'light': '#f5f0e1',
      'organic': '#6b8e5e', 'nordic': '#7ba7bc', 'forest': '#2d5016', 'ocean': '#1a5276',
      'sand': '#c2b280', 'stone': '#808080', 'wood': '#966F33', 'moss': '#4a5d23',
    };

    const palette = (colors || []).map(c => {
      const key = c.toLowerCase();
      for (const [name, hex] of Object.entries(colorMap)) {
        if (key.includes(name)) return { name: c, hex };
      }
      return { name: c, hex: '#888888' };
    });

    return palette.length > 0 ? palette : [{ name: 'default', hex: '#4a7c59' }];
  }

  async _generateDalle(prompt) {
    if (!this.openaiKey) {
      logger.warn('visualizer', 'No OPENAI_API_KEY — returning placeholder');
      return { url: null, b64_json: null, placeholder: true };
    }

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiKey}`,
      },
      body: JSON.stringify({
        model: this.dalleModel,
        prompt: `Moodboard image: ${prompt}. Professional, high quality, editorial style.`,
        n: 1,
        size: this.dalleSize,
        quality: this.dalleQuality,
      }),
    });
    const data = await res.json();
    return data.data?.[0] || {};
  }
}

module.exports = { VisualizerAgent };
