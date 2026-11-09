import {SERVICES} from './permissions.js';

export function cleanText(value, max = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

export function cleanLine(value, max = 120) {
  return cleanText(value, max).replace(/\s+/g, ' ');
}

// Приводит российский номер к виду +7XXXXXXXXXX. Иностранные номера оставляет с плюсом.
export function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function formatPhone(phone) {
  if (!phone) return '';
  const match = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return match ? `+7 (${match[1]}) ${match[2]}-${match[3]}-${match[4]}` : phone;
}

export function normalizeEmail(value) {
  const email = cleanLine(value, 160).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

export function normalizeTelegram(value) {
  const name = cleanLine(value, 64).replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
  if (!name) return '';
  return /^[a-zA-Z0-9_]{4,32}$/.test(name) ? name : null;
}

export function normalizeService(value) {
  const key = cleanLine(value, 40);
  return key in SERVICES ? key : 'other';
}

const CONTACT_PREFS = new Set(['call', 'telegram', 'whatsapp', 'max', 'email']);
export function normalizeContactPref(value) {
  const key = cleanLine(value, 20);
  return CONTACT_PREFS.has(key) ? key : null;
}

export function deviceFromUa(ua = '') {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

const DETAIL_KEYS = {
  object: 80, area: 20, floors: 20, material: 60, has_project: 80, has_plot: 60, location: 120,
  budget: 80, timing: 80, stage: 80, design_project: 60, scope: 120, estimate: 80, rooms: 60
};

export function cleanDetails(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, max] of Object.entries(DETAIL_KEYS)) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') out[key] = cleanLine(input[key], max);
  }
  return out;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
export function cleanAttribution(input = {}) {
  const out = {};
  for (const key of UTM_KEYS) out[key] = cleanLine(input[key], 150) || null;
  out.referrer = cleanLine(input.referrer, 300) || null;
  out.yclid = cleanLine(input.yclid, 100) || null;
  out.gclid = cleanLine(input.gclid, 200) || null;
  out.ym_client_id = /^\d{5,30}$/.test(String(input.ym_client_id || '')) ? String(input.ym_client_id) : null;
  out.landing_page = cleanLine(input.landing_page, 300) || null;
  return out;
}

// Простые признаки спама в тексте заявки.
export function spamScore({name = '', message = ''}) {
  let score = 0;
  const text = `${name} ${message}`;
  const links = (text.match(/https?:\/\/|www\./gi) || []).length;
  if (links >= 1) score += 2;
  if (links >= 3) score += 3;
  if (/(casino|crypto|viagra|loan|seo\s*продвижение|раскрутк|ставки|букмекер|заработок\s+в\s+интернете)/i.test(text)) score += 4;
  if (/[一-鿿]/.test(text)) score += 2;
  if (/(.)\1{9,}/.test(text)) score += 2;
  return score;
}
