import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { DogAvatar, SexBadge, TopBar } from '../components/ui';
import { listActiveDogs } from '../db/repo';

export function DogsScreen() {
  const navigate = useNavigate();
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  return (
    <div className="screen screen--surface">
      <TopBar title="강아지" onBack={() => navigate(-1)} />
      <main className="body">
        {dogs.map((d) => (
          <div key={d.id} className="card card--row">
            <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} />
            <span className="title" style={{ flex: 1 }}>{d.name}</span>
            <SexBadge sex={d.sex} />
          </div>
        ))}
        <Link to="/dogs/new" className="btn">강아지 등록</Link>
      </main>
    </div>
  );
}
