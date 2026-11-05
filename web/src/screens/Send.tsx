import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DogAvatar, SexBadge, TopBar, useObjectUrl } from '../components/ui';
import type { Dog, MediaItem } from '../db/db';
import { listActiveDogs, listContacts, listDogKeptOn, listReviewedDogIds, listSentDogIds, localDate, markSent } from '../db/repo';
import { canShareFiles, downloadFiles, formatBytes, shareFiles, splitBatches, toShareFiles } from '../lib/share';

function dateLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/**
 * 보호자에게 보내기. 검수 완료한 강아지의 오늘 사진·영상을 폰 공유 시트로 넘긴다 (카톡·문자·에어드롭).
 * 서버 없이 동작. 링크 방식은 저장소가 생기면 추가.
 */
export function SendScreen() {
  const navigate = useNavigate();
  const date = localDate();
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const { data: reviewed = [] } = useQuery({ queryKey: ['folder-reviews', date], queryFn: () => listReviewedDogIds(date) });
  const { data: sent = [] } = useQuery({ queryKey: ['send-logs', date], queryFn: () => listSentDogIds(date) });
  const [showSent, setShowSent] = useState(false);

  const reviewedSet = useMemo(() => new Set(reviewed), [reviewed]);
  const sentSet = useMemo(() => new Set(sent), [sent]);
  const ready = dogs.filter((d) => reviewedSet.has(d.id) && !sentSet.has(d.id));
  const done = dogs.filter((d) => sentSet.has(d.id));

  return (
    <div className="screen screen--surface">
      <TopBar title="보호자에게 보내기" onBack={() => navigate(-1)} right={<span className="badge badge--mint">{ready.length}마리</span>} />
      <main className="body" style={{ paddingBottom: 40 }}>
        <span className="sub">{dateLabel(date)} · 검수 완료한 아이만 보여요. 보내기를 누르면 폰 공유 창이 뜨고, 카톡에서 보호자 채팅방을 고르면 돼요.</span>
        {ready.length === 0 ? (
          <div className="card">
            <div className="title">보낼 준비가 된 아이가 없어요</div>
            <div className="sub">오늘 폴더에서 강아지 → 사진 폴더 검수 → 검수 완료를 누르면 여기에 떠요</div>
          </div>
        ) : null}
        {ready.map((d) => <SendRow key={d.id} dog={d} date={date} sent={false} />)}
        {done.length > 0 ? (
          <>
            <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowSent((v) => !v)}>
              {showSent ? '보낸 아이 접기' : `보낸 아이 ${done.length}마리 보기`}
            </button>
            {showSent ? done.map((d) => <SendRow key={d.id} dog={d} date={date} sent />) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function SendRow({ dog, date, sent }: { dog: Dog; date: string; sent: boolean }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ['dog-kept-on', dog.id, date], queryFn: () => listDogKeptOn(dog.id, date) });
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts', dog.id], queryFn: () => listContacts(dog.id) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [doneBatches, setDoneBatches] = useState<Set<number>>(new Set());
  const [compress, setCompress] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [preparing, setPreparing] = useState<string | null>(null);

  // 사진 축소는 미리 해 둔다. 보내기 탭에서 바로 공유 창이 떠야 하므로(공유는 탭 직후에만 허용).
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setFiles([]); return; }
    setPreparing('준비 중…');
    toShareFiles(items, dog.name, date, compress, (d, t) => { if (!cancelled) setPreparing(`${compress ? '압축' : '준비'} 중 ${d}/${t}`); })
      .then((f) => { if (!cancelled) { setFiles(f); setPreparing(null); } });
    return () => { cancelled = true; };
  }, [items, dog.name, date, compress]);

  const batches = useMemo(() => splitBatches(files), [files]);
  const originalBytes = items.reduce((n, m) => n + (m.blob?.size ?? 0), 0);
  const photos = items.filter((m) => m.kind === 'PHOTO').length;
  const videos = items.length - photos;
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const supported = files.length > 0 && canShareFiles(batches[0] ?? []);
  const ready = files.length > 0 && !preparing;

  const finish = async () => {
    await markSent(date, dog.id, items.length);
    await Promise.all([qc.invalidateQueries({ queryKey: ['send-logs'] }), qc.invalidateQueries({ queryKey: ['folders'] })]);
  };

  /** 묶음 하나를 공유. 공유 시트를 끝까지 마치면 기록, 중간에 닫으면 아무것도 안 한다. */
  const send = async (batchIdx: number) => {
    const batch = batches[batchIdx];
    if (!batch || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = `${dog.name} ${dateLabel(date)} 사진 ${photos}장${videos ? ` · 영상 ${videos}개` : ''} 🐶`;
      const r = await shareFiles(batch, `${dog.name} ${dateLabel(date)}`, text);
      if (r === 'shared') {
        const next = new Set(doneBatches).add(batchIdx);
        setDoneBatches(next);
        if (next.size >= batches.length) await finish();
        else setMsg(`${next.size}/${batches.length} 묶음 보냈어요. 다음 묶음을 눌러 주세요`);
      } else if (r === 'cancelled') {
        setMsg('보내기를 취소했어요');
      } else if (r === 'unsupported') {
        downloadFiles(batch);
        setMsg('이 브라우저는 공유를 지원하지 않아 파일로 내려받았어요');
      } else {
        setMsg('공유에 실패했어요. 묶음이 너무 크면 사진을 줄여 다시 시도해 주세요');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: sent ? 0.7 : 1 }}>
      <div className="card--row" style={{ padding: 0 }}>
        <DogAvatar name={dog.name} sex={dog.sex} thumb={dog.thumbBlob} />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="title">{dog.name}</span>
            <SexBadge sex={dog.sex} />
            {sent ? <span className="badge badge--mint">보냄</span> : null}
          </span>
          <span className="sub">
            사진 {photos}장{videos ? ` · 영상 ${videos}개` : ''} · {preparing ?? formatBytes(bytes)}
            {compress && !preparing && originalBytes > bytes ? ` (원본 ${formatBytes(originalBytes)})` : ''}
            {contacts.length ? ` · ${contacts.map((c) => c.phone).join(', ')}` : ' · 연락처 없음'}
          </span>
        </span>
      </div>
      <ShareThumbs items={items} />
      {items.length > 0 ? (
        <label className="sexbox" style={{ height: 40, fontSize: 13, fontWeight: 500 }}>
          <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} />
          사진 압축해서 보내기 (2048px · 빠름, 화면 보기엔 차이 없음)
        </label>
      ) : null}
      {items.length === 0 ? <span className="sub">오늘 저장된 사진이 없어요</span> : null}
      {items.length > 0 && !supported ? <span className="sub" style={{ color: 'var(--pink)' }}>이 브라우저는 파일 공유를 지원하지 않아요. 누르면 파일로 내려받아요.</span> : null}
      {batches.length <= 1 ? (
        <button type="button" className={`btn ${sent ? 'btn--outline' : ''}`} disabled={busy || !ready} onClick={() => send(0)}>
          {preparing ?? (sent ? '다시 보내기' : '보호자에게 보내기')}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="sub">용량이 커서 {batches.length}묶음으로 나눠 보내요</span>
          {batches.map((b, i) => (
            <button key={i} type="button" className={`btn ${doneBatches.has(i) ? 'btn--ghost' : ''}`} disabled={busy || !ready} onClick={() => send(i)}>
              {doneBatches.has(i) ? '✓ ' : ''}{i + 1}묶음 보내기 ({b.length}개)
            </button>
          ))}
        </div>
      )}
      {msg ? <span className="sub">{msg}</span> : null}
    </div>
  );
}

function ShareThumbs({ items }: { items: MediaItem[] }) {
  const shown = items.slice(0, 6);
  if (shown.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {shown.map((m) => <Thumb key={m.id} m={m} />)}
      {items.length > 6 ? <span className="sub" style={{ alignSelf: 'center' }}>+{items.length - 6}</span> : null}
    </div>
  );
}

function Thumb({ m }: { m: MediaItem }) {
  const url = useThumb(m);
  return (
    <span className="cell" style={{ width: 44, height: 44, aspectRatio: 'auto' }}>
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
    </span>
  );
}

function useThumb(m: MediaItem) {
  return useObjectUrl(m.thumbBlob ?? m.blob);
}
