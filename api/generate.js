const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
  }

  try {
    const {
      count = 5,
      postType = 'Instagram reel snippet',
      songTitle,
      artist,
      moment,
      mood,
      message,
    } = req.body;

    if (!songTitle || !artist) {
      return res.status(400).json({ error: 'Song title and artist are required.' });
    }

    const prompt = `Write ${count} Instagram ${
      postType === 'photo' ? 'photo post' : 'reel'
    } captions to accompany a ${
      postType === 'photo' ? 'worship photo inspired by' : 'snippet of'
    } the worship song "${songTitle}" by ${artist}.

About the ${postType === 'photo' ? 'moment' : 'snippet'}:
- The moment in the song: ${moment}
- The mood: ${mood}
- The core message of the song: ${message}

Caption requirements:
- Maximum 2 short lines (${
      postType === 'photo'
        ? 'keep it concise and scannable'
        : 'this is for a reel, so it must be quick to read'
    })
- Each caption should do ONE of these: (a) give brief context for the impactful moment the viewer is ${
      postType === 'photo' ? 'seeing' : 'hearing'
    }, or (b) be warm and encouraging
- The goal is for the viewer to feel appreciation and want to share the moment, NOT to engage with the post
- Do NOT ask for comments, replies, or answers to questions, and do not include any question directed at the audience
- A gentle "send this to someone who needs it" is fine in some options, but not all
- Do not quote or reproduce any lyrics; describe the moment in your own words instead
- Tone: sincere and worshipful, not salesy or overly hyped
- Use at most one emoji per caption (or none)

Return ONLY valid JSON matching this exact structure:
{
  "captions": [
    { "line1": "First short line", "line2": "Second short line (or empty string)" }
  ],
  "shareWorthy": "Explain which 1-2 option numbers are most share-worthy and why."
}`;

    const callGemini = async (modelName) => {
      const cleanName = modelName.replace(/^models\//, '');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${cleanName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      const data = await response.json();
      return { ok: response.ok, status: response.status, data };
    };

    // 1. Try gemini-3.8-flash up to 3 times with short backoff for transient 503 spikes
    let lastError = 'Gemini API error';
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await callGemini('gemini-3.8-flash');
      if (result.ok) {
        const rawText = result.data.candidates?.[0]?.content?.parts?.[0]?.text;
        return res.status(200).json(JSON.parse(rawText));
      }

      lastError = result.data.error?.message || lastError;

      // Stop immediately on auth or bad request errors
      if (result.status !== 503 && result.status !== 429) {
        return res.status(result.status).json({ error: lastError });
      }

      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
      }
    }

    // 2. If still busy, ask Google which Flash models are active on this key and try them
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (listRes.ok) {
      const listData = await listRes.json();
      const backupModels = (listData.models || [])
        .filter(
          (m) =>
            m.supportedGenerationMethods?.includes('generateContent') &&
            m.name.includes('flash') &&
            !m.name.includes('gemini-3.8-flash') &&
            !m.name.includes('2.5-flash')
        )
        .map((m) => m.name);

      for (const backup of backupModels) {
        const result = await callGemini(backup);
        if (result.ok) {
          const rawText = result.data.candidates?.[0]?.content?.parts?.[0]?.text;
          return res.status(200).json(JSON.parse(rawText));
        }
      }
    }

    return res.status(503).json({
      error: 'Google AI is temporarily busy. Please wait 5 seconds and click Generate again.',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate captions.' });
  }
}
