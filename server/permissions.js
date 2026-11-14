export const PERMISSIONS = {
  'leads.view_all': 'Видеть все заявки',
  'leads.view_own': 'Видеть только свои заявки',
  'leads.edit': 'Менять заявки, статусы и заметки',
  'leads.assign': 'Назначать ответственных',
  'leads.delete': 'Удалять заявки',
  'leads.export': 'Выгружать заявки и статистику',
  'conversations.view': 'Читать диалоги ИИ-консультанта',
  'conversations.reply': 'Отвечать клиентам в Telegram',
  'stats.view': 'Смотреть статистику и отчёты',
  'content.edit': 'Редактировать контент сайта',
  'kb.edit': 'Редактировать базу знаний ИИ',
  'ai.manage': 'Настраивать ИИ-консультанта',
  'users.manage': 'Управлять пользователями и ролями',
  'settings.manage': 'Менять настройки и интеграции',
  'audit.view': 'Смотреть журнал действий',
  'backup.download': 'Скачивать резервные копии'
};

const all = Object.keys(PERMISSIONS);

export const DEFAULT_ROLES = [
  {key: 'owner', name: 'Владелец', permissions: all},
  {key: 'admin', name: 'Администратор', permissions: all.filter(p => p !== 'backup.download')},
  // Обычный менеджер видит свои заявки и свободные (чтобы взять), чужие не видит. Все заявки видят роли с правом leads.view_all.
  {key: 'manager', name: 'Менеджер', permissions: ['leads.view_own', 'leads.edit', 'conversations.view', 'conversations.reply', 'stats.view']},
  {key: 'analyst', name: 'Наблюдатель', permissions: ['leads.view_all', 'stats.view', 'leads.export', 'conversations.view']}
];

export const LEAD_STATUSES = [
  {key: 'new', label: 'Новая', stage: 0},
  {key: 'in_progress', label: 'В работе', stage: 1},
  {key: 'qualified', label: 'Целевая', stage: 2},
  {key: 'meeting', label: 'Встреча или выезд', stage: 3},
  {key: 'estimate', label: 'Смета отправлена', stage: 4},
  {key: 'contract', label: 'Договор', stage: 5},
  {key: 'rejected', label: 'Отказ', stage: -1},
  {key: 'spam', label: 'Спам или нецелевая', stage: -1}
];

export const STATUS_KEYS = LEAD_STATUSES.map(s => s.key);
export const statusLabel = key => LEAD_STATUSES.find(s => s.key === key)?.label || key;
export const statusStage = key => LEAD_STATUSES.find(s => s.key === key)?.stage ?? 0;

export const SERVICES = {
  construction: 'Строительство дома',
  finishing: 'Отделочные работы',
  design: 'Проектирование',
  engineering: 'Инженерные системы',
  landscape: 'Благоустройство и ландшафт',
  lighting: 'Архитектурное освещение',
  furniture: 'Корпусная мебель',
  commercial: 'Коммерческий объект',
  other: 'Другое'
};
export const serviceLabel = key => SERVICES[key] || key || 'Не указана';

export const CHANNELS = {
  site: 'Сайт',
  telegram_bot: 'ИИ-консультант в Telegram',
  manual: 'Добавлена вручную'
};

export const DEFAULT_REJECT_REASONS = [
  'Дорого',
  'Не устроили сроки',
  'Выбрали другого подрядчика',
  'Отложили стройку или ремонт',
  'Нет участка или проекта, рано',
  'Нецелевой запрос',
  'Не удалось связаться',
  'Другое'
];

export function can(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

// Одно правило доступа для веб-админки и админ-бота.
// Заявку видит тот, кто видит все заявки, её ответственный, а свободную (без ответственного) любой менеджер,
// чтобы взять её в работу. Чужие заявки менеджер без права «Видеть все заявки» не видит.
export function canAccessLead(user, lead) {
  if (!user || !lead) return false;
  if (can(user, 'leads.view_all')) return true;
  const free = lead.manager_id === null || lead.manager_id === undefined;
  return free ? can(user, 'leads.view_own') : lead.manager_id === user.id;
}

// Свободную заявку (без ответственного) может взять себе любой, кто может менять заявки.
export function canTakeLead(user, lead) {
  return Boolean(lead) && can(user, 'leads.edit') && (!lead.manager_id || lead.manager_id === user.id);
}

// Менять статус и поля: право менять заявки и доступ к этой заявке (или она свободна и её можно взять).
export function canEditLead(user, lead) {
  return can(user, 'leads.edit') && (canAccessLead(user, lead) || canTakeLead(user, lead));
}

// Переписку с клиентом видит тот, кто видит её заявку; диалог без заявки видят только те, кто видит все заявки.
// Отвечать может тот же круг людей, если у него есть право отвечать клиентам.
export function canSeeConversation(user, lead) {
  return can(user, 'conversations.view') && (can(user, 'leads.view_all') || canAccessLead(user, lead));
}

export function canReplyConversation(user, lead) {
  return can(user, 'conversations.reply') && (can(user, 'leads.view_all') || canAccessLead(user, lead));
}
