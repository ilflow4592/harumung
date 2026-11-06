import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DateNav, useDateParam } from '../components/DateNav';
import { MediaViewer } from '../components/MediaViewer';
import { PhotoEditor } from '../components/PhotoEditor';
import { VideoEditor } from '../components/VideoEditor';
import { DogAvatar, SexBadge, TopBar, useObjectUrl } from '../components/ui';
import type { Dog, MediaItem } from '../db/db';
import { addDogsToMedia, deleteMedia, listActiveDogs, listAttendedDogIds, listDogKeptOn, listReviewedDogIds, listSendLogs, listUnassignedKept, localDate, removeDogFromMedia, setFolderReviewed } from '../db/repo';

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
  const [date, setDate] = useDateParam();
  const { data: items = [] } = useQuery({
    queryKey: isUnassigned ? ['unassigned-kept'] : ['dog-kept', dogId, date],
    queryFn: () => (isUnassigned ? listUnassignedKept() : listDogKeptOn(dogId, date)),
  });

  // 보기 모드: 탭하면 크게. 선택 모드: 탭하면 체크. 선택이 하나라도 있으면 선택 모드 유지.
  const [selecting, setSelecting] = useState(isUnassigned);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const { data: reviewedIds = [] } = useQuery({ queryKey: ['folder-reviews', date], queryFn: () => listReviewedDogIds(date) });
  const reviewed = !isUnassigned && reviewedIds.includes(dogId);
  const { data: logs = [] } = useQuery({ queryKey: ['send-logs', date, dogId], queryFn: () => listSendLogs(date, dogId), enabled: !isUnassigned });
  // 사진별 발송 회차 (처음 보낸 회차)
  const sentRound = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l, i) => l.mediaIds.forEach((id) => { if (!map.has(id)) map.set(id, i + 1); }));
    return map;
  }, [logs]);
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
  const onCellTap = (i: number) => {
    if (selecting) toggle(items[i].id);
    else setViewIndex(i);
  };
  const exitSelect = () => { setSelected(new Set()); setSelecting(false); };

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['unassigned-kept'] }),
      qc.invalidateQueries({ queryKey: ['dog-kept'] }),
      qc.invalidateQueries({ queryKey: ['folders'] }),
      qc.invalidateQueries({ queryKey: ['folder-reviews'] }),
    ]);
  };

  /** 검수 완료 토글. 완료되면 폴더 목록에 체크가 붙고 발송 준비로 잡힌다. */
  const toggleReviewed = async () => {
    if (!folderDog) return;
    setBusy(true);
    try {
      await setFolderReviewed(date, folderDog.id, !reviewed);
      await refresh();
      if (reviewed) {
        say('검수를 다시 열었어요');
      } else {
        // 완료하면 메인(오늘 폴더)으로 돌아간다. 다음 강아지로 바로 넘어가기 위해.
        navigate('/folders', { replace: true });
      }
    } finally { setBusy(false); }
  };
  const say = (text: string) => { setToast(text); window.setTimeout(() => setToast(null), 1500); };

  const assignTo = async (picked: Dog[]) => {
    const ids = [...selected];
    setBusy(true);
    try {
      await addDogsToMedia(ids, picked.map((d) => d.id));
      await refresh();
      setSheet(false);
      const who = picked.length === 1 ? picked[0].name : `${picked[0].name} 외 ${picked.length - 1}마리`;
      say(`${ids.length}장을 ${who}에게 배정했어요`);
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
  const today = localDate();

  return (
    <div className="screen">
      <TopBar
        title={title}
        onBack={() => navigate(-1)}
        right={
          items.length > 0 ? (
            selecting ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((m) => m.id)))}>
                  {selected.size === items.length ? '전체 해제' : '전체 선택'}
                </button>
                {!isUnassigned ? <button type="button" className="btn btn--ghost btn--small" onClick={exitSelect}>완료</button> : null}
              </div>
            ) : (
              <button type="button" className="btn btn--outline btn--small" onClick={() => setSelecting(true)}>선택</button>
            )
          ) : null
        }
      />
      <main className="body" style={{ paddingBottom: 120 }}>
        {!isUnassigned ? <DateNav date={date} onChange={setDate} compact /> : null}
        {logs.length > 0 ? (
          <div className="card card--row" style={{ padding: '10px 14px' }}>
            <span className="badge badge--mint">{logs.length}회 보냄</span>
            <span className="sub" style={{ flex: 1 }}>
              {logs.map((l, i) => `${i + 1}번째 ${new Date(l.sentAt).toTimeString().slice(0, 5)} (${l.mediaCount}개)`).join(' · ')}
            </span>
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="card">
            <div className="title">{isUnassigned ? '미지정 사진이 없어요' : '아직 사진이 없어요'}</div>
            <div className="sub">{isUnassigned ? '모든 사진에 강아지가 정해졌어요' : '촬영 시작에서 이 아이를 골라 찍어 보세요'}</div>
          </div>
        ) : (
          <span className="sub">{isUnassigned ? '사진을 고른 뒤 아래에서 강아지를 정하세요' : selecting ? '사진을 고르면 다른 아이 추가·폴더에서 빼기·삭제를 할 수 있어요' : '탭하면 크게 보여요. 오른쪽 위 선택으로 옮기기·삭제'} · {items.length}개</span>
        )}
        {reviewed ? (
          <div className="card card--row" style={{ borderColor: 'var(--mint)', background: 'var(--mint-light)', color: 'var(--mint)' }}>
            <span className="check check--on">✓</span>
            <span style={{ flex: 1, fontWeight: 700 }}>검수 완료 · 발송 준비됐어요</span>
            {date === today ? <span className="sub" style={{ color: 'var(--mint)' }}>새 사진이 들어오면 풀려요</span> : null}
          </div>
        ) : null}
        <div className="grid3">
          {items.map((m, i) => <Cell key={m.id} m={m} dogs={dogs} selected={selected.has(m.id)} selecting={selecting} round={sentRound.get(m.id)} onTap={() => onCellTap(i)} />)}
        </div>
      </main>

      {viewIndex !== null && !editing ? <MediaViewer items={items} index={viewIndex} dogs={dogs} onClose={() => setViewIndex(null)} onIndexChange={setViewIndex} onEdit={setEditing} /> : null}
      {editing?.kind === 'PHOTO' ? <PhotoEditor item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); say('저장했어요'); }} /> : null}
      {editing?.kind === 'VIDEO' ? <VideoEditor item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); say('저장했어요'); }} /> : null}

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
      ) : folderDog && items.length > 0 ? (
        <footer className="footer">
          {reviewed ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn--ghost" style={{ flex: 1 }} disabled={busy} onClick={toggleReviewed}>검수 다시 열기</button>
              <button type="button" className="btn" style={{ flex: 1.4 }} onClick={() => navigate(`/send?d=${date}`)}>보호자에게 보내기</button>
            </div>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={toggleReviewed}>검수 완료 · 발송 준비</button>
          )}
        </footer>
      ) : null}

      {sheet ? <AssignSheet dogs={dogs} folderDog={folderDog} count={selected.size} busy={busy} onPick={assignTo} onRemove={removeFromFolder} onClose={() => setSheet(false)} /> : null}
      {toast ? <div className="cam__toast cam__toast--saved" style={{ bottom: 'calc(var(--safe-bottom) + 100px)', position: 'fixed' }}>✓ {toast}</div> : null}
    </div>
  );
}

function Cell({ m, dogs, selected, selecting, round, onTap }: { m: MediaItem; dogs: Dog[]; selected: boolean; selecting: boolean; round?: number; onTap: () => void }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  const names = m.dogIds.map((id) => dogs.find((d) => d.id === id)?.name ?? '?');
  return (
    <button type="button" className={`cell ${selected ? 'cell--on' : ''}`} onClick={onTap} aria-pressed={selecting ? selected : undefined}>
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
      {m.purgedAt ? <span className="cell__tag">정리됨</span> : round ? <span className="cell__tag cell__tag--sent">{round}회 보냄</span> : null}
      {selecting && !selected ? <span className="cell__ring" /> : null}
      {selected ? <span className="cell__check">✓</span> : null}
      {names.length > 1 ? <span className="cell__names">{names.length <= 2 ? names.join('·') : `${names[0]} 외 ${names.length - 1}`}</span> : null}
    </button>
  );
}

/** 강아지 고르기 시트. 여러 마리 체크한 뒤 배정. 등원 아이 먼저, 그 아래 나머지. */
function AssignSheet({ dogs, folderDog, count, busy, onPick, onRemove, onClose }: {
  dogs: Dog[]; folderDog: Dog | null; count: number; busy: boolean;
  onPick: (dogs: Dog[]) => void; onRemove: () => void; onClose: () => void;
}) {
  const date = localDate();
  const { data: attended = [] } = useQuery({ queryKey: ['attendance', date], queryFn: () => listAttendedDogIds(date) });
  const [closing, setClosing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const togglePick = (id: string) =>
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
        <span className="sub">여러 마리 체크하면 합사 사진으로 모두에게 들어가요</span>
        {folderDog ? (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onRemove} style={{ color: 'var(--pink)' }}>
            {folderDog.name} 폴더에서 빼기 (미지정으로)
          </button>
        ) : null}
        {ordered.map((d) => {
          const on = picked.has(d.id);
          return (
            <button key={d.id} type="button" className={`card card--row ${on ? 'card--on' : ''}`} style={{ textAlign: 'left', width: '100%' }} aria-pressed={on} disabled={busy} onClick={() => togglePick(d.id)}>
              <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} size={40} />
              <span className="title" style={{ flex: 1 }}>{d.name}</span>
              {attendedSet.has(d.id) ? <span className="badge badge--mint">등원</span> : null}
              <SexBadge sex={d.sex} />
              <span className={`check ${on ? 'check--on' : ''}`}>{on ? '✓' : ''}</span>
            </button>
          );
        })}
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--white)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" className="btn" disabled={busy || picked.size === 0} onClick={() => onPick(ordered.filter((d) => picked.has(d.id)))}>
            {picked.size === 0 ? '강아지를 고르세요' : `${picked.size}마리에게 배정`}
          </button>
          <button type="button" className="btn btn--ghost" onClick={close}>취소</button>
        </div>
      </div>
    </div>
  );
}
