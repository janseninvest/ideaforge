'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger.cjs');
const { searchReferenceImages } = require('../tools/reference-search.cjs');

class VisualizerAgent {
  constructor(config = {}) {
    this.dalleModel = config.dalleModel || 'dall-e-3';
    this.dalleSize = config.dalleSize || '1024x1024';
    this.dalleQuality = config.dalleQuality || 'standard';
    this.maxImages = config.maxImagesPerCycle || 3;
    this.maxRetries = config.maxRetries || 1;
    this.enableReferences = config.enableReferences !== false;
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  async generateImages(concepts, sessionDir) {
    logger.info('visualizer', `Generating images for ${concepts.length} concepts`);
    const results = [];

    const toGenerate = concepts.slice(0, this.maxImages);
    const promises = toGenerate.map(async (concept, i) => {
      // Try generation with retry on failure
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const image = await this._generateDalle(concept.visualPrompt || concept.description);
          const filename = `visual_${Date.now()}_${i}.png`;
          const filepath = path.join(sessionDir, 'assets', filename);
          fs.mkdirSync(path.dirname(filepath), { recursive: true });

          if (image.url) {
            const res = await fetch(image.url);
            if (!res.ok) throw new Error(`Download failed: ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 5000) throw new Error('Image too small — likely broken');
            fs.writeFileSync(filepath, buf);
          } else if (image.b64_json) {
            const buf = Buffer.from(image.b64_json, 'base64');
            if (buf.length < 5000) throw new Error('Image too small — likely broken');
            fs.writeFileSync(filepath, buf);
          } else {
            throw new Error('No image data returned');
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
          if (attempt < this.maxRetries) {
            logger.warn('visualizer', `Generation failed (attempt ${attempt + 1}), retrying: ${e.message}`);
            await new Promise(r => setTimeout(r, 2000));
          } else {
            logger.error('visualizer', `Image generation failed after ${attempt + 1} attempts: ${e.message}`);
            return null;
          }
        }
      }
      return null;
    });

    const settled = await Promise.allSettled(promises);
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }

    // Also fetch web reference images if enabled
    if (this.enableReferences && concepts.length > 0) {
      try {
        const keywords = concepts.map(c => c.keyword || c.description).join(', ');
        const refs = await searchReferenceImages(keywords, 2);
        for (const ref of refs) {
          if (!ref.url) continue;
          try {
            const res = await fetch(ref.url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
            if (!res.ok) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 5000) continue;
            const ext = (res.headers.get('content-type') || '').includes('jpeg') ? 'jpg' : 'png';
            const filename = `ref_${Date.now()}_${results.length}.${ext}`;
            const filepath = path.join(sessionDir, 'assets', filename);
            fs.writeFileSync(filepath, buf);
            results.push({
              id: `ref_${Date.now()}_${results.length}`,
              concept: ref.keywords,
              prompt: `Reference: ${ref.keywords}`,
              path: filepath,
              filename,
              type: 'reference',
              source: ref.source,
            });
          } catch (e) {
            logger.warn('visualizer', `Reference download failed: ${e.message}`);
          }
        }
      } catch (e) {
        logger.warn('visualizer', `Reference search failed: ${e.message}`);
      }
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
        prompt: `${prompt}. Professional photography, high quality, no text, no words, no labels, no watermarks, no titles, no captions. Clean editorial visual.`,
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
