// palette-generator.cjs — Color palette from mood keywords

const MOOD_PALETTES = [
  { keys: ['warm', 'cozy', 'hygge'], name: 'Warm Hearth', colors: ['#C45B28', '#E8A87C', '#D4A373', '#FFF8F0', '#3D2B1F'] },
  { keys: ['cold', 'minimalist', 'clean'], name: 'Arctic Minimal', colors: ['#4A90D9', '#A8C8E8', '#E0E8EF', '#F7F9FC', '#2C3E50'] },
  { keys: ['energetic', 'bold', 'vibrant'], name: 'Electric Pulse', colors: ['#E63946', '#FFD166', '#06D6A0', '#FFFDF7', '#1D1D2C'] },
  { keys: ['natural', 'organic', 'earth'], name: 'Forest Floor', colors: ['#556B2F', '#8FBC8F', '#DAA520', '#FAF3E0', '#2E2E2E'] },
  { keys: ['luxury', 'elegant', 'premium'], name: 'Royal Velvet', colors: ['#4A0E4E', '#C9A84C', '#1C1C2E', '#F5F0E8', '#E8E0D0'] },
  { keys: ['playful', 'fun', 'cheerful'], name: 'Candy Pop', colors: ['#FF6B9D', '#FFA07A', '#87CEEB', '#FFF5F5', '#4A3F5C'] },
  { keys: ['scandinavian', 'nordic', 'skandinavisk'], name: 'Nordic Light', colors: ['#5B8A72', '#B8C9BB', '#D4C5A9', '#F5F3EF', '#2D3436'] },
  { keys: ['ocean', 'maritime', 'sea'], name: 'Deep Blue', colors: ['#0077B6', '#00B4D8', '#90E0EF', '#F0F8FF', '#023E58'] },
  { keys: ['sunset', 'dusk', 'evening'], name: 'Golden Hour', colors: ['#FF6F61', '#FFB347', '#6C5B7B', '#FFF5E6', '#2B1B17'] },
  { keys: ['tech', 'digital', 'cyber'], name: 'Neon Circuit', colors: ['#00F5D4', '#7B2FBE', '#0A0A1A', '#1A1A2E', '#E0E0E0'] },
  { keys: ['romantic', 'soft', 'gentle'], name: 'Rose Petal', colors: ['#D4899E', '#F2C6D0', '#A67C94', '#FFF0F5', '#4A3040'] },
  { keys: ['industrial', 'urban', 'raw'], name: 'Concrete Jungle', colors: ['#8B8C89', '#BDC3C7', '#E67E22', '#F2F2F2', '#2C2C2C'] },
  { keys: ['vintage', 'retro', 'nostalgic'], name: 'Faded Memory', colors: ['#C19A6B', '#A0522D', '#CD853F', '#FDF5E6', '#3E2723'] },
  { keys: ['tropical', 'exotic', 'lush'], name: 'Jungle Bloom', colors: ['#FF4500', '#32CD32', '#FFD700', '#FFFACD', '#1B3A26'] },
  { keys: ['zen', 'calm', 'peaceful'], name: 'Still Water', colors: ['#708090', '#A3B5C7', '#C4B7A6', '#F5F5F0', '#3A3A3A'] },
  { keys: ['dark', 'moody', 'dramatic'], name: 'Midnight Drama', colors: ['#8B0000', '#1C1C1C', '#4B0082', '#1A1A1A', '#C0C0C0'] },
  { keys: ['fresh', 'spring', 'new'], name: 'Spring Bloom', colors: ['#77DD77', '#FFB6C1', '#FDFD96', '#FFFFFF', '#3B5323'] },
  { keys: ['autumn', 'fall', 'harvest'], name: 'Harvest Moon', colors: ['#B7410E', '#DAA520', '#8B4513', '#FFF8DC', '#2F1B14'] },
  { keys: ['minimalistisk'], name: 'Pure Form', colors: ['#333333', '#999999', '#CCCCCC', '#FAFAFA', '#111111'] },
];

function matchPalette(mood) {
  const lower = mood.toLowerCase();
  let best = null, bestScore = 0;
  for (const p of MOOD_PALETTES) {
    const score = p.keys.filter(k => lower.includes(k)).length;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}

function varyHex(hex, amount = 15) {
  const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + Math.floor((Math.random() - 0.5) * amount * 2)));
  const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + Math.floor((Math.random() - 0.5) * amount * 2)));
  const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + Math.floor((Math.random() - 0.5) * amount * 2)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

async function generatePalette(mood, concepts = []) {
  const searchStr = [mood, ...(Array.isArray(concepts) ? concepts : [concepts])].join(' ');
  const matched = matchPalette(searchStr);

  if (matched) {
    const colors = matched.colors.map(c => varyHex(c, 10));
    return { colors, mood: searchStr, name: matched.name };
  }

  // Fallback: generate neutral palette with slight randomness
  return {
    colors: ['#5A6378', '#8E9AAF', '#DEE2E6', '#F8F9FA', '#212529'].map(c => varyHex(c, 12)),
    mood: searchStr,
    name: 'Neutral Blend',
  };
}

module.exports = { generatePalette, MOOD_PALETTES };
