import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { matchesName, SearchBox } from '../components/SearchBox';
import { DogAvatar, SexBadge, TopBar } from '../components/ui';
import { DateNav, useDateParam } from '../components/DateNav';
import { listActiveDogs, listAttendedDogIds, setAttendance, toggleAttendance } from '../db/repo';

/** 오늘 등원 체크. 탭하면 바로 저장되고, 카메라 스트립과 폴더 목록이 이 명단으로 줄어든다. */
export function AttendanceScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [date, setDate] = useDateParam();
  const [query, setQuery] = useState('');
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const { data: attended = [] } = useQuery({ queryKey: ['attendance', date], queryFn: () => listAttendedDogIds(date) });
  const attendedSet = useMemo(() => new Set(attended), [attended]);
  const filtered = useMemo(() => dogs.filter((d) => matchesName(d.name, query)), [dogs, query]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['attendance', date] });

  const toggle = useMutation({
    mutationFn: (dogId: string) => toggleAttendance(date, dogId),
    onSuccess: invalidate,
  });
  const setAll = useMutation({
    mutationFn: (ids: string[]) => setAttendance(date, ids),
    onSuccess: invalidate,
  });

  return (
    <div className="screen screen--surface">
      <TopBar title="등원 체크" onBack={() => navigate(-1)} right={<span className="badge badge--mint">{attended.length}마리</span>} />
      <main className="body" style={{ paddingBottom: 100 }}>
        <DateNav date={date} onChange={setDate} />
        <SearchBox value={query} onChange={setQuery} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--small btn--outline" onClick={() => setAll.mutate(dogs.map((d) => d.id))}>전체 선택</button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setAll.mutate([])}>전체 해제</button>
        </div>
        {filtered.map((d) => {
          const on = attendedSet.has(d.id);
          return (
            <button
              key={d.id}
              type="button"
              className={`card card--row ${on ? 'card--on' : ''}`}
              style={{ textAlign: 'left', width: '100%' }}
              aria-pressed={on}
              onClick={() => toggle.mutate(d.id)}
            >
              <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} />
              <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="title">{d.name}</span>
                <SexBadge sex={d.sex} />
              </span>
              <span className={`check ${on ? 'check--on' : ''}`}>{on ? '✓' : ''}</span>
            </button>
          );
        })}
        {dogs.length > 0 && filtered.length === 0 ? <div className="sub">"{query.trim()}" 강아지가 없어요</div> : null}
      </main>
      <footer className="footer footer--surface" style={{ borderTop: 0 }}>
        <button type="button" className="btn" onClick={() => navigate('/camera')}>촬영 시작 ({attended.length}마리)</button>
        <button type="button" className="btn btn--ghost" onClick={() => navigate(-1)}>완료</button>
      </footer>
    </div>
  );
}
