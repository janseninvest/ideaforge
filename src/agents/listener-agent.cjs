'use strict';

const fs = require('fs');

let logger;
try { logger = require('../utils/logger.cjs'); } catch (_) {
  logger = { info: () => {}, warn: () => {}, error: () => {} };
}

const SYSTEM_PROMPT = `You are a creative meeting analyst. Extract visual concepts, mood, and intent from meeting dialogue. Always respond in valid JSON.

When the input is in Norwegian (or any non-English language), translate all concepts, visual keywords, and image prompts to English. Keep the original transcript_segment as-is.

Respond with exactly this JSON structure:
{
  "timestamp": "ISO 8601 timestamp",
  "transcript_segment": "the original text",
  "concepts": ["concept1", "concept2"],
  "mood": "descriptive mood string",
  "visual_keywords": ["keyword1", "keyword2"],
  "color_palette_suggestion": ["#hex1", "#hex2", "#hex3"],
  "intent": "what the speaker wants to achieve",
  "action": "generate_moodboard_element|wait|refine_existing",
  "image_prompt_suggestion": "English prompt for image generation based on concepts",
  "confidence": 0.85
}`;

class ListenerAgent {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.OPENAI_API_KEY || null;
    this.model = opts.model || 'gpt-4o-mini';
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.openaiKey = opts.openaiKey || process.env.OPENAI_API_KEY || null;
    this.whisperModel = opts.whisperModel || 'whisper-1';
    this.language = opts.language || 'no';
  }

  _getApiKey() {
    if (this.apiKey) return this.apiKey;
    throw new Error('OPENAI_API_KEY not set');
  }

  /**
   * Extract structured concepts from a transcript segment.
   * @param {string} transcript - The transcript text
   * @param {string} [meetingContext] - Accumulated meeting context
   * @returns {Promise<object>} Concept bundle
   */
  async extractConcepts(transcript, meetingContext = '') {
    const apiKey = this._getApiKey();
    logger.info?.('listener', 'Extracting concepts from transcript');

    let userPrompt = `Analyze this transcript segment and extract visual concepts:\n\n"${transcript}"`;
    if (meetingContext) {
      userPrompt += `\n\nMeeting context so far:\n${meetingContext}`;
    }

    const body = {
      model: this.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '{}';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const parsed = JSON.parse(jsonMatch[1].trim());

    if (!parsed.timestamp) parsed.timestamp = new Date().toISOString();
    if (!parsed.transcript_segment) parsed.transcript_segment = transcript;

    return parsed;
  }

  /**
   * Check if a concept bundle should trigger visual generation.
   */
  shouldGenerateVisual(conceptBundle) {
    if (!conceptBundle) return false;
    if (conceptBundle.confidence < 0.3) return false;
    if (conceptBundle.action === 'wait') return false;
    return true;
  }

  /** Legacy compat: transcribe audio via Whisper */
  async transcribe(audioFilePath) {
    const { processAudioFile } = require('../data/audio-provider.cjs');
    const result = processAudioFile(audioFilePath, { language: this.language });
    return result.text;
  }

  async processAudio(audioFilePath) {
    const transcript = await this.transcribe(audioFilePath);
    const concepts = await this.extractConcepts(transcript);
    return { transcript, concepts };
  }

  async processText(text) {
    const concepts = await this.extractConcepts(text);
    return { transcript: text, concepts };
  }
}

module.exports = { ListenerAgent };
