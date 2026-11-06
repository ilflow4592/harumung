import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DogSheet } from '../components/DogSheet';
import { matchesName, SearchBox } from '../components/SearchBox';
import { Chip, DogAvatar, InstallHint, SexBadge } from '../components/ui';
import type { Dog } from '../db/db';
import { DateNav, useDateParam } from '../components/DateNav';
import { listAttendedDogIds, listFolders } from '../db/repo';
import { getPartner, track } from '../lib/analytics';
import { localDate, relativeLabel } from '../lib/dates';

export function FoldersScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Dog | null>(null);
  const [date, setDateRaw] = useDateParam();
  const isToday = date === localDate();
  const setDate = (d: string) => {
    const off = Math.round((new Date(d).getTime() - new Date(localDate()).getTime()) / 86_400_000);
    track('date_changed', { screen: 'folders', offset_days: off });
    setDateRaw(d);
  };
  const { data } = useQuery({ queryKey: ['folders', date], queryFn: () => listFolders(date) });
  const { data: attended = [] } = useQuery({ queryKey: ['attendance', date], queryFn: () => listAttendedDogIds(date) });
  const attendedSet = useMemo(() => new Set(attended), [attended]);
  const [showAbsent, setShowAbsent] = useState(false);
  const perDog = data?.perDog ?? [];
  const unassigned = data?.unassigned ?? 0;
  const total = data?.total ?? 0;
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
            <h1 style={{ fontSize: 22 }}>{relativeLabel(date) ?? '지난'} 폴더</h1>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Link to="/feedback?from=folders" className="icon-btn" aria-label="피드백 보내기" style={{ fontSize: 18 }} onClick={() => track('feedback_opened', { from: 'folders' })}>💬</Link>
            <Link to="/guide" className="icon-btn" aria-label="사용 안내" style={{ fontSize: 18, fontWeight: 700, color: 'var(--mint)' }} onClick={() => track('guide_opened', { from: 'folders' })}>?</Link>
            <Link to="/settings" className="icon-btn" aria-label="설정" style={{ fontSize: 22 }}>⚙</Link>
            <Link to="/dogs" className="icon-btn icon-btn--mint" aria-label="강아지 관리" style={{ fontSize: 13, width: 'auto', padding: '0 12px' }}>강아지</Link>
          </div>
        </div>
        <div className="stats">
          <div className="stat" style={{ background: 'var(--surface)' }}><span className="sub">촬영</span><b>{total}</b></div>
          <div className="stat" style={{ background: 'var(--pink-light)', color: 'var(--pink)' }}><span style={{ fontSize: 12 }}>미지정</span><b>{unassigned}</b></div>
          <Link to={`/send?d=${date}`} className="stat" style={{ background: 'var(--blue-light)', color: 'var(--blue-dark)' }}><span style={{ fontSize: 12 }}>미발송 →</span><b>{perDog.filter((f) => f.unsent > 0).length}</b></Link>
        </div>
        <DateNav date={date} onChange={setDate} />
        <SearchBox value={query} onChange={(q) => { if (q.trim().length === 1 && !query.trim()) track('search_used', { screen: 'folders' }); setQuery(q); }} />
      </header>

      <main className="body" style={{ paddingBottom: 100 }}>
        <InstallHint />
        {!getPartner() ? (
          <Link to="/settings#partner" className="card card--row" style={{ color: 'inherit', borderStyle: 'dashed' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span className="title">유치원 코드가 없어요</span>
              <span className="sub">받은 링크로 다시 열거나, 설정에서 코드를 넣어 주세요</span>
            </span>
            <Chip label="설정" tone="gray" />
          </Link>
        ) : null}
        <Link to={`/attendance?d=${date}`} className="card card--row" style={{ borderColor: 'var(--mint-mid)', color: 'inherit' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span className="title">오늘 등원 {hasAttendance ? `${attended.length}마리` : '체크'}</span>
            <span className="sub">{hasAttendance ? '카메라와 폴더에 오늘 온 아이만 보여요' : '체크하면 카메라에 오늘 온 아이만 떠요'}</span>
          </span>
          <Chip label={hasAttendance ? '수정' : '체크하기'} tone="mint" />
        </Link>
        {unassigned > 0 && !query ? (
          <Link to={`/folders/unassigned?d=${date}`} className="card card--row" style={{ borderColor: 'var(--pink-mid)', borderWidth: 1.5, color: 'inherit' }}>
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
          <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { track('absent_toggled', { show: !showAbsent }); setShowAbsent((v) => !v); }}>
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
            <Chip
              label={f.count === 0 ? '촬영 중' : f.unsent === 0 ? `${f.sendCount}회 보냄` : f.sendCount > 0 ? `미발송 ${f.unsent} · ${f.sendCount}회 보냄` : f.reviewed ? '검수 완료' : '검수 전'}
              tone={f.count === 0 ? 'gray' : f.unsent === 0 ? 'mint' : f.reviewed ? 'blue' : 'pink'}
            />
          </button>
        ))}
      </main>

      <footer className="footer footer--surface" style={{ borderTop: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {isToday ? <button type="button" className="btn" style={{ flex: 1.6 }} onClick={() => { track('camera_opened', { from: 'folders', attended: attended.length, dogs: perDog.length }); navigate('/camera'); }}>촬영 시작</button> : <button type="button" className="btn btn--outline" style={{ flex: 1.6 }} onClick={() => setDate(localDate())}>오늘로 돌아가기</button>}
          {perDog.some((f) => f.unsent > 0) ? (
            <button type="button" className="btn btn--outline" style={{ flex: 1 }} onClick={() => { track('send_opened', { from: 'folders_footer' }); navigate(`/send?d=${date}`); }}>
              보내기 ({perDog.filter((f) => f.unsent > 0).length})
            </button>
          ) : null}
        </div>
      </footer>

      <DogSheet dog={picked} count={pickedCount} date={date} onClose={() => setPicked(null)} />
    </div>
  );
}
