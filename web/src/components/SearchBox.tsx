export function SearchBox({ value, onChange, placeholder = '강아지 이름 검색' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="search">
      <span aria-hidden="true" style={{ color: 'var(--text-2)' }}>⌕</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} enterKeyHint="search" />
      {value ? (
        <button type="button" aria-label="검색어 지우기" onClick={() => onChange('')}>✕</button>
      ) : null}
    </div>
  );
}

/** 이름 검색. 대소문자·앞뒤 공백 무시. 한글은 포함 검색. */
export function matchesName(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return name.toLowerCase().includes(q);
}
