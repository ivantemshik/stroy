// Вызов языковых моделей через OpenAI-совместимый API с цепочкой запасных провайдеров.
// Порядок и модели настраиваются в админке (настройка ai.providers), ключи лежат в переменных окружения.
import {db} from '../db.js';
import {config} from '../env.js';
import {getSetting} from '../settings.js';

export const PROVIDERS = {
  groq: {label: 'Groq', base: 'https://api.groq.com/openai/v1', key: () => config.ai.groqKey, json: true},
  openrouter: {label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', key: () => config.ai.openrouterKey, json: true,
    headers: () => ({'HTTP-Referer': config.siteUrl, 'X-Title': 'Dom Mira consultant'})},
  cerebras: {label: 'Cerebras', base: 'https://api.cerebras.ai/v1', key: () => config.ai.cerebrasKey, json: true},
  gemini: {label: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: () => config.ai.geminiKey, json: true},
  mistral: {label: 'Mistral', base: 'https://api.mistral.ai/v1', key: () => config.ai.mistralKey, json: true},
  yandex: {label: 'Yandex AI Studio (Алиса AI)', base: 'https://llm.api.cloud.yandex.net/v1', key: () => config.ai.yandexKey, json: false,
    model: name => name.startsWith('gpt://') ? name : `gpt://${config.ai.yandexFolder}/${name}`,
    available: () => Boolean(config.ai.yandexKey && config.ai.yandexFolder),
    headers: () => ({'OpenAI-Project': config.ai.yandexFolder})}
};

const cooldown = new Map();

export function isAvailable(provider) {
  const p = PROVIDERS[provider];
  if (!p) return false;
  return p.available ? p.available() : Boolean(p.key());
}

async function logUsage(entry) {
  try {
    await db()`insert into ai_usage (provider, model, purpose, ok, latency_ms, prompt_tokens, completion_tokens, error)
      values (${entry.provider}, ${entry.model}, ${entry.purpose || null}, ${entry.ok}, ${entry.latency || null},
        ${entry.promptTokens || null}, ${entry.completionTokens || null}, ${entry.error ? String(entry.error).slice(0, 500) : null})`;
  } catch (error) {
    console.error('ai usage log failed', error.message);
  }
}

async function callOne({provider, model}, {messages, json, temperature, maxTokens, timeoutMs}) {
  const p = PROVIDERS[provider];
  const body = {
    model: p.model ? p.model(model) : model,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (json && p.json) body.response_format = {type: 'json_object'};
  const response = await fetch(`${p.base}/chat/completions`, {
    method: 'POST',
    headers: {'content-type': 'application/json', authorization: `Bearer ${p.key()}`, ...(p.headers ? p.headers() : {})},
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(`${p.label} ${model}: HTTP ${response.status} ${raw.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') throw new Error(`${p.label} ${model}: пустой ответ`);
  return {content, usage: data.usage || {}};
}

// Перебирает провайдеров по порядку. Временные ошибки (429, 5xx) ставят провайдера на паузу.
// На всю цепочку один общий лимит ожидания (по умолчанию 35 секунд): функция на хостинге живёт 60 секунд,
// и после отказа всех моделей должно остаться время передать вопрос менеджеру.
export async function chat({messages, json = false, temperature, maxTokens = 900, purpose = 'chat', timeoutMs = 25000, totalMs = 35000, only} = {}) {
  const configured = only ? [only] : (await getSetting('ai.providers')) || [];
  const temp = temperature ?? Number(await getSetting('ai.temperature')) ?? 0.4;
  const errors = [];
  const deadline = Date.now() + totalMs;
  for (const entry of configured) {
    if (!entry || entry.enabled === false || !isAvailable(entry.provider)) continue;
    const id = `${entry.provider}:${entry.model}`;
    if (!only && (cooldown.get(id) || 0) > Date.now()) continue;
    const left = deadline - Date.now();
    if (left < 3000) {
      errors.push('общий лимит ожидания исчерпан');
      break;
    }
    const started = Date.now();
    try {
      const result = await callOne(entry, {messages, json, temperature: temp, maxTokens, timeoutMs: Math.min(timeoutMs, left)});
      await logUsage({provider: entry.provider, model: entry.model, purpose, ok: true, latency: Date.now() - started,
        promptTokens: result.usage.prompt_tokens, completionTokens: result.usage.completion_tokens});
      return {...result, provider: entry.provider, model: entry.model, latency: Date.now() - started};
    } catch (error) {
      errors.push(error.message);
      await logUsage({provider: entry.provider, model: entry.model, purpose, ok: false, latency: Date.now() - started, error: error.message});
      if (error.status === 429) cooldown.set(id, Date.now() + 10 * 60 * 1000);
      else if (!error.status || error.status >= 500) cooldown.set(id, Date.now() + 2 * 60 * 1000);
    }
  }
  const error = new Error(errors.length ? `Все модели недоступны: ${errors.join(' | ')}` : 'Не настроен ни один ИИ-провайдер');
  error.details = errors;
  throw error;
}

// Модели иногда оборачивают JSON в текст или блок кода: достаём первый объект.
export function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* ищем объект внутри */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}
