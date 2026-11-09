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
  {key: 'manager', name: 'Менеджер', permissions: ['leads.view_all', 'leads.edit', 'conversations.view', 'conversations.reply', 'stats.view']},
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
