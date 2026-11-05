import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DogAvatar, TopBar, useObjectUrl } from '../components/ui';
import type { MediaItem } from '../db/db';
import { finishSessionReview, listActiveDogs, listSessionMedia } from '../db/repo';
import { useCaptureStore } from '../store/capture';

const UNASSIGNED = '__unassigned__';

export function SessionReviewScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { sessionId, reset } = useCaptureStore();
  const { data: items = [] } = useQuery({
    queryKey: ['session-media', sessionId],
    queryFn: () => (sessionId ? listSessionMedia(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  const sections = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const m of items) {
      for (const k of m.dogIds.length ? m.dogIds : [UNASSIGNED]) map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [UNASSIGNED, ...dogs.map((d) => d.id)]
      .filter((k) => map.has(k))
      .map((k) => ({ key: k, dog: dogs.find((d) => d.id === k) ?? null, media: map.get(k) ?? [] }));
  }, [items, dogs]);

  const toggle = (id: string) =>
    setDeleted((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async () => {
    if (!sessionId) return;
    if (deleted.size > 0 && !window.confirm(`${deleted.size}개를 삭제할까요? 삭제는 되돌릴 수 없어요.`)) return;
    await finishSessionReview(sessionId, items.filter((m) => !deleted.has(m.id)).map((m) => m.id));
    await qc.invalidateQueries({ queryKey: ['folders'] });
    reset();
    navigate('/folders', { replace: true });
  };

  return (
    <div className="screen">
      <TopBar title="이번 촬영 검수" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 0' }}>
        <span className="sub" style={{ flex: 1 }}>지울 사진만 탭하세요. 나머지는 모두 저장돼요</span>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setDeleted(new Set())}>전체 가져가기</button>
      </div>
      <main className="body" style={{ gap: 14, paddingBottom: 140 }}>
        {sections.map((s) => (
          <section key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {s.dog ? <DogAvatar name={s.dog.name} sex={s.dog.sex} thumb={s.dog.thumbBlob} size={32} /> : <span className="avatar" style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--gray)' }} />}
              <span className="title">{s.dog?.name ?? '미지정'}</span>
              <span className="sub" style={{ flex: 1, color: s.dog ? undefined : 'var(--pink)', fontWeight: s.dog ? 400 : 700 }}>
                {s.media.length}개 · 삭제 {s.media.filter((m) => deleted.has(m.id)).length}{s.dog ? '' : ' · 저장 후 폴더 검수에서 배정'}
              </span>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setDeleted((p) => new Set([...p, ...s.media.map((m) => m.id)]))}>전체 삭제</button>
            </div>
            <div className="grid4">
              {s.media.map((m) => <Cell key={m.id} m={m} deleted={deleted.has(m.id)} onToggle={() => toggle(m.id)} />)}
            </div>
          </section>
        ))}
      </main>
      <footer className="footer footer--surface">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <b>가져가기 {items.length - deleted.size}개 · <span style={{ color: 'var(--pink)' }}>삭제 {deleted.size}개</span></b>
          <span className="sub">삭제는 되돌릴 수 없어요</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--outline" style={{ flex: 1 }} onClick={() => navigate('/camera', { replace: true })}>계속 촬영</button>
          <button type="button" className="btn" style={{ flex: 1.6 }} onClick={save}>저장하고 폴더로</button>
        </div>
      </footer>
    </div>
  );
}

function Cell({ m, deleted, onToggle }: { m: MediaItem; deleted: boolean; onToggle: () => void }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  return (
    <button type="button" className={`cell ${deleted ? 'cell--deleted' : ''}`} onClick={onToggle} aria-pressed={deleted}>
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
      {deleted ? <span className="cell__del">✕</span> : null}
    </button>
  );
}
