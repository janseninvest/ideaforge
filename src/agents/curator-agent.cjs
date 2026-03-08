'use strict';

const logger = require('../utils/logger.cjs');

class CuratorAgent {
  constructor(config = {}) {
    this.model = config.model || 'gpt-4o-mini';
    this.maxBoardElements = config.maxBoardElements || 20;
    this.autoRemoveWeak = config.autoRemoveWeak !== false;
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    // Determine which API to use based on available key
    this._useAnthropic = !!process.env.ANTHROPIC_API_KEY;
  }

  async curate(visuals, meetingMemory, currentBoard) {
    logger.info('curator', `Curating ${visuals.length} visual assets`);
    if (!this.apiKey) throw new Error('No API key set (ANTHROPIC_API_KEY or OPENAI_API_KEY)');

    const context = meetingMemory.getContext();
    const totalElements = (currentBoard.sections || []).reduce((sum, s) => sum + (s.elements || []).length, 0);

    const systemPrompt = 'You are a creative director organizing a visual moodboard. Arrange visual elements into coherent themes. Keep the board clean and impactful — less is more. Remove weak images. Group by visual/thematic similarity. Always respond with valid JSON.';

    const userPrompt = `Current board:
${JSON.stringify(currentBoard.sections?.map(s => ({ label: s.label, id: s.id, elementCount: (s.elements || []).length })) || [], null, 2)}

Current mood: ${JSON.stringify(currentBoard.mood || null)}
Total elements: ${totalElements} / ${this.maxBoardElements}

Recent concepts: ${JSON.stringify(context.recentConcepts, null, 2)}

Meeting context: ${context.recentTranscript}

New visual assets:
${JSON.stringify(visuals.map(v => ({ id: v.id, concept: v.concept, prompt: v.prompt, type: v.type })), null, 2)}

${this.autoRemoveWeak ? `Auto-remove ON. Max ${this.maxBoardElements} elements.` : ''}

Return JSON:
{
  "add_sections": [{ "id": "unique-id", "label": "Theme Name", "elements": [{ "id": "vis_id", "annotation": "note" }] }],
  "add_to_existing": [{ "sectionId": "existing-id", "elements": [{ "id": "vis_id", "annotation": "note" }] }],
  "remove_elements": [],
  "update_mood": { "description": "mood text", "gradient": ["#hex1", "#hex2"] },
  "timeline_event": "description of change"
}`;

    let text;
    if (this._useAnthropic) {
      text = await this._callAnthropic(systemPrompt, userPrompt);
    } else {
      text = await this._callOpenAI(systemPrompt, userPrompt);
    }

    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const parsed = JSON.parse(jsonMatch[1].trim());

      const result = {
        action: 'update',
        add_sections: parsed.add_sections || [],
        add_to_existing: parsed.add_to_existing || [],
        remove_elements: parsed.remove_elements || [],
        update_mood: parsed.update_mood || null,
        timeline_event: parsed.timeline_event || `Added ${visuals.length} visual elements`,
      };

      // Ensure IDs and attach visual data
      for (const section of result.add_sections) {
        if (!section.id) section.id = `section_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        for (const el of (section.elements || [])) {
          const visual = visuals.find(v => v.id === el.id);
          if (visual) Object.assign(el, visual);
        }
      }
      for (const update of result.add_to_existing) {
        for (const el of (update.elements || [])) {
          const visual = visuals.find(v => v.id === el.id);
          if (visual) Object.assign(el, visual);
        }
      }

      logger.info('curator', `Board update: +${result.add_sections.length} sections, -${result.remove_elements.length} removed`);
      return result;
    } catch (e) {
      logger.error('curator', `Parse failed: ${e.message}`);
      return this._fallback(visuals);
    }
  }

  async _callAnthropic(system, user) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '{}';
  }

  async _callOpenAI(system, user) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '{}';
  }

  _fallback(visuals) {
    const sectionId = `section_${Date.now()}`;
    return {
      action: 'update',
      add_sections: [{
        id: sectionId,
        label: visuals[0]?.concept || 'New Visuals',
        elements: visuals,
      }],
      add_to_existing: [],
      remove_elements: [],
      update_mood: null,
      timeline_event: `Added ${visuals.length} visual elements (auto-grouped)`,
    };
  }
}

module.exports = { CuratorAgent };
