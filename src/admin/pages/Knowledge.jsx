import React, {useState} from 'react';
import {api, fmtDate} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, Notice} from '../ui.jsx';
import {can} from '../nav.js';

const empty = {title: '', body: '', tags: '', is_active: true, sort: 100};

export default function Knowledge({user}) {
  const data = useAsync(() => api('/kb'), []);
  const [edit, setEdit] = useState(null);
  const [message, setMessage] = useState({kind: 'info', text: ''});
  const [busy, setBusy] = useState(false);
  const editable = can(user, 'kb.edit');

  const save = async () => {
    setBusy(true);
    try {
      const body = {...edit, tags: String(edit.tags).split(',').map(t => t.trim()).filter(Boolean)};
      await api(edit.id ? `/kb/${edit.id}` : '/kb', {method: edit.id ? 'PUT' : 'POST', body});
      setMessage({kind: 'success', text: 'Статья сохранена. ИИ-консультант использует её со следующего сообщения.'});
      setEdit(null);
      await data.reload();
    } catch (err) {
      setMessage({kind: 'error', text: err.message});
    } finally {
      setBusy(false);
    }
  };
  const remove = async item => {
    if (!confirm(`Удалить статью «${item.title}»?`)) return;
    await api(`/kb/${item.id}`, {method: 'DELETE'});
    await data.reload();
  };

  return (
    <Page title="База знаний ИИ-консультанта" actions={editable ? <Button onClick={() => setEdit({...empty})}>Новая статья</Button> : null}>
      <Notice kind={message.kind}>{message.text}</Notice>
      <p className="muted">ИИ-консультант отвечает только по этим статьям. Статьи с тегом core попадают в каждый ответ, остальные подбираются по словам из вопроса клиента.</p>
      {edit ? (
        <Panel title={edit.id ? 'Редактирование статьи' : 'Новая статья'}>
          <div className="form-grid form-grid--wide">
            <Field label="Заголовок"><input value={edit.title} onChange={e => setEdit(s => ({...s, title: e.target.value}))} /></Field>
            <Field label="Теги через запятую" hint="Слова, по которым статья подбирается к вопросу. core: всегда в ответе"><input value={edit.tags} onChange={e => setEdit(s => ({...s, tags: e.target.value}))} /></Field>
            <Field label="Порядок"><input type="number" value={edit.sort} onChange={e => setEdit(s => ({...s, sort: e.target.value}))} /></Field>
            <Field label="Текст статьи" hint="Факты простым языком: цены, сроки, условия. Не пишите то, чего компания не обещает"><textarea rows="14" value={edit.body} onChange={e => setEdit(s => ({...s, body: e.target.value}))} /></Field>
            <label className="inline-check"><input type="checkbox" checked={edit.is_active} onChange={e => setEdit(s => ({...s, is_active: e.target.checked}))} /> Статья включена</label>
          </div>
          <div className="row-actions"><Button busy={busy} onClick={save}>Сохранить</Button><Button kind="quiet" onClick={() => setEdit(null)}>Отмена</Button></div>
        </Panel>
      ) : null}
      {data.loading && !data.data ? <Loading /> : null}
      <ErrorBox error={data.error} onRetry={data.reload} />
      {data.data ? (
        <Panel>
          <ul className="kb-list">
            {data.data.items.map(item => (
              <li key={item.id} className={item.is_active ? '' : 'is-off'}>
                <div><b>{item.title}</b> <small>{item.tags.join(', ')}</small></div>
                <p>{item.body.slice(0, 220)}{item.body.length > 220 ? '...' : ''}</p>
                <small className="muted">Обновлено {fmtDate(item.updated_at)}{item.updated_by_name ? `, ${item.updated_by_name}` : ''}{item.is_active ? '' : ', выключена'}</small>
                {editable ? <div className="row-actions"><Button kind="quiet" onClick={() => setEdit({...item, tags: item.tags.join(', ')})}>Изменить</Button><Button kind="quiet" onClick={() => remove(item)}>Удалить</Button></div> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {can(user, 'ai.manage') ? <AiTest /> : null}
    </Page>
  );
}

function AiTest() {
  const [question, setQuestion] = useState('Сколько стоит построить дом 150 м² из газобетона?');
  const [model, setModel] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setResult(null);
    const [provider, ...rest] = model.split(':');
    try {
      setResult(await api('/ai-test', {method: 'POST', body: {question, provider: model ? provider : undefined, model: model ? rest.join(':') : undefined}}));
    } catch (err) {
      setResult({ok: false, error: err.message});
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Проверить ответ ИИ">
      <div className="form-grid form-grid--wide">
        <Field label="Вопрос клиента"><textarea rows="3" value={question} onChange={e => setQuestion(e.target.value)} /></Field>
        <Field label="Модель" hint="Пусто: цепочка из настроек. Или провайдер:модель, например groq:llama-3.3-70b-versatile"><input value={model} onChange={e => setModel(e.target.value)} /></Field>
      </div>
      <Button busy={busy} onClick={run}>Спросить</Button>
      {result ? (
        result.ok ? (
          <div className="ai-result">
            <p className="muted">{result.provider} / {result.model}, {result.latency} мс, токенов {(result.usage?.prompt_tokens || 0) + (result.usage?.completion_tokens || 0)}. Статьи: {result.knowledge.join(', ')}</p>
            <blockquote className="quote">{result.parsed?.reply || result.raw}</blockquote>
            <details><summary>Разбор ответа</summary><pre>{JSON.stringify(result.parsed, null, 2)}</pre></details>
          </div>
        ) : <Notice kind="error">{result.error}</Notice>
      ) : null}
    </Panel>
  );
}
