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

/** 검색창은 이 마릿수부터. 그 아래선 목록이 한 화면에 들어온다. */
const SEARCH_FROM = 9;

/**
 * 오늘 폴더. 이 화면의 일은 "촬영 시작"과 "보내기" 둘뿐이고, 나머지는 그 둘을 돕는 정보다.
 * 숫자는 제자리에(오늘 N장은 날짜 줄, 미발송은 보내기 버튼과 각 행), 카드는 상황이 있을 때만.
 */
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
  const { data, isLoading } = useQuery({ queryKey: ['folders', date], queryFn: () => listFolders(date) });
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
  const unsentDogs = perDog.filter((f) => f.unsent > 0).length;

  const header = (
    <header className="topbar" style={{ padding: 'calc(var(--safe-top) + 12px) 20px 12px', gap: 10 }}>
      <img src={`${import.meta.env.BASE_URL}logo-face-128.png`} alt="" width={36} height={36} style={{ borderRadius: 10 }} />
      <h1 style={{ fontSize: 22 }}>{relativeLabel(date) ?? '지난'} 폴더</h1>
      <Link to="/settings" className="icon-btn" aria-label="설정" style={{ fontSize: 22 }}>⚙</Link>
      {perDog.length > 0 ? (
        <Link to="/dogs" className="icon-btn icon-btn--mint" aria-label="강아지 관리" style={{ fontSize: 13, width: 'auto', padding: '0 14px' }}>강아지</Link>
      ) : null}
    </header>
  );

  // 첫 실행: 강아지가 없으면 할 일 하나만 보여준다.
  if (!isLoading && perDog.length === 0) {
    return (
      <div className="screen screen--surface">
        {header}
        <main className="body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 18, paddingBottom: 80 }}>
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="하루멍" width={132} height={132} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <b style={{ fontSize: 20 }}>첫 강아지를 등록해 볼까요?</b>
            <span className="sub" style={{ fontSize: 14, lineHeight: 1.6 }}>이름, 성별, 보호자 연락처만 있으면 돼요.<br />등록한 아이는 촬영할 때 바로 고를 수 있어요.</span>
          </div>
          <Link to="/dogs/new" className="btn" style={{ width: 'auto', padding: '0 32px' }}>강아지 등록</Link>
          <Link to="/guide" className="sub" style={{ fontWeight: 700, color: 'var(--mint)' }} onClick={() => track('guide_opened', { from: 'empty' })}>사용 안내 먼저 보기</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="screen screen--surface">
      {header}

      <main className="body" style={{ paddingBottom: 100 }}>
        {/* 날짜 + 오늘 N장 */}
        <DateNav date={date} onChange={setDate} compact right={<span className="sub" style={{ fontWeight: 700 }}>{relativeLabel(date) ?? '그날'} {total}장</span>} />

        <InstallHint compact />

        {!getPartner() ? (
          <Link to="/settings#partner" className="row-card" style={{ borderStyle: 'dashed' }}>
            <span style={{ flex: 1 }}><b>유치원 코드가 없어요</b> <span className="sub">· 받은 링크로 열거나 설정에서 입력</span></span>
            <span className="sub" style={{ fontWeight: 700, color: 'var(--mint)' }}>설정</span>
          </Link>
        ) : null}

        {/* 등원: 체크 전엔 이 화면의 첫 번째 할 일이라 크게, 체크 뒤엔 한 줄 */}
        {isToday && !hasAttendance ? (
          <Link to={`/attendance?d=${date}`} className="card card--row" style={{ borderColor: 'var(--mint-mid)', borderWidth: 1.5, color: 'inherit', padding: '16px' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--mint-light)', color: 'var(--mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, flex: '0 0 auto' }}>✓</span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontSize: 16 }}>오늘 등원 체크하기</b>
              <span className="sub">온 아이만 고르면 카메라가 가벼워져요</span>
            </span>
            <span style={{ fontSize: 20, color: 'var(--mint)' }}>›</span>
          </Link>
        ) : hasAttendance ? (
          <Link to={`/attendance?d=${date}`} className="row-card">
            <span className="sub" style={{ flex: 1 }}>{relativeLabel(date) ?? '그날'} 등원 <b style={{ color: 'var(--text)' }}>{attended.length}마리</b> · 카메라엔 이 아이들만</span>
            <span className="sub" style={{ fontWeight: 700, color: 'var(--mint)' }}>수정</span>
          </Link>
        ) : null}

        {/* 미지정: 있을 때만, 한 줄 */}
        {unassigned > 0 && !query ? (
          <Link to={`/folders/unassigned?d=${date}`} className="row-card" style={{ borderColor: 'var(--mint-mid)', borderWidth: 1.5 }}>
            <span style={{ flex: 1, fontSize: 14 }}><b>미지정 사진 {unassigned}장</b> <span className="sub">· 강아지를 정해 주세요</span></span>
            <Chip label="배정" tone="orange" />
          </Link>
        ) : null}

        {perDog.length >= SEARCH_FROM ? (
          <SearchBox value={query} onChange={(q) => { if (q.trim().length === 1 && !query.trim()) track('search_used', { screen: 'folders' }); setQuery(q); }} />
        ) : null}
        {perDog.length > 0 && filtered.length === 0 ? (
          <div className="card">
            <div className="title">"{query.trim()}" 강아지가 없어요</div>
            <div className="sub">이름을 다시 확인해 주세요</div>
          </div>
        ) : null}

        {(showAbsent ? [...present, ...absent] : present).map((f) => (
          <button key={f.dog.id} type="button" className="card card--row" style={{ textAlign: 'left', width: '100%', opacity: hasAttendance && !attendedSet.has(f.dog.id) && f.count === 0 ? 0.55 : 1 }} onClick={() => setPicked(f.dog)}>
            <DogAvatar name={f.dog.name} sex={f.dog.sex} thumb={f.dog.thumbBlob} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="title">{f.dog.name}</span>
                <SexBadge sex={f.dog.sex} />
              </span>
              <span className="sub">
                사진 {f.count}{f.unsent > 0 ? <> · <b style={{ color: 'var(--mint)' }}>미발송 {f.unsent}</b></> : null}
              </span>
            </span>
            {f.count === 0 ? (
              <Chip label="촬영 중" tone="gray" />
            ) : f.unsent === 0 ? (
              <Chip label={`${f.sendCount}회 보냄`} tone="done" />
            ) : (
              <Chip label={`미발송 ${f.unsent}`} tone="orange" />
            )}
          </button>
        ))}

        {absent.length > 0 ? (
          <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { track('absent_toggled', { show: !showAbsent }); setShowAbsent((v) => !v); }}>
            {showAbsent ? '안 온 아이 접기' : `${relativeLabel(date) ?? '그날'} 안 온 아이 ${absent.length}마리 보기`}
          </button>
        ) : null}
      </main>

      <footer className="footer footer--surface" style={{ borderTop: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {isToday ? (
            <button type="button" className="btn" style={{ flex: 1.6 }} onClick={() => { track('camera_opened', { from: 'folders', attended: attended.length, dogs: perDog.length }); navigate('/camera'); }}>촬영 시작</button>
          ) : (
            <button type="button" className="btn btn--outline" style={{ flex: 1.6 }} onClick={() => setDate(localDate())}>오늘로 돌아가기</button>
          )}
          {unsentDogs > 0 ? (
            <button type="button" className="btn btn--outline" style={{ flex: 1 }} onClick={() => { track('send_opened', { from: 'folders_footer' }); navigate(`/send?d=${date}`); }}>
              보내기 ({unsentDogs})
            </button>
          ) : null}
        </div>
      </footer>

      <DogSheet dog={picked} count={pickedCount} date={date} onClose={() => setPicked(null)} />
    </div>
  );
}
