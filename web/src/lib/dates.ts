/** 날짜 문자열(YYYY-MM-DD, 기기 로컬) 유틸. 저장 키는 모두 이 형식. */

export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDate(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export function isValidDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());
}

/** "11월 6일 금요일" */
export function dateLabelKo(s: string, withWeekday = true): string {
  const d = parseDate(s);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일${withWeekday ? ` ${days[d.getDay()]}요일` : ''}`;
}

export function relativeLabel(s: string): string | null {
  const today = localDate();
  if (s === today) return '오늘';
  if (s === shiftDate(today, -1)) return '어제';
  return null;
}
