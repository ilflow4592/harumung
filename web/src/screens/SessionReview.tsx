import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { MediaViewer } from '../components/MediaViewer';
import { DogAvatar, TopBar, useObjectUrl } from '../components/ui';
import type { Dog, MediaItem } from '../db/db';
import { finishSessionReview, listActiveDogs, listAttendedDogIds, listSessionMedia, localDate } from '../db/repo';
import { track } from '../lib/analytics';
import { useCaptureStore } from '../store/capture';

const UNASSIGNED = '__unassigned__';
type Mode = 'delete' | 'assign';

/**
 * 이번 촬영 검수. 삭제 모드: 지울 사진만 탭. 배정 모드: 강아지를 고른 뒤 사진을 탭해 붙이거나 뗀다.
 * 둘 다 "저장하고 폴더로"를 눌러야 반영된다.
 */
export function SessionReviewScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { sessionId, reset } = useCaptureStore();
  const { data: items = [] } = useQuery({
    queryKey: ['session-media', sessionId],
    queryFn: () => (sessionId ? listSessionMedia(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });
  const { data: allDogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const date = localDate();
  const { data: attended = [] } = useQuery({ queryKey: ['attendance', date], queryFn: () => listAttendedDogIds(date) });

  const [mode, setMode] = useState<Mode>('delete');
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  /** 배정 변경분. 없는 키는 원래 dogIds 그대로. */
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const [target, setTarget] = useState<string | null>(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const openView = (m: MediaItem) => { track('viewer_opened', { from: 'session_review', kind: m.kind }); setViewIndex(items.findIndex((x) => x.id === m.id)); };
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current || items.length === 0) return;
    openedRef.current = true;
    track('session_review_opened', { items: items.length, unassigned: items.filter((m) => m.dogIds.length === 0).length, videos: items.filter((m) => m.kind === 'VIDEO').length });
  }, [items]);

  const dogIdsOf = (m: MediaItem) => assign[m.id] ?? m.dogIds;

  // 배정 스트립: 등원 체크가 있으면 등원 아이만, '+ 전체'로 펼침
  const stripDogs = useMemo(() => {
    if (attended.length === 0 || showAll) return allDogs;
    const set = new Set(attended);
    return allDogs.filter((d) => set.has(d.id));
  }, [allDogs, attended, showAll]);
  const targetDog = allDogs.find((d) => d.id === target) ?? null;

  const sections = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const m of items) {
      const ids = dogIdsOf(m);
      for (const k of ids.length ? ids : [UNASSIGNED]) map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [UNASSIGNED, ...allDogs.map((d) => d.id)]
      .filter((k) => map.has(k))
      .map((k) => ({ key: k, dog: allDogs.find((d) => d.id === k) ?? null, media: map.get(k) ?? [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, allDogs, assign]);

  const unassignedCount = items.filter((m) => dogIdsOf(m).length === 0 && !deleted.has(m.id)).length;
  const assignGrid = onlyUnassigned ? items.filter((m) => dogIdsOf(m).length === 0) : items;

  const toggleDelete = (id: string) =>
    setDeleted((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** 배정 모드에서 사진 탭: 고른 강아지를 붙이거나 뗀다. */
  const toggleAssign = (m: MediaItem) => {
    if (!target || deleted.has(m.id)) return;
    const cur = dogIdsOf(m);
    const next = cur.includes(target) ? cur.filter((id) => id !== target) : [...cur, target];
    setAssign((prev) => ({ ...prev, [m.id]: next }));
  };

  /** 미지정 전부를 고른 강아지에게. */
  const fillUnassigned = () => {
    if (!target) return;
    track('unassigned_fill_all', { count: unassignedCount });
    setAssign((prev) => {
      const next = { ...prev };
      for (const m of items) if (dogIdsOf(m).length === 0 && !deleted.has(m.id)) next[m.id] = [target];
      return next;
    });
  };

  const save = async () => {
    if (!sessionId) return;
    if (deleted.size > 0 && !window.confirm(`${deleted.size}개를 삭제할까요? 삭제는 되돌릴 수 없어요.`)) return;
    await finishSessionReview(sessionId, items.filter((m) => !deleted.has(m.id)).map((m) => m.id), assign);
    track('session_review_saved', { kept: items.length - deleted.size, deleted: deleted.size, assign_changes: Object.keys(assign).length, unassigned_left: unassignedCount, used_assign_tab: Object.keys(assign).length > 0 });
    await qc.invalidateQueries({ queryKey: ['folders'] });
    reset();
    navigate('/folders', { replace: true });
  };

  return (
    <div className="screen">
      <TopBar
        title="이번 촬영 검수"
        right={
          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'delete'} className={mode === 'delete' ? 'on' : ''} onClick={() => setMode('delete')}>삭제</button>
            <button type="button" role="tab" aria-selected={mode === 'assign'} className={mode === 'assign' ? 'on' : ''} onClick={() => { track('session_assign_tab', { unassigned: unassignedCount }); setMode('assign'); }}>
              배정{unassignedCount > 0 ? <span className="seg__dot">{unassignedCount}</span> : null}
            </button>
          </div>
        }
      />

      {mode === 'delete' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 0' }}>
            <span className="sub" style={{ flex: 1 }}>지울 사진만 탭하세요. 길게 누르면 크게 보여요</span>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setDeleted(new Set())}>전체 가져가기</button>
          </div>
          <main className="body" style={{ gap: 14, paddingBottom: 140 }}>
            {sections.map((s) => (
              <section key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.dog ? <DogAvatar name={s.dog.name} sex={s.dog.sex} thumb={s.dog.thumbBlob} size={32} /> : <span className="avatar" style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--gray)' }} />}
                  <span className="title">{s.dog?.name ?? '미지정'}</span>
                  <span className="sub" style={{ flex: 1, color: s.dog ? undefined : 'var(--pink)', fontWeight: s.dog ? 400 : 700 }}>
                    {s.media.length}개 · 삭제 {s.media.filter((m) => deleted.has(m.id)).length}
                  </span>
                  {s.dog ? (
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => setDeleted((p) => new Set([...p, ...s.media.map((m) => m.id)]))}>전체 삭제</button>
                  ) : (
                    <button type="button" className="btn btn--small" onClick={() => { setMode('assign'); setOnlyUnassigned(true); }}>배정하기</button>
                  )}
                </div>
                <div className="grid4">
                  {s.media.map((m) => <DeleteCell key={m.id} m={m} deleted={deleted.has(m.id)} onToggle={() => toggleDelete(m.id)} onView={() => openView(m)} />)}
                </div>
              </section>
            ))}
          </main>
        </>
      ) : (
        <>
          <div className="assign-head">
            <div className="sub" style={{ padding: '0 20px' }}>
              {targetDog ? <>사진을 탭하면 <b style={{ color: 'var(--mint)' }}>{targetDog.name}</b>에게 붙고, 다시 탭하면 떨어져요</> : '먼저 강아지를 고르세요'}
            </div>
            <div className="dogstrip">
              {stripDogs.map((d) => (
                <button key={d.id} type="button" className="dogstrip__dog" aria-pressed={target === d.id} onClick={() => setTarget(target === d.id ? null : d.id)}>
                  <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} size={52} selected={target === d.id} />
                  <span style={{ fontWeight: target === d.id ? 700 : 500 }}>{d.name}</span>
                </button>
              ))}
              {attended.length > 0 && attended.length < allDogs.length ? (
                <button type="button" className="dogstrip__dog" onClick={() => setShowAll((v) => !v)}>
                  <span className="dogstrip__more">{showAll ? '−' : '+'}</span>
                  <span>{showAll ? '등원만' : '전체'}</span>
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '0 20px', alignItems: 'center' }}>
              <button type="button" className={`btn btn--small ${onlyUnassigned ? '' : 'btn--ghost'}`} onClick={() => setOnlyUnassigned((v) => !v)}>
                미지정만 {unassignedCount}장
              </button>
              {targetDog && unassignedCount > 0 ? (
                <button type="button" className="btn btn--small btn--outline" onClick={fillUnassigned}>미지정 전부 → {targetDog.name}</button>
              ) : null}
            </div>
          </div>
          <main className="body" style={{ paddingBottom: 140 }}>
            {assignGrid.length === 0 ? <div className="sub">미지정 사진이 없어요</div> : null}
            <div className="grid4">
              {assignGrid.map((m) => (
                <AssignCell key={m.id} m={m} dogIds={dogIdsOf(m)} dogs={allDogs} target={target} deleted={deleted.has(m.id)} onTap={() => toggleAssign(m)} />
              ))}
            </div>
          </main>
        </>
      )}

      {viewIndex !== null ? <MediaViewer items={items} index={viewIndex} dogs={allDogs} onClose={() => setViewIndex(null)} onIndexChange={setViewIndex} /> : null}

      <footer className="footer footer--surface">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <b>
            가져가기 {items.length - deleted.size}개 · <span style={{ color: 'var(--pink)' }}>삭제 {deleted.size}개</span>
            {unassignedCount > 0 ? <span style={{ color: 'var(--text-2)', fontWeight: 500 }}> · 미지정 {unassignedCount}</span> : null}
          </b>
          <span className="sub">{Object.keys(assign).length > 0 ? `배정 변경 ${Object.keys(assign).length}장` : '삭제는 되돌릴 수 없어요'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--outline" style={{ flex: 1 }} onClick={() => { track('session_review_continue', { items: items.length }); navigate('/camera', { replace: true }); }}>계속 촬영</button>
          <button type="button" className="btn" style={{ flex: 1.6 }} onClick={save}>저장하고 폴더로</button>
        </div>
      </footer>
    </div>
  );
}

function DeleteCell({ m, deleted, onToggle, onView }: { m: MediaItem; deleted: boolean; onToggle: () => void; onView: () => void }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = () => { fired.current = false; timer.current = window.setTimeout(() => { fired.current = true; onView(); }, 450); };
  const cancel = () => window.clearTimeout(timer.current);
  return (
    <button
      type="button"
      className={`cell ${deleted ? 'cell--deleted' : ''}`}
      aria-pressed={deleted}
      onClick={() => { if (!fired.current) onToggle(); }}
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchMove={cancel}
      onContextMenu={(e) => { e.preventDefault(); onView(); }}
    >
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
      {deleted ? <span className="cell__del">✕</span> : null}
    </button>
  );
}

function AssignCell({ m, dogIds, dogs, target, deleted, onTap }: {
  m: MediaItem; dogIds: string[]; dogs: Dog[]; target: string | null; deleted: boolean; onTap: () => void;
}) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  const names = dogIds.map((id) => dogs.find((d) => d.id === id)?.name ?? '?');
  const hasTarget = target !== null && dogIds.includes(target);
  return (
    <button type="button" className={`cell ${hasTarget ? 'cell--on' : ''} ${deleted ? 'cell--dim' : ''}`} onClick={onTap} aria-pressed={hasTarget} disabled={deleted || !target}>
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
      {hasTarget ? <span className="cell__check">✓</span> : null}
      {deleted ? <span className="cell__del">✕</span> : null}
      <span className={`cell__names ${names.length === 0 ? 'cell__names--none' : ''}`}>
        {names.length === 0 ? '미지정' : names.length <= 2 ? names.join('·') : `${names[0]} 외 ${names.length - 1}`}
      </span>
    </button>
  );
}
