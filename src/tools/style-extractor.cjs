'use strict';

const logger = require('../utils/logger.cjs');

/**
 * Extract visual style (colors, fonts, mood) from a URL using Playwright + GPT-4o-mini.
 */
class StyleExtractor {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
  }

  /**
   * Scrape a URL and extract its visual style.
   * @param {string} url
   * @returns {Promise<{colors: string[], fonts: string[], mood: string, layout: string, description: string}>}
   */
  async extractFromURL(url) {
    logger.info('style-extractor', `Extracting style from: ${url}`);

    // Step 1: Fetch page and extract computed styles
    const pageData = await this._scrapePage(url);

    // Step 2: Use GPT-4o-mini to analyze and create a cohesive style profile
    const style = await this._analyzeStyle(pageData, url);

    return style;
  }

  async _scrapePage(url) {
    // Use fetch + regex to extract CSS colors, fonts, and meta from HTML
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const html = await res.text();

    // Extract colors (hex, rgb, hsl)
    const hexColors = [...new Set((html.match(/#[0-9a-fA-F]{3,8}(?=[;\s"')},])/g) || [])
      .map(c => c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c)
      .filter(c => c.length === 7)
    )];
    const rgbColors = [...new Set((html.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+/g) || []))];

    // Extract font families
    const fonts = [...new Set(
      (html.match(/font-family\s*:\s*([^;}"]+)/gi) || [])
        .map(f => f.replace(/font-family\s*:\s*/i, '').trim().replace(/['"]/g, '').split(',')[0].trim())
        .filter(f => f && !f.startsWith('-') && f.length < 40)
    )];

    // Extract meta info
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i);
    const themeColorMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)/i);

    // Extract background colors from inline styles
    const bgColors = [...new Set(
      (html.match(/background(?:-color)?\s*:\s*([^;}"]+)/gi) || [])
        .map(b => b.replace(/background(?:-color)?\s*:\s*/i, '').trim())
        .filter(b => b.startsWith('#') || b.startsWith('rgb'))
    )];

    return {
      url,
      title: titleMatch?.[1]?.trim() || '',
      description: descMatch?.[1]?.trim() || '',
      themeColor: themeColorMatch?.[1] || null,
      hexColors: hexColors.slice(0, 30),
      rgbColors: rgbColors.slice(0, 10),
      bgColors: bgColors.slice(0, 10),
      fonts: fonts.slice(0, 10),
      htmlLength: html.length,
    };
  }

  async _analyzeStyle(pageData, url) {
    if (!this.apiKey) {
      logger.warn('style-extractor', 'No API key — returning raw extracted data');
      return this._fallbackStyle(pageData);
    }

    const prompt = `Analyze this website's visual style and create a cohesive design profile.

Website: ${url}
Title: ${pageData.title}
Description: ${pageData.description}
Theme color: ${pageData.themeColor || 'none'}
Colors found: ${pageData.hexColors.join(', ')}
Background colors: ${pageData.bgColors.join(', ')}
Fonts found: ${pageData.fonts.join(', ')}

Return a JSON object with:
{
  "primary_colors": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "background_color": "#hex",
  "text_color": "#hex",
  "accent_color": "#hex",
  "fonts": ["Primary Font", "Secondary Font"],
  "mood": "one-line mood description",
  "style_keywords": ["keyword1", "keyword2", "keyword3"],
  "layout_style": "minimalist|editorial|corporate|playful|luxury|tech|organic",
  "description": "2-3 sentence description of the visual identity",
  "image_style_prompt": "prompt suffix to add to DALL-E prompts to match this website's aesthetic"
}

Pick the 5 most representative colors (not #000000 or #ffffff unless they're central to the design). Identify the dominant visual personality.`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a design analyst. Respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';

    try {
      const parsed = JSON.parse(text);
      logger.info('style-extractor', `Style extracted: ${parsed.mood} (${parsed.layout_style})`);
      return {
        colors: parsed.primary_colors || [],
        backgroundColor: parsed.background_color || '#0d1117',
        textColor: parsed.text_color || '#e8e8e8',
        accentColor: parsed.accent_color || '#6b8afd',
        fonts: parsed.fonts || [],
        mood: parsed.mood || '',
        keywords: parsed.style_keywords || [],
        layoutStyle: parsed.layout_style || 'minimalist',
        description: parsed.description || '',
        imageStylePrompt: parsed.image_style_prompt || '',
        sourceUrl: url,
      };
    } catch (e) {
      logger.error('style-extractor', `Parse failed: ${e.message}`);
      return this._fallbackStyle(pageData);
    }
  }

  _fallbackStyle(pageData) {
    const colors = pageData.hexColors.filter(c => c !== '#000000' && c !== '#ffffff').slice(0, 5);
    return {
      colors: colors.length ? colors : ['#6b8afd', '#1e293b', '#e8e8e8', '#0d1117', '#3b82f6'],
      backgroundColor: '#0d1117',
      textColor: '#e8e8e8',
      accentColor: colors[0] || '#6b8afd',
      fonts: pageData.fonts.slice(0, 2),
      mood: 'modern',
      keywords: [],
      layoutStyle: 'minimalist',
      description: `Style from ${pageData.title || pageData.url}`,
      imageStylePrompt: '',
      sourceUrl: pageData.url,
    };
  }
}

module.exports = { StyleExtractor };
