import React, {useCallback, useEffect, useRef, useState} from 'react';

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({loading: true, data: null, error: null});
  const counter = useRef(0);
  const load = useCallback(async () => {
    const id = ++counter.current;
    setState(prev => ({...prev, loading: true, error: null}));
    try {
      const data = await fn();
      if (id === counter.current) setState({loading: false, data, error: null});
    } catch (error) {
      if (id === counter.current) setState({loading: false, data: null, error});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return {...state, reload: load};
}

export function Page({title, actions, children}) {
  return (
    <section className="page">
      <header className="page-head">
        <h1>{title}</h1>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Panel({title, children, actions, className = ''}) {
  return (
    <section className={`panel ${className}`}>
      {title || actions ? <header className="panel-head">{title ? <h2>{title}</h2> : <span />}{actions}</header> : null}
      {children}
    </section>
  );
}

export function Button({children, kind = 'primary', busy = false, ...props}) {
  return <button type="button" className={`a-btn a-btn--${kind}`} aria-busy={busy || undefined} disabled={busy || props.disabled} {...props}>{children}</button>;
}

export function Field({label, hint, children, error}) {
  return (
    <label className="a-field">
      <span className="a-label">{label}</span>
      {children}
      {hint ? <span className="a-hint">{hint}</span> : null}
      {error ? <span className="a-error">{error}</span> : null}
    </label>
  );
}

export function Notice({kind = 'info', children}) {
  if (!children) return null;
  return <p className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}

export function Loading() {
  return <p className="muted" role="status">Загружаем...</p>;
}

export function ErrorBox({error, onRetry}) {
  if (!error) return null;
  return (
    <div className="notice notice--error" role="alert">
      {error.message || String(error)}
      {onRetry ? <> <button type="button" className="a-link" onClick={onRetry}>Повторить</button></> : null}
    </div>
  );
}

const STATUS_TONE = {new: 'new', in_progress: 'work', qualified: 'work', meeting: 'work', estimate: 'work', contract: 'good', rejected: 'bad', spam: 'muted'};
export function StatusBadge({status, label}) {
  return <span className={`badge badge--${STATUS_TONE[status] || 'muted'}`}>{label || status}</span>;
}

export function Pagination({page, per, total, onPage}) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Страницы">
      <Button kind="quiet" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</Button>
      <span>Страница {page} из {pages}</span>
      <Button kind="quiet" disabled={page >= pages} onClick={() => onPage(page + 1)}>Дальше</Button>
    </nav>
  );
}

// Столбики по дням: одна серия, один цвет, подсказка при наведении и фокусе.
export function DayBars({rows, label = 'Заявок'}) {
  const [hover, setHover] = useState(null);
  if (!rows?.length) return <p className="muted">За период данных нет.</p>;
  const max = Math.max(...rows.map(r => r.count), 1);
  const width = 720;
  const height = 180;
  const gap = 2;
  const barW = Math.max(4, (width - gap * (rows.length - 1)) / rows.length);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label={`${label} по дням`}>
        <line x1="0" x2={width} y1={height} y2={height} className="chart-axis" />
        {rows.map((row, i) => {
          const h = Math.max(2, (row.count / max) * (height - 16));
          const x = i * (barW + gap);
          return (
            <g key={row.day} tabIndex={0} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <rect x={x} y={0} width={barW} height={height} className="chart-hit" />
              <path className="chart-bar" d={`M${x},${height} v${-(h - 4)} q0,-4 4,-4 h${Math.max(0, barW - 8)} q4,0 4,4 v${h - 4} z`} />
              <title>{`${row.day}: ${row.count}`}</title>
            </g>
          );
        })}
        <text x="0" y={height + 18} className="chart-tick">{rows[0].day.slice(5)}</text>
        <text x={width} y={height + 18} textAnchor="end" className="chart-tick">{rows[rows.length - 1].day.slice(5)}</text>
      </svg>
      {hover !== null ? <figcaption className="chart-tip">{rows[hover].day}: {label.toLowerCase()} {rows[hover].count}</figcaption> : <figcaption className="chart-tip muted">Наведите на столбик, чтобы увидеть число</figcaption>}
    </figure>
  );
}

// Горизонтальные полосы с подписью и значением: источники, услуги, воронка.
export function HBars({rows, labelKey = 'label', valueKey = 'count', extra}) {
  if (!rows?.length) return <p className="muted">Нет данных.</p>;
  const max = Math.max(...rows.map(r => r[valueKey]), 1);
  return (
    <ul className="hbars">
      {rows.map(row => (
        <li key={row[labelKey]}>
          <span className="hbars-label">{row[labelKey]}</span>
          <span className="hbars-track" aria-hidden="true"><span className="hbars-bar" style={{width: `${Math.max(2, (row[valueKey] / max) * 100)}%`}} /></span>
          <span className="hbars-value">{row[valueKey]}{extra ? <small> {extra(row)}</small> : null}</span>
        </li>
      ))}
    </ul>
  );
}
