import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DogSheet } from '../components/DogSheet';
import { matchesName, SearchBox } from '../components/SearchBox';
import { DogAvatar, SexBadge, TopBar } from '../components/ui';
import type { Dog } from '../db/db';
import { listActiveDogs, listInactiveDogs, setDogActive } from '../db/repo';
import { track } from '../lib/analytics';

export function DogsScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Dog | null>(null);
  const qc = useQueryClient();
  const onQuery = (q: string) => { if (q.trim().length === 1 && !query.trim()) track('search_used', { screen: 'dogs' }); setQuery(q); };
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const { data: inactive = [] } = useQuery({ queryKey: ['inactive-dogs'], queryFn: listInactiveDogs });
  const [showInactive, setShowInactive] = useState(false);
  const filtered = useMemo(() => dogs.filter((d) => matchesName(d.name, query)), [dogs, query]);
  const restore = async (id: string) => {
    await setDogActive(id, true);
    track('dog_restored');
    await Promise.all([qc.invalidateQueries({ queryKey: ['dogs'] }), qc.invalidateQueries({ queryKey: ['inactive-dogs'] }), qc.invalidateQueries({ queryKey: ['folders'] })]);
  };

  return (
    <div className="screen screen--surface">
      <TopBar title="강아지 관리" onBack={() => navigate(-1)} right={<Link to="/dogs/new" className="icon-btn icon-btn--mint" aria-label="강아지 등록">+</Link>} />
      <main className="body">
        <SearchBox value={query} onChange={onQuery} />
        {filtered.map((d) => (
          <button key={d.id} type="button" className="card card--row" style={{ textAlign: 'left', width: '100%' }} onClick={() => setPicked(d)}>
            <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} />
            <span className="title" style={{ flex: 1 }}>{d.name}</span>
            <SexBadge sex={d.sex} />
          </button>
        ))}
        {dogs.length > 0 && filtered.length === 0 ? <div className="sub">"{query.trim()}" 강아지가 없어요</div> : null}
        <Link to="/dogs/new" className="btn">강아지 등록</Link>
        {inactive.length > 0 ? (
          <>
            <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? '퇴원한 아이 접기' : `퇴원한 아이 ${inactive.length}마리 보기`}
            </button>
            {showInactive ? inactive.map((d) => (
              <div key={d.id} className="card card--row" style={{ opacity: 0.7 }}>
                <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} />
                <span className="title" style={{ flex: 1 }}>{d.name}</span>
                <button type="button" className="btn btn--small btn--outline" onClick={() => restore(d.id)}>복원</button>
              </div>
            )) : null}
          </>
        ) : null}
      </main>
      <DogSheet dog={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
