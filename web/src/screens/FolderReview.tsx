import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DogAvatar, SexBadge, TopBar, useObjectUrl } from '../components/ui';
import type { Dog, MediaItem } from '../db/db';
import { addDogToMedia, deleteMedia, listActiveDogs, listAttendedDogIds, listDogKept, listUnassignedKept, localDate, removeDogFromMedia } from '../db/repo';

const UNASSIGNED = 'unassigned';

/**
 * 폴더 검수. 강아지 폴더 또는 미지정 폴더(/folders/unassigned).
 * 사진을 골라 → 강아지 배정 / 이 폴더에서 빼기 / 삭제. 바로 반영된다.
 */
export function FolderReviewScreen() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { dogId = '' } = useParams();
  const isUnassigned = dogId === UNASSIGNED;

  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const folderDog = dogs.find((d) => d.id === dogId) ?? null;
  const { data: items = [] } = useQuery({
    queryKey: isUnassigned ? ['unassigned-kept'] : ['dog-kept', dogId],
    queryFn: () => (isUnassigned ? listUnassignedKept() : listDogKept(dogId)),
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 목록이 바뀌면(배정·삭제 뒤) 사라진 항목은 선택에서 뺀다
  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => items.some((m) => m.id === id))));
  }, [items]);

  const toggle = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['unassigned-kept'] }),
      qc.invalidateQueries({ queryKey: ['dog-kept'] }),
      qc.invalidateQueries({ queryKey: ['folders'] }),
    ]);
  };
  const say = (text: string) => { setToast(text); window.setTimeout(() => setToast(null), 1500); };

  const assignTo = async (dog: Dog) => {
    const ids = [...selected];
    setBusy(true);
    try {
      await addDogToMedia(ids, dog.id);
      await refresh();
      setSheet(false);
      say(`${ids.length}장을 ${dog.name}에게 배정했어요`);
    } finally { setBusy(false); }
  };

  const removeFromFolder = async () => {
    if (!folderDog) return;
    const ids = [...selected];
    setBusy(true);
    try {
      await removeDogFromMedia(ids, folderDog.id);
      await refresh();
      setSheet(false);
      say(`${ids.length}장을 ${folderDog.name} 폴더에서 뺐어요`);
    } finally { setBusy(false); }
  };

  const remove = async () => {
    const ids = [...selected];
    if (!window.confirm(`${ids.length}장을 삭제할까요? 삭제는 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      await deleteMedia(ids);
      await refresh();
      say(`${ids.length}장 삭제했어요`);
    } finally { setBusy(false); }
  };

  const title = isUnassigned ? '미지정 사진' : `${folderDog?.name ?? ''} 폴더`;

  return (
    <div className="screen">
      <TopBar
        title={title}
        onBack={() => navigate(-1)}
        right={
          items.length > 0 ? (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((m) => m.id)))}>
              {selected.size === items.length ? '전체 해제' : '전체 선택'}
            </button>
          ) : null
        }
      />
      <main className="body" style={{ paddingBottom: 120 }}>
        {items.length === 0 ? (
          <div className="card">
            <div className="title">{isUnassigned ? '미지정 사진이 없어요' : '아직 사진이 없어요'}</div>
            <div className="sub">{isUnassigned ? '모든 사진에 강아지가 정해졌어요' : '촬영 시작에서 이 아이를 골라 찍어 보세요'}</div>
          </div>
        ) : (
          <span className="sub">{isUnassigned ? '사진을 고른 뒤 아래에서 강아지를 정하세요' : '사진을 고르면 다른 아이 추가·폴더에서 빼기·삭제를 할 수 있어요'} · {items.length}개</span>
        )}
        <div className="grid3">
          {items.map((m) => <Cell key={m.id} m={m} dogs={dogs} selected={selected.has(m.id)} onToggle={() => toggle(m.id)} />)}
        </div>
      </main>

      {selected.size > 0 ? (
        <footer className="footer">
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" style={{ flex: 1.6 }} disabled={busy} onClick={() => setSheet(true)}>
              {isUnassigned ? `강아지 배정 (${selected.size})` : `옮기기·추가 (${selected.size})`}
            </button>
            <button type="button" className="btn btn--outline" style={{ flex: 1, borderColor: 'var(--pink)', color: 'var(--pink)' }} disabled={busy} onClick={remove}>
              삭제 ({selected.size})
            </button>
          </div>
        </footer>
      ) : null}

      {sheet ? <AssignSheet dogs={dogs} folderDog={folderDog} count={selected.size} busy={busy} onPick={assignTo} onRemove={removeFromFolder} onClose={() => setSheet(false)} /> : null}
      {toast ? <div className="cam__toast cam__toast--saved" style={{ bottom: 'calc(var(--safe-bottom) + 100px)', position: 'fixed' }}>✓ {toast}</div> : null}
    </div>
  );
}

function Cell({ m, dogs, selected, onToggle }: { m: MediaItem; dogs: Dog[]; selected: boolean; onToggle: () => void }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  const names = m.dogIds.map((id) => dogs.find((d) => d.id === id)?.name ?? '?');
  return (
    <button type="button" className={`cell ${selected ? 'cell--on' : ''}`} onClick={onToggle} aria-pressed={selected}>
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
      {selected ? <span className="cell__check">✓</span> : null}
      {names.length > 1 ? <span className="cell__names">{names.length <= 2 ? names.join('·') : `${names[0]} 외 ${names.length - 1}`}</span> : null}
    </button>
  );
}

/** 강아지 고르기 시트. 등원 아이 먼저, 그 아래 나머지. */
function AssignSheet({ dogs, folderDog, count, busy, onPick, onRemove, onClose }: {
  dogs: Dog[]; folderDog: Dog | null; count: number; busy: boolean;
  onPick: (dog: Dog) => void; onRemove: () => void; onClose: () => void;
}) {
  const date = localDate();
  const { data: attended = [] } = useQuery({ queryKey: ['attendance', date], queryFn: () => listAttendedDogIds(date) });
  const [closing, setClosing] = useState(false);
  const ordered = useMemo(() => {
    const set = new Set(attended);
    const candidates = dogs.filter((d) => d.id !== folderDog?.id);
    return [...candidates.filter((d) => set.has(d.id)), ...candidates.filter((d) => !set.has(d.id))];
  }, [dogs, attended, folderDog]);
  const attendedSet = new Set(attended);
  const close = () => { setClosing(true); window.setTimeout(onClose, 180); };

  return (
    <div className={`sheet-backdrop ${closing ? 'sheet-backdrop--out' : ''}`} onClick={close}>
      <div className={`sheet ${closing ? 'sheet--out' : ''}`} role="dialog" aria-label="강아지 배정" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
        <div className="title">{count}장을 누구에게?</div>
        {folderDog ? (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onRemove} style={{ color: 'var(--pink)' }}>
            {folderDog.name} 폴더에서 빼기 (미지정으로)
          </button>
        ) : null}
        {ordered.map((d) => (
          <button key={d.id} type="button" className="card card--row" style={{ textAlign: 'left', width: '100%' }} disabled={busy} onClick={() => onPick(d)}>
            <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} size={40} />
            <span className="title" style={{ flex: 1 }}>{d.name}</span>
            {attendedSet.has(d.id) ? <span className="badge badge--mint">등원</span> : null}
            <SexBadge sex={d.sex} />
          </button>
        ))}
        <button type="button" className="btn btn--ghost" onClick={close}>취소</button>
      </div>
    </div>
  );
}
