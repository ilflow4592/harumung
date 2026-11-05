import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { Chip, DogAvatar, InstallHint, SexBadge } from '../components/ui';
import { listTodayFolders } from '../db/repo';

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

export function FoldersScreen() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['folders', new Date().toISOString().slice(0, 10)],
    queryFn: () => listTodayFolders(new Date().toISOString()),
  });
  const perDog = data?.perDog ?? [];
  const unassigned = data?.unassigned ?? 0;
  const total = perDog.reduce((n, f) => n + f.count, 0) + unassigned;

  return (
    <div className="screen screen--surface">
      <header className="topbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14, padding: 'calc(var(--safe-top) + 12px) 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="sub" style={{ fontWeight: 500 }}>{todayLabel()}</div>
            <h1 style={{ fontSize: 22 }}>오늘 폴더</h1>
          </div>
          <Link to="/dogs/new" className="icon-btn icon-btn--mint" aria-label="강아지 등록">+</Link>
        </div>
        <div className="stats">
          <div className="stat" style={{ background: 'var(--surface)' }}><span className="sub">촬영</span><b>{total}</b></div>
          <div className="stat" style={{ background: 'var(--pink-light)', color: 'var(--pink)' }}><span style={{ fontSize: 12 }}>미지정</span><b>{unassigned}</b></div>
          <div className="stat" style={{ background: 'var(--blue-light)', color: 'var(--blue-dark)' }}><span style={{ fontSize: 12 }}>발송 대기</span><b>{perDog.filter((f) => f.count > 0).length}</b></div>
        </div>
      </header>

      <main className="body" style={{ paddingBottom: 100 }}>
        <InstallHint />
        {unassigned > 0 ? (
          <div className="card" style={{ borderColor: 'var(--pink-mid)', borderWidth: 1.5 }}>
            <div className="title">미지정 사진 {unassigned}장</div>
            <div className="sub">폴더 검수에서 강아지를 정해 주세요</div>
          </div>
        ) : null}
        {perDog.length === 0 ? (
          <div className="card">
            <div className="title">등록된 강아지가 없어요</div>
            <div className="sub">오른쪽 위 + 로 첫 강아지를 등록하세요</div>
          </div>
        ) : null}
        {perDog.map((f) => (
          <Link key={f.dog.id} to={`/folders/${f.dog.id}`} className="card card--row" style={{ color: 'inherit' }}>
            <DogAvatar name={f.dog.name} sex={f.dog.sex} thumb={f.dog.thumbBlob} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="title">{f.dog.name}</span>
                <SexBadge sex={f.dog.sex} />
              </span>
              <span className="sub">사진 {f.count}장 · A컷 {f.aCut}장</span>
            </span>
            <Chip label={f.count > 0 ? '발송 대기' : '촬영 중'} tone={f.count > 0 ? 'blue' : 'gray'} />
          </Link>
        ))}
      </main>

      <footer className="footer footer--surface" style={{ borderTop: 0 }}>
        <button type="button" className="btn" onClick={() => navigate('/camera')}>촬영 시작</button>
      </footer>
    </div>
  );
}
