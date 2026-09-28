// SERV Reasoning client. OpenAI SDK compatible (docs.openserv.ai/serv-reasoning/introduction):
// base URL https://inference-api.openserv.ai/v1, Bearer SERV_API_KEY, a system prompt is required,
// and strict json_schema structured output is supported. There is no fallback model anywhere in BANDIT.
import OpenAI from 'openai';

export const SERV_BASE_URL = 'https://inference-api.openserv.ai/v1';
export const SERV_MODEL = process.env.SERV_MODEL || 'gpt-5.4-mini';

export const servReady = () => Boolean(process.env.SERV_API_KEY);

let client = null;
function serv() {
  if (!process.env.SERV_API_KEY) throw new Error('SERV_API_KEY is not set on the server.');
  client ||= new OpenAI({ baseURL: SERV_BASE_URL, apiKey: process.env.SERV_API_KEY, timeout: 50_000, maxRetries: 0 });
  return client;
}

// Runs one SERV Reasoning call that must return JSON matching `schema`. Throws a readable error otherwise.
export async function servJSON({ system, user, name, schema, effort = 'low' }) {
  let completion;
  try {
    completion = await serv().chat.completions.create({
      model: SERV_MODEL,
      reasoning_effort: effort,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) },
      ],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    });
  } catch (e) {
    const status = e?.status ? ` (HTTP ${e.status})` : '';
    const detail = e?.status === 401 ? 'The SERV API key was rejected.'
      : e?.status === 402 ? 'The SERV account is out of credits.'
      : e?.status === 429 ? 'SERV is rate limiting requests. Try again in a moment.'
      : e?.message || 'Unknown error.';
    throw new Error(`SERV Reasoning request failed${status}. ${detail}`);
  }
  const choice = completion.choices?.[0];
  const content = choice?.message?.content || '';
  if (!content) throw new Error(`SERV Reasoning returned an empty answer (finish reason: ${choice?.finish_reason || 'unknown'}).`);
  let data = null;
  try { data = JSON.parse(content); } catch {}
  return { data, raw: data ? null : content, model: completion.model || SERV_MODEL, usage: completion.usage || null };
}

export const undash = s => String(s ?? '').replace(/\s*—\s*/g, ', ').replace(/–/g, '-');
