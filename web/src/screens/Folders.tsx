import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DogSheet } from '../components/DogSheet';
import { matchesName, SearchBox } from '../components/SearchBox';
import { Chip, DogAvatar, InstallHint, SexBadge } from '../components/ui';
import type { Dog } from '../db/db';
import { listAttendedDogIds, listTodayFolders, localDate } from '../db/repo';

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

export function FoldersScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Dog | null>(null);
  const { data } = useQuery({
    queryKey: ['folders', new Date().toISOString().slice(0, 10)],
    queryFn: () => listTodayFolders(new Date().toISOString()),
  });
  const date = localDate();
  const { data: attended = [] } = useQuery({ queryKey: ['attendance', date], queryFn: () => listAttendedDogIds(date) });
  const attendedSet = useMemo(() => new Set(attended), [attended]);
  const [showAbsent, setShowAbsent] = useState(false);
  const perDog = data?.perDog ?? [];
  const unassigned = data?.unassigned ?? 0;
  const total = perDog.reduce((n, f) => n + f.count, 0) + unassigned;
  const filtered = useMemo(() => perDog.filter((f) => matchesName(f.dog.name, query)), [perDog, query]);
  // 등원 체크가 있으면: 등원했거나 사진이 있는 아이만 본 목록, 나머지는 접힌 "오늘 안 온 아이".
  const hasAttendance = attended.length > 0;
  const present = hasAttendance ? filtered.filter((f) => attendedSet.has(f.dog.id) || f.count > 0) : filtered;
  const absent = hasAttendance ? filtered.filter((f) => !attendedSet.has(f.dog.id) && f.count === 0) : [];
  const pickedCount = picked ? perDog.find((f) => f.dog.id === picked.id)?.count : undefined;

  return (
    <div className="screen screen--surface">
      <header className="topbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14, padding: 'calc(var(--safe-top) + 12px) 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="sub" style={{ fontWeight: 500 }}>{todayLabel()}</div>
            <h1 style={{ fontSize: 22 }}>오늘 폴더</h1>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link to="/settings" className="icon-btn" aria-label="설정" style={{ fontSize: 22 }}>⚙</Link>
            <Link to="/dogs/new" className="icon-btn icon-btn--mint" aria-label="강아지 등록">+</Link>
          </div>
        </div>
        <div className="stats">
          <div className="stat" style={{ background: 'var(--surface)' }}><span className="sub">촬영</span><b>{total}</b></div>
          <div className="stat" style={{ background: 'var(--pink-light)', color: 'var(--pink)' }}><span style={{ fontSize: 12 }}>미지정</span><b>{unassigned}</b></div>
          <Link to="/send" className="stat" style={{ background: 'var(--blue-light)', color: 'var(--blue-dark)' }}><span style={{ fontSize: 12 }}>발송 준비 →</span><b>{perDog.filter((f) => f.reviewed && !f.sent).length}</b></Link>
        </div>
        <SearchBox value={query} onChange={setQuery} />
      </header>

      <main className="body" style={{ paddingBottom: 100 }}>
        <InstallHint />
        <Link to="/attendance" className="card card--row" style={{ borderColor: 'var(--mint-mid)', color: 'inherit' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="title">오늘 등원 {hasAttendance ? `${attended.length}마리` : '체크'}</span>
            <span className="sub">{hasAttendance ? '카메라와 폴더에 오늘 온 아이만 보여요' : '체크하면 카메라에 오늘 온 아이만 떠요'}</span>
          </span>
          <Chip label={hasAttendance ? '수정' : '체크하기'} tone="mint" />
        </Link>
        {unassigned > 0 && !query ? (
          <Link to="/folders/unassigned" className="card card--row" style={{ borderColor: 'var(--pink-mid)', borderWidth: 1.5, color: 'inherit' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="title">미지정 사진 {unassigned}장</span>
              <span className="sub">강아지를 정하거나 지워 주세요</span>
            </span>
            <Chip label="배정하기" tone="pink" />
          </Link>
        ) : null}
        {perDog.length === 0 ? (
          <div className="card">
            <div className="title">등록된 강아지가 없어요</div>
            <div className="sub">오른쪽 위 + 로 첫 강아지를 등록하세요</div>
          </div>
        ) : null}
        {perDog.length > 0 && filtered.length === 0 ? (
          <div className="card">
            <div className="title">"{query.trim()}" 강아지가 없어요</div>
            <div className="sub">이름을 다시 확인해 주세요</div>
          </div>
        ) : null}
        {absent.length > 0 ? (
          <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAbsent((v) => !v)}>
            {showAbsent ? '안 온 아이 접기' : `오늘 안 온 아이 ${absent.length}마리 보기`}
          </button>
        ) : null}
        {(showAbsent ? [...present, ...absent] : present).map((f) => (
          <button key={f.dog.id} type="button" className="card card--row" style={{ textAlign: 'left', width: '100%', opacity: hasAttendance && !attendedSet.has(f.dog.id) && f.count === 0 ? 0.55 : 1 }} onClick={() => setPicked(f.dog)}>
            <DogAvatar name={f.dog.name} sex={f.dog.sex} thumb={f.dog.thumbBlob} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="title">{f.dog.name}</span>
                <SexBadge sex={f.dog.sex} />
                {f.reviewed || f.sent ? <span className="check check--on check--sm" aria-label="검수 완료">✓</span> : null}
              </span>
              <span className="sub">사진 {f.count}장 · A컷 {f.aCut}장</span>
            </span>
            <Chip label={f.sent ? '보냄' : f.reviewed ? '발송 준비' : f.count > 0 ? '검수 전' : '촬영 중'} tone={f.sent ? 'mint' : f.reviewed ? 'blue' : f.count > 0 ? 'pink' : 'gray'} />
          </button>
        ))}
      </main>

      <footer className="footer footer--surface" style={{ borderTop: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" style={{ flex: 1.6 }} onClick={() => navigate('/camera')}>촬영 시작</button>
          {perDog.some((f) => f.reviewed && !f.sent) ? (
            <button type="button" className="btn btn--outline" style={{ flex: 1 }} onClick={() => navigate('/send')}>
              보내기 ({perDog.filter((f) => f.reviewed && !f.sent).length})
            </button>
          ) : null}
        </div>
      </footer>

      <DogSheet dog={picked} count={pickedCount} onClose={() => setPicked(null)} />
    </div>
  );
}
