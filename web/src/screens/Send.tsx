import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DogAvatar, SexBadge, TopBar, useObjectUrl } from '../components/ui';
import type { Dog, MediaItem } from '../db/db';
import { listActiveDogs, listContacts, listDogKeptOn, listReviewedDogIds, listSentDogIds, localDate, markSent } from '../db/repo';
import { canShareFiles, downloadFiles, formatBytes, getPreparedFiles, prepareKey, shareFiles, splitBatches, toShareFiles, type PrepareProgress } from '../lib/share';
import { unlockAudio } from '../lib/videoCompress';

const PHOTO_KEY = 'harumung.send.compressPhoto';
const VIDEO_KEY = 'harumung.send.compressVideo';
function readFlag(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
}
function writeFlag(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* 저장 못 해도 동작엔 지장 없음 */ }
}

function dateLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}월 ${Number(d)}일`;
}

/**
 * 보호자에게 보내기. 검수 완료한 강아지의 오늘 사진·영상을 폰 공유 시트로 넘긴다 (카톡·문자·에어드롭).
 * 압축 설정은 상단에 고정, 모든 강아지에 공통 적용.
 */
export function SendScreen() {
  const navigate = useNavigate();
  const date = localDate();
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const { data: reviewed = [] } = useQuery({ queryKey: ['folder-reviews', date], queryFn: () => listReviewedDogIds(date) });
  const { data: sent = [] } = useQuery({ queryKey: ['send-logs', date], queryFn: () => listSentDogIds(date) });
  const [showSent, setShowSent] = useState(false);
  const [compressPhoto, setCompressPhoto] = useState(() => readFlag(PHOTO_KEY, true));
  const [compressVideo, setCompressVideo] = useState(() => readFlag(VIDEO_KEY, false));

  const reviewedSet = useMemo(() => new Set(reviewed), [reviewed]);
  const sentSet = useMemo(() => new Set(sent), [sent]);
  const ready = dogs.filter((d) => reviewedSet.has(d.id) && !sentSet.has(d.id));
  const done = dogs.filter((d) => sentSet.has(d.id));

  const togglePhoto = () => setCompressPhoto((v) => { writeFlag(PHOTO_KEY, !v); return !v; });
  const toggleVideo = () => {
    unlockAudio(); // iOS: 사용자 탭 안에서 오디오 컨텍스트 준비
    setCompressVideo((v) => { writeFlag(VIDEO_KEY, !v); return !v; });
  };

  return (
    <div className="screen screen--surface">
      <TopBar title="보호자에게 보내기" onBack={() => navigate(-1)} right={<span className="badge badge--mint">{ready.length}마리</span>} />
      <div className="send-opts">
        <button type="button" className={`opt ${compressPhoto ? 'opt--on' : ''}`} aria-pressed={compressPhoto} onClick={togglePhoto}>
          <span className={`check check--sm ${compressPhoto ? 'check--on' : ''}`}>{compressPhoto ? '✓' : ''}</span>
          <span><b>사진 압축</b><small>2048px · 빠름</small></span>
        </button>
        <button type="button" className={`opt ${compressVideo ? 'opt--on' : ''}`} aria-pressed={compressVideo} onClick={toggleVideo}>
          <span className={`check check--sm ${compressVideo ? 'check--on' : ''}`}>{compressVideo ? '✓' : ''}</span>
          <span><b>영상 압축</b><small>720p · 영상 길이만큼 걸림</small></span>
        </button>
      </div>
      <main className="body" style={{ paddingBottom: 40 }}>
        <span className="sub">{dateLabel(date)} · 검수 완료한 아이만 보여요. 보내기를 누르면 폰 공유 창이 뜨고, 카톡에서 보호자 채팅방을 고르면 돼요.</span>
        {ready.length === 0 ? (
          <div className="card">
            <div className="title">보낼 준비가 된 아이가 없어요</div>
            <div className="sub">오늘 폴더에서 강아지 → 사진 폴더 검수 → 검수 완료를 누르면 여기에 떠요</div>
          </div>
        ) : null}
        {ready.map((d) => <SendRow key={d.id} dog={d} date={date} sent={false} compressPhoto={compressPhoto} compressVideo={compressVideo} />)}
        {done.length > 0 ? (
          <>
            <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowSent((v) => !v)}>
              {showSent ? '보낸 아이 접기' : `보낸 아이 ${done.length}마리 보기`}
            </button>
            {showSent ? done.map((d) => <SendRow key={d.id} dog={d} date={date} sent compressPhoto={compressPhoto} compressVideo={compressVideo} />) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function SendRow({ dog, date, sent, compressPhoto, compressVideo }: { dog: Dog; date: string; sent: boolean; compressPhoto: boolean; compressVideo: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: items = [] } = useQuery({ queryKey: ['dog-kept-on', dog.id, date], queryFn: () => listDogKeptOn(dog.id, date) });
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts', dog.id], queryFn: () => listContacts(dog.id) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [doneBatches, setDoneBatches] = useState<Set<number>>(new Set());
  // 이미 준비된 묶음이 있으면 로딩 없이 바로 쓴다.
  const key = prepareKey(items, dog.name, date, compressPhoto, compressVideo);
  const [files, setFiles] = useState<File[]>(() => getPreparedFiles(key) ?? []);
  const [progress, setProgress] = useState<PrepareProgress | null>(null);

  const photos = useMemo(() => items.filter((m) => m.kind === 'PHOTO'), [items]);
  const videos = useMemo(() => items.filter((m) => m.kind === 'VIDEO'), [items]);

  // 변환은 미리. 보내기 탭에서 바로 공유 창이 떠야 하므로(공유는 탭 직후에만 허용).
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) { setFiles([]); setProgress(null); return; }
    const hit = getPreparedFiles(key);
    if (hit) { setFiles(hit); setProgress(null); return; }
    setFiles([]);
    setProgress({ done: 0, total: items.length, stage: 'photo' });
    toShareFiles(items, dog.name, date, compressPhoto, compressVideo, (p) => { if (!cancelled) setProgress(p); })
      .then((f) => { if (!cancelled) { setFiles(f); setProgress(null); } });
    return () => { cancelled = true; };
  }, [items, dog.name, date, compressPhoto, compressVideo, key]);

  const batches = useMemo(() => splitBatches(files), [files]);
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const originalBytes = items.reduce((n, m) => n + (m.blob?.size ?? 0), 0);
  const photoBytes = files.filter((f) => f.type.startsWith('image/')).reduce((n, f) => n + f.size, 0);
  const videoBytes = bytes - photoBytes;
  const supported = files.length > 0 && canShareFiles(batches[0] ?? []);
  const ready = files.length > 0 && !progress;
  const preparing = progress
    ? progress.stage === 'video'
      ? `영상 변환 중 ${Math.round((progress.ratio ?? 0) * 100)}% (${progress.done + 1}/${progress.total})`
      : `사진 압축 중 ${progress.done}/${progress.total}`
    : null;

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
      const text = `${dog.name} ${dateLabel(date)} 사진 ${photos.length}장${videos.length ? ` · 영상 ${videos.length}개` : ''} 🐶`;
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

  const openFolder = () => navigate(`/folders/${dog.id}`);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: sent ? 0.7 : 1 }}>
      <button type="button" className="card--row" style={{ padding: 0, border: 0, background: 'transparent', textAlign: 'left', width: '100%' }} onClick={openFolder}>
        <DogAvatar name={dog.name} sex={dog.sex} thumb={dog.thumbBlob} />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="title">{dog.name}</span>
            <SexBadge sex={dog.sex} />
            {sent ? <span className="badge badge--mint">보냄</span> : null}
          </span>
          <span className="sub">
            {preparing ?? `총 ${formatBytes(bytes)}`}
            {!preparing && originalBytes > bytes ? ` (원본 ${formatBytes(originalBytes)})` : ''}
            {contacts.length ? ` · ${contacts.map((c) => c.phone).join(', ')}` : ' · 연락처 없음'}
          </span>
        </span>
        <span className="sub">폴더 ›</span>
      </button>

      {photos.length > 0 ? (
        <MediaLine label="사진" count={photos.length} unit="장" bytes={progress ? null : photoBytes} items={photos} onOpen={openFolder} />
      ) : null}
      {videos.length > 0 ? (
        <MediaLine label="영상" count={videos.length} unit="개" bytes={progress ? null : videoBytes} items={videos} onOpen={openFolder} />
      ) : null}
      {items.length === 0 ? <span className="sub">오늘 저장된 사진이 없어요</span> : null}
      {items.length > 0 && items.every((m) => !m.blob) ? <span className="sub" style={{ color: 'var(--pink)' }}>원본이 정리돼 다시 보낼 수 없어요</span> : null}
      {items.length > 0 && !supported && ready ? <span className="sub" style={{ color: 'var(--pink)' }}>이 브라우저는 파일 공유를 지원하지 않아요. 누르면 파일로 내려받아요.</span> : null}

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

/** 사진 줄 / 영상 줄. 썸네일을 누르면 그 강아지 폴더로. */
function MediaLine({ label, count, unit, bytes, items, onOpen }: { label: string; count: number; unit: string; bytes: number | null; items: MediaItem[]; onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="sub"><b style={{ color: 'var(--text)' }}>{label} {count}{unit}</b>{bytes !== null ? ` · ${formatBytes(bytes)}` : ''}</span>
      <div className="thumbrow">
        {items.map((m) => <Thumb key={m.id} m={m} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function Thumb({ m, onOpen }: { m: MediaItem; onOpen: () => void }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  return (
    <button type="button" className="cell thumbrow__cell" onClick={onOpen} aria-label="폴더 열기">
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
    </button>
  );
}
