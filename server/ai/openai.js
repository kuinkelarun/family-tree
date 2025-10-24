import OpenAI from 'openai';

let cached = null;
export function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (cached) return cached;
  cached = new OpenAI({ apiKey: key });
  return cached;
}
