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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`,
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

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'Gemini API error',
      });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(rawText);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate captions.' });
  }
}
