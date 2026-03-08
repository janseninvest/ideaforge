// reference-search.cjs — Web reference image finder
async function searchReferenceImages(keywords, count = 3) {
  const keywordStr = Array.isArray(keywords) ? keywords.join(',') : keywords;
  const encoded = encodeURIComponent(keywordStr);
  const results = [];

  // Try Pexels if key available
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    try {
      const res = await fetch(`https://api.pexels.com/v1/search?query=${encoded}&per_page=${count}`, {
        headers: { Authorization: pexelsKey },
      });
      if (res.ok) {
        const data = await res.json();
        for (const photo of (data.photos || [])) {
          results.push({ url: photo.src.large, source: 'pexels', keywords: keywordStr });
        }
        if (results.length) return results;
      }
    } catch (e) {
      console.error(`[ref-search] Pexels failed: ${e.message}`);
    }
  }

  // Fallback: Unsplash source (redirects to random image)
  for (let i = 0; i < count; i++) {
    results.push({
      url: `https://source.unsplash.com/featured/?${encoded}&sig=${Date.now() + i}`,
      source: 'unsplash',
      keywords: keywordStr,
    });
  }

  return results;
}

module.exports = { searchReferenceImages };
