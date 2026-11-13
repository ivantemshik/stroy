import React, {useEffect, useState} from 'react';
import {api} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, Notice} from '../ui.jsx';

// Прайс: одни и те же группы выводятся на главной и «Отделке», в таблице «Проектирования»,
// в разметке для поиска и в ответах ИИ-консультанта. Цена пишется как «от 70 000 ₽/м²».
const PRICE_FIELDS = [['name', 'Работа'], ['price', 'Цена, например «от 70 000 ₽/м²»']];
const LIST_SHAPES = {
  'build.prices': {title: 'Прайс: строительство и конструктив (главная)', fields: PRICE_FIELDS},
  'finish.prices': {title: 'Прайс: отделочные работы («Отделка»)', fields: PRICE_FIELDS},
  'engineering.prices': {title: 'Прайс: инженерные системы (главная и «Отделка»)', fields: PRICE_FIELDS},
  'landscape.prices': {title: 'Прайс: участок и благоустройство (главная)', fields: PRICE_FIELDS},
  'design.prices': {title: 'Прайс: проектирование (главная и «Проектирование»)', fields: [['code', 'Код раздела'], ...PRICE_FIELDS]},
  'about.paras': {title: 'О компании: абзацы текста (главная)', fields: [['text', 'Абзац', true]]},
  'about.facts': {title: 'О компании: цифры (главная)', fields: [['value', 'Число'], ['label', 'Подпись']]},
  'home.promo': {title: 'Акции на главной', fields: [['title', 'Заголовок'], ['text', 'Текст']]},
  'otdelka.promo': {title: 'Акции на странице отделки', fields: [['title', 'Заголовок'], ['text', 'Текст']]},
  'home.faq': {title: 'Вопросы на главной', fields: [['q', 'Вопрос'], ['a', 'Ответ', true]]},
  'otdelka.faq': {title: 'Вопросы на странице отделки', fields: [['q', 'Вопрос'], ['a', 'Ответ', true]]},
  'proekt.promo': {title: 'Акции на странице проектирования', fields: [['title', 'Заголовок'], ['text', 'Текст']]},
  'proekt.faq': {title: 'Вопросы на странице проектирования', fields: [['q', 'Вопрос'], ['a', 'Ответ', true]]}
};

export default function Content() {
  const data = useAsync(() => api('/content'), []);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState({kind: 'info', text: ''});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data.data) setDraft(structuredClone(data.data.content)); }, [data.data]);
  if (data.loading && !draft) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!draft) return null;

  const save = async keys => {
    setBusy(true);
    try {
      await api('/content', {method: 'PUT', body: {content: Object.fromEntries(keys.map(k => [k, draft[k]]))}});
      setMessage({kind: 'success', text: 'Сохранено. Посетители увидят изменения в течение минуты, поисковики после следующей публикации сайта.'});
      await data.reload();
    } catch (err) {
      setMessage({kind: 'error', text: err.message});
    } finally {
      setBusy(false);
    }
  };
  const reset = async key => {
    if (!confirm('Вернуть значения по умолчанию для этого блока?')) return;
    await api('/content', {method: 'PUT', body: {content: {}, reset: [key]}});
    await data.reload();
  };
  const setContact = (field, value) => setDraft(d => ({...d, contacts: {...d.contacts, [field]: value}}));
  const setItem = (key, index, field, value) => setDraft(d => ({...d, [key]: d[key].map((item, i) => i === index ? {...item, [field]: value} : item)}));
  const move = (key, index, delta) => setDraft(d => {
    const list = [...d[key]];
    const target = index + delta;
    if (target < 0 || target >= list.length) return d;
    [list[index], list[target]] = [list[target], list[index]];
    return {...d, [key]: list};
  });

  return (
    <Page title="Контент сайта">
      <Notice kind={message.kind}>{message.text}</Notice>
      <Panel title="Контакты" actions={<Button busy={busy} onClick={() => save(['contacts', 'notice'])}>Сохранить</Button>}>
        <div className="form-grid">
          <Field label="Телефон" hint="Пустое поле: телефон на сайте не показывается"><input value={draft.contacts.phone} onChange={e => setContact('phone', e.target.value)} placeholder="+7 (495) 000-00-00" /></Field>
          <Field label="Почта"><input value={draft.contacts.email} onChange={e => setContact('email', e.target.value)} /></Field>
          <Field label="Адрес"><input value={draft.contacts.address} onChange={e => setContact('address', e.target.value)} /></Field>
          <Field label="Часы работы"><input value={draft.contacts.hours} onChange={e => setContact('hours', e.target.value)} /></Field>
          <Field label="Встречи"><input value={draft.contacts.meeting} onChange={e => setContact('meeting', e.target.value)} /></Field>
          <Field label="Объявление под первым экраном" hint="Например, о праздничном графике. Пустое поле скрывает объявление"><input value={draft.notice} onChange={e => setDraft(d => ({...d, notice: e.target.value}))} /></Field>
        </div>
      </Panel>
      {Object.entries(LIST_SHAPES).map(([key, shape]) => (
        <Panel key={key} title={shape.title} actions={<div className="row-actions"><Button kind="quiet" onClick={() => reset(key)}>По умолчанию</Button><Button busy={busy} onClick={() => save([key])}>Сохранить</Button></div>}>
          <ol className="edit-list">
            {draft[key].map((item, index) => (
              <li key={index}>
                {shape.fields.map(([field, label, long]) => (
                  <Field key={field} label={label}>{long ? <textarea rows="3" value={item[field] || ''} onChange={e => setItem(key, index, field, e.target.value)} /> : <input value={item[field] || ''} onChange={e => setItem(key, index, field, e.target.value)} />}</Field>
                ))}
                <div className="row-actions">
                  <Button kind="quiet" onClick={() => move(key, index, -1)} disabled={index === 0}>Выше</Button>
                  <Button kind="quiet" onClick={() => move(key, index, 1)} disabled={index === draft[key].length - 1}>Ниже</Button>
                  <Button kind="quiet" onClick={() => setDraft(d => ({...d, [key]: d[key].filter((_, i) => i !== index)}))}>Удалить</Button>
                </div>
              </li>
            ))}
          </ol>
          <Button kind="quiet" onClick={() => setDraft(d => ({...d, [key]: [...d[key], Object.fromEntries(shape.fields.map(([f]) => [f, '']))]}))}>Добавить строку</Button>
        </Panel>
      ))}
    </Page>
  );
}
