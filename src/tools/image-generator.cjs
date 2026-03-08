// image-generator.cjs — Image generation via DALL-E 3 and Gemini
const fs = require('fs');
const path = require('path');

async function generateWithDalle(prompt, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: options.size || '1024x1024',
      quality: options.quality || 'standard',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DALL-E API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const img = data.data[0];
  return { url: img.url, revised_prompt: img.revised_prompt, provider: 'dalle' };
}

async function generateWithGemini(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  
  for (const part of parts) {
    if (part.inlineData) {
      return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType, provider: 'gemini' };
    }
  }
  
  // No image in response
  const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
  throw new Error(`Gemini returned no image. Text: ${textParts.slice(0, 200)}`);
}

async function generateImages(conceptBundle, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const mainPrompt = conceptBundle.image_prompt_suggestion || conceptBundle.summary || 'abstract concept visualization';
  const keywords = (conceptBundle.visual_keywords || []).join(', ');
  const altPrompt = keywords ? `${mainPrompt}, featuring: ${keywords}` : mainPrompt;

  const slug = (mainPrompt.slice(0, 40)).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const results = [];

  // Run both in parallel
  const [dalleResult, geminiResult] = await Promise.allSettled([
    generateWithDalle(mainPrompt),
    generateWithGemini(altPrompt),
  ]);

  // Save DALL-E image
  if (dalleResult.status === 'fulfilled') {
    const d = dalleResult.value;
    const filename = `dalle-${slug}.png`;
    const filePath = path.join(outputDir, filename);
    try {
      const imgRes = await fetch(d.url);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(filePath, buf);
      results.push({ path: filePath, prompt: mainPrompt, provider: 'dalle', concept: conceptBundle.concept || mainPrompt, timestamp: new Date().toISOString() });
      console.log(`[image-gen] DALL-E saved: ${filename}`);
    } catch (e) {
      console.error(`[image-gen] Failed to download DALL-E image: ${e.message}`);
    }
  } else {
    console.error(`[image-gen] DALL-E failed: ${dalleResult.reason?.message}`);
  }

  // Save Gemini image
  if (geminiResult.status === 'fulfilled') {
    const g = geminiResult.value;
    const ext = (g.mimeType || 'image/png').includes('jpeg') ? 'jpg' : 'png';
    const filename = `gemini-${slug}.${ext}`;
    const filePath = path.join(outputDir, filename);
    try {
      if (g.base64) {
        fs.writeFileSync(filePath, Buffer.from(g.base64, 'base64'));
      } else if (g.url) {
        const imgRes = await fetch(g.url);
        fs.writeFileSync(filePath, Buffer.from(await imgRes.arrayBuffer()));
      }
      results.push({ path: filePath, prompt: altPrompt, provider: 'gemini', concept: conceptBundle.concept || mainPrompt, timestamp: new Date().toISOString() });
      console.log(`[image-gen] Gemini saved: ${filename}`);
    } catch (e) {
      console.error(`[image-gen] Failed to save Gemini image: ${e.message}`);
    }
  } else {
    console.error(`[image-gen] Gemini failed: ${geminiResult.reason?.message}`);
  }

  return results;
}

module.exports = { generateWithDalle, generateWithGemini, generateImages };
