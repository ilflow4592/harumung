import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DogSheet } from '../components/DogSheet';
import { matchesName, SearchBox } from '../components/SearchBox';
import { DogAvatar, SexBadge, TopBar } from '../components/ui';
import type { Dog } from '../db/db';
import { listActiveDogs } from '../db/repo';

export function DogsScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Dog | null>(null);
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const filtered = useMemo(() => dogs.filter((d) => matchesName(d.name, query)), [dogs, query]);

  return (
    <div className="screen screen--surface">
      <TopBar title="강아지" onBack={() => navigate(-1)} right={<span className="sub">{dogs.length}마리</span>} />
      <main className="body">
        <SearchBox value={query} onChange={setQuery} />
        {filtered.map((d) => (
          <button key={d.id} type="button" className="card card--row" style={{ textAlign: 'left', width: '100%' }} onClick={() => setPicked(d)}>
            <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} />
            <span className="title" style={{ flex: 1 }}>{d.name}</span>
            <SexBadge sex={d.sex} />
          </button>
        ))}
        {dogs.length > 0 && filtered.length === 0 ? <div className="sub">"{query.trim()}" 강아지가 없어요</div> : null}
        <Link to="/dogs/new" className="btn">강아지 등록</Link>
      </main>
      <DogSheet dog={picked} onClose={() => setPicked(null)} />
    </div>
  );
}
