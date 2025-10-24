import { getOpenAI } from '../ai/openai.js';

export async function suggestRelationship(req, res) {
  try {
    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Missing prompt' });

    const openai = getOpenAI();
    if (!openai) return res.status(501).json({ error: 'AI not configured' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful genealogy assistant. Answer in concise JSON with suggestions array.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = completion.choices?.[0]?.message?.content || '{"suggestions": []}';
    const json = JSON.parse(content);
    return res.json(json);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
