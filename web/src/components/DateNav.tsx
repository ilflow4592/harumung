import { useSearchParams } from 'react-router-dom';

import { dateLabelKo, isValidDate, localDate, relativeLabel, shiftDate } from '../lib/dates';

/** URL ?d=YYYY-MM-DD 로 날짜를 든다. 없으면 오늘. 화면 사이 이동에도 날짜가 유지된다. */
export function useDateParam(): [string, (d: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('d');
  const date = isValidDate(raw) ? raw : localDate();
  const set = (d: string) => {
    const next = new URLSearchParams(params);
    if (d === localDate()) next.delete('d'); else next.set('d', d);
    setParams(next, { replace: true });
  };
  return [date, set];
}

/** ‹ 11월 6일 금요일 › 와 "오늘" 복귀. 미래로는 못 간다. */
export function DateNav({ date, onChange, compact = false }: { date: string; onChange: (d: string) => void; compact?: boolean }) {
  const today = localDate();
  const rel = relativeLabel(date);
  return (
    <div className="datenav">
      <button type="button" className="datenav__arrow" aria-label="이전 날" onClick={() => onChange(shiftDate(date, -1))}>‹</button>
      <span className="datenav__label">
        {rel ? <b>{rel}</b> : null}
        <span className={rel ? 'sub' : ''} style={{ fontWeight: rel ? 500 : 700 }}>{dateLabelKo(date, !compact)}</span>
      </span>
      <button type="button" className="datenav__arrow" aria-label="다음 날" disabled={date >= today} onClick={() => onChange(shiftDate(date, 1))}>›</button>
      {date !== today ? <button type="button" className="btn btn--small btn--outline" onClick={() => onChange(today)}>오늘</button> : null}
    </div>
  );
}
