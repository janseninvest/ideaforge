const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { generatePalette } = require('../src/tools/palette-generator.cjs');
const { generateWithDalle, generateImages } = require('../src/tools/image-generator.cjs');
const { searchReferenceImages } = require('../src/tools/reference-search.cjs');
const { VisualizerAgent } = require('../src/agents/visualizer-agent.cjs');

describe('palette-generator', () => {
  it('generates 5 hex colors for scandinavian mood', async () => {
    const result = await generatePalette('skandinavisk, minimalistisk');
    assert.ok(result.colors, 'should have colors');
    assert.strictEqual(result.colors.length, 5, 'should have exactly 5 colors');
    for (const c of result.colors) {
      assert.match(c, /^#[0-9A-Fa-f]{6}$/, `${c} should be valid hex`);
    }
    assert.ok(result.name, 'should have palette name');
    console.log('Palette:', result);
  });
});

describe('image-generator (DALL-E)', () => {
  it('generates an image URL from DALL-E', async () => {
    const result = await generateWithDalle('A minimalist Scandinavian living room, soft natural light');
    assert.ok(result.url, 'should return image URL');
    assert.strictEqual(result.provider, 'dalle');
    assert.ok(result.revised_prompt, 'should have revised prompt');
    console.log('DALL-E result:', { url: result.url.slice(0, 80) + '...', revised_prompt: result.revised_prompt.slice(0, 80) });
  });
});

describe('image-generator (generateImages)', () => {
  it('saves images to disk', async () => {
    const tmpDir = path.join('/tmp', `ideaforge-test-${Date.now()}`);
    const bundle = {
      concept: 'nordic interior',
      image_prompt_suggestion: 'A cozy Scandinavian cabin interior with warm wooden textures',
      visual_keywords: ['scandinavian', 'minimalist', 'wood', 'light'],
    };
    const results = await generateImages(bundle, tmpDir);
    assert.ok(results.length > 0, 'should have at least one image');
    for (const r of results) {
      assert.ok(fs.existsSync(r.path), `file should exist: ${r.path}`);
      const stat = fs.statSync(r.path);
      assert.ok(stat.size > 1000, `file should be non-trivial: ${stat.size} bytes`);
      console.log(`Saved: ${r.path} (${(stat.size / 1024).toFixed(1)} KB) via ${r.provider}`);
    }
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('reference-search', () => {
  it('returns reference image URLs', async () => {
    const results = await searchReferenceImages(['scandinavian', 'design'], 2);
    assert.ok(results.length > 0, 'should return results');
    for (const r of results) {
      assert.ok(r.url, 'should have URL');
      assert.ok(r.source, 'should have source');
    }
    console.log('References:', results);
  });
});
