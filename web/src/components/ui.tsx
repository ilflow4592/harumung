import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { Sex } from '../db/db';

export function SexBadge({ sex }: { sex: Sex }) {
  return <span className={`badge ${sex === 'MALE' ? 'badge--blue' : 'badge--pink'}`}>{sex === 'MALE' ? '남아' : '여아'}</span>;
}

export function Chip({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'mint' | 'blue' | 'pink' }) {
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

/** 강아지 썸네일. 사진이 없으면 이름 첫 글자. */
export function DogAvatar({
  name,
  sex,
  thumb,
  size = 48,
  selected = false,
}: {
  name: string;
  sex: Sex;
  thumb?: Blob | null;
  size?: number;
  selected?: boolean;
}) {
  const url = useObjectUrl(thumb ?? null);
  return (
    <span
      className={`avatar avatar--${sex} ${selected ? 'avatar--selected' : ''}`}
      style={{ width: size, height: size, borderRadius: size / 3, fontSize: size * 0.34, overflow: 'hidden' }}
    >
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : name.slice(0, 1)}
    </span>
  );
}

/** Blob → object URL. 언마운트 시 해제. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="icon-btn" aria-label="뒤로" onClick={onBack}>
          ‹
        </button>
      ) : null}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

/** 홈 화면 추가 안내. 설치된 상태(standalone)면 숨긴다. */
const GUIDE_SEEN_KEY = 'harumung.guideSeen';

/** 처음 설치한 폰에만 한 번 보이는 사용 안내 배너. 닫으면 다시 안 뜬다. */
export function GuideBanner() {
  const [seen, setSeen] = useState<boolean>(() => { try { return localStorage.getItem(GUIDE_SEEN_KEY) === '1'; } catch { return false; } });
  if (seen) return null;
  const dismiss = () => { try { localStorage.setItem(GUIDE_SEEN_KEY, '1'); } catch { /* 저장 못 하면 다음에 또 보임 */ } setSeen(true); };
  return (
    <div className="guide-banner">
      <span style={{ flex: 1 }}>
        <b>처음이세요?</b> 등록부터 보내기까지 한 번에 따라가는 안내가 있어요.
      </span>
      <Link to="/guide" className="btn btn--small" style={{ background: 'var(--mint)', borderColor: 'var(--mint)', color: 'var(--white)' }} onClick={dismiss}>사용 안내</Link>
      <button type="button" className="icon-btn" aria-label="닫기" style={{ width: 32, height: 32, fontSize: 16 }} onClick={dismiss}>✕</button>
    </div>
  );
}

export function InstallHint() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  return (
    <div className="install">
      {ios
        ? '사파리 아래 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 쓸 수 있어요. 설치해야 사진이 안전하게 보관돼요.'
        : '브라우저 메뉴 → "홈 화면에 추가"를 누르면 앱처럼 쓸 수 있어요.'}
    </div>
  );
}
