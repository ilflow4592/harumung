import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DateNav, useDateParam } from '../components/DateNav';
import { DogAvatar, SexBadge, TopBar, useObjectUrl } from '../components/ui';
import type { Dog, MediaItem, SendLog } from '../db/db';
import { listActiveDogs, listContacts, listDogKeptOn, listReviewedDogIds, listSendLogs, markSent } from '../db/repo';
import { canShareFiles, downloadFiles, formatBytes, shareFiles, splitBatches, toShareBundle, type PrepareProgress, type ShareEntry } from '../lib/share';
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
const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 보호자에게 보내기. 보내고 싶을 때마다. 그 아이의 "아직 안 보낸" 사진·영상만 묶어 폰 공유 시트로 넘기고,
 * 발송 1건마다 회차·시각·보낸 사진을 기록한다. 검수 완료는 표시일 뿐 조건이 아니다.
 */
export function SendScreen() {
  const navigate = useNavigate();
  const [date, setDate] = useDateParam();
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const { data: reviewed = [] } = useQuery({ queryKey: ['folder-reviews', date], queryFn: () => listReviewedDogIds(date) });
  const { data: logs = [] } = useQuery({ queryKey: ['send-logs', date], queryFn: () => listSendLogs(date) });
  const [compressPhoto, setCompressPhoto] = useState(() => readFlag(PHOTO_KEY, true));
  const [compressVideo, setCompressVideo] = useState(() => readFlag(VIDEO_KEY, false));
  const [showDone, setShowDone] = useState(false);
  // 카드별 미발송 수. 카드가 계산해 올려 준다 → 목록 분류와 상단 숫자
  const [unsentBy, setUnsentBy] = useState<Record<string, number>>({});

  const reviewedSet = useMemo(() => new Set(reviewed), [reviewed]);
  const sentDogIds = useMemo(() => new Set(logs.map((l) => l.dogId)), [logs]);
  // 보낼 게 있거나 보낸 적 있는 아이만. 미발송 있는 아이 먼저, 그 안에선 검수 완료 먼저.
  const candidates = dogs.filter((d) => (unsentBy[d.id] ?? 1) > 0 || sentDogIds.has(d.id));
  const pending = candidates.filter((d) => (unsentBy[d.id] ?? 1) > 0).sort((a, b) => Number(reviewedSet.has(b.id)) - Number(reviewedSet.has(a.id)));
  const done = candidates.filter((d) => (unsentBy[d.id] ?? 1) === 0);

  const togglePhoto = () => setCompressPhoto((v) => { writeFlag(PHOTO_KEY, !v); return !v; });
  const toggleVideo = () => {
    unlockAudio();
    setCompressVideo((v) => { writeFlag(VIDEO_KEY, !v); return !v; });
  };
  const report = (dogId: string, n: number) => setUnsentBy((prev) => (prev[dogId] === n ? prev : { ...prev, [dogId]: n }));

  return (
    <div className="screen screen--surface">
      <TopBar title="보호자에게 보내기" onBack={() => navigate(-1)} right={<span className="badge badge--mint">{pending.length}마리</span>} />
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
        <DateNav date={date} onChange={setDate} compact />
        <span className="sub">보내고 싶을 때 언제든. 아직 안 보낸 사진만 묶어서 보내고, 보낸 기록이 회차별로 남아요.</span>
        {/* 모든 후보 카드를 항상 마운트해 미발송 수를 계산하되, 분류에 따라 보이는 곳이 다르다 */}
        {dogs.map((d) => {
          const n = unsentBy[d.id];
          const isPending = (n ?? 1) > 0;
          const visible = isPending ? pending.includes(d) : showDone && done.includes(d);
          return (
            <SendCard
              key={d.id}
              dog={d}
              date={date}
              reviewed={reviewedSet.has(d.id)}
              logs={logs.filter((l) => l.dogId === d.id)}
              compressPhoto={compressPhoto}
              compressVideo={compressVideo}
              onUnsent={(k) => report(d.id, k)}
              hidden={!visible}
            />
          );
        })}
        {pending.length === 0 ? (
          <div className="card">
            <div className="title">보낼 사진이 없어요</div>
            <div className="sub">{dateLabel(date)}에 찍어 저장한 사진이 모두 보내졌거나, 아직 저장된 사진이 없어요</div>
          </div>
        ) : null}
        {done.length > 0 ? (
          <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDone((v) => !v)}>
            {showDone ? '다 보낸 아이 접기' : `다 보낸 아이 ${done.length}마리 보기`}
          </button>
        ) : null}
      </main>
    </div>
  );
}

function SendCard({ dog, date, reviewed, logs, compressPhoto, compressVideo, onUnsent, hidden }: {
  dog: Dog; date: string; reviewed: boolean; logs: SendLog[]; compressPhoto: boolean; compressVideo: boolean;
  onUnsent: (n: number) => void; hidden: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: items = [] } = useQuery({ queryKey: ['dog-kept-on', dog.id, date], queryFn: () => listDogKeptOn(dog.id, date) });
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts', dog.id], queryFn: () => listContacts(dog.id) });
  const [includeSent, setIncludeSent] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [doneBatches, setDoneBatches] = useState<Set<number>>(new Set());
  const [entries, setEntries] = useState<ShareEntry[]>([]);
  const [progress, setProgress] = useState<PrepareProgress | null>(null);

  const sentIds = useMemo(() => new Set(logs.flatMap((l) => l.mediaIds)), [logs]);
  const unsent = useMemo(() => items.filter((m) => !sentIds.has(m.id) && m.blob), [items, sentIds]);
  const target = includeSent ? items.filter((m) => m.blob) : unsent;
  useEffect(() => { onUnsent(unsent.length); }, [unsent.length, onUnsent]);

  useEffect(() => {
    let cancelled = false;
    setDoneBatches(new Set());
    if (target.length === 0) { setEntries([]); setProgress(null); return; }
    setEntries([]);
    setProgress({ done: 0, total: target.length, stage: 'photo' });
    toShareBundle(target, dog.name, date, compressPhoto, compressVideo, (p) => { if (!cancelled) setProgress(p); })
      .then((e) => { if (!cancelled) { setEntries(e); setProgress(null); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sentIds, includeSent, dog.name, date, compressPhoto, compressVideo]);

  const batches = useMemo(() => splitBatches(entries), [entries]);
  const bytes = entries.reduce((n, e) => n + e.file.size, 0);
  const ready = entries.length > 0 && !progress;
  const supported = ready && canShareFiles(batches[0].map((e) => e.file));
  const photos = target.filter((m) => m.kind === 'PHOTO');
  const videos = target.filter((m) => m.kind === 'VIDEO');
  const preparing = progress
    ? progress.stage === 'video'
      ? `영상 변환 중 ${Math.round((progress.ratio ?? 0) * 100)}% (${progress.done + 1}/${progress.total})`
      : `사진 압축 중 ${progress.done}/${progress.total}`
    : null;

  /** 묶음 하나를 공유. 끝까지 마치면 그 묶음을 발송 1건으로 기록. */
  const send = async (batchIdx: number) => {
    const batch = batches[batchIdx];
    if (!batch || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = logs.length + doneBatches.size + 1;
      const text = `${dog.name} ${dateLabel(date)} 사진 ${batch.filter((e) => e.item.kind === 'PHOTO').length}장${batch.some((e) => e.item.kind === 'VIDEO') ? ` · 영상 ${batch.filter((e) => e.item.kind === 'VIDEO').length}개` : ''} 🐶`;
      const r = await shareFiles(batch.map((e) => e.file), `${dog.name} ${dateLabel(date)} (${n}번째)`, text);
      if (r === 'shared') {
        await markSent(date, dog.id, batch.map((e) => e.item));
        await Promise.all([qc.invalidateQueries({ queryKey: ['send-logs'] }), qc.invalidateQueries({ queryKey: ['folders'] })]);
        const next = new Set(doneBatches).add(batchIdx);
        setDoneBatches(next);
        setMsg(next.size >= batches.length ? `${n}번째 발송 완료` : `${next.size}/${batches.length} 묶음 보냈어요. 다음 묶음을 눌러 주세요`);
        setIncludeSent(false);
      } else if (r === 'cancelled') {
        setMsg('보내기를 취소했어요');
      } else if (r === 'unsupported') {
        downloadFiles(batch.map((e) => e.file));
        setMsg('이 브라우저는 공유를 지원하지 않아 파일로 내려받았어요');
      } else {
        setMsg('공유에 실패했어요. 묶음이 너무 크면 사진을 줄여 다시 시도해 주세요');
      }
    } finally {
      setBusy(false);
    }
  };

  const openFolder = () => navigate(`/folders/${dog.id}?d=${date}`);
  if (hidden) return null;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button type="button" className="card--row" style={{ padding: 0, border: 0, background: 'transparent', textAlign: 'left', width: '100%' }} onClick={openFolder}>
        <DogAvatar name={dog.name} sex={dog.sex} thumb={dog.thumbBlob} />
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className="title">{dog.name}</span>
            <SexBadge sex={dog.sex} />
            {logs.length > 0 ? <span className="badge badge--mint">{logs.length}회 보냄</span> : null}
            {!reviewed && items.length > 0 ? <span className="badge badge--gray">검수 전</span> : null}
          </span>
          <span className="sub">
            {unsent.length > 0 ? `미발송 ${unsent.length}개` : '모두 보냄'} · 오늘 전체 {items.length}개
            {contacts.length ? ` · ${contacts.map((c) => c.phone).join(', ')}` : ''}
          </span>
        </span>
        <span className="sub">폴더 ›</span>
      </button>

      {logs.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" className="btn btn--small btn--ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? '발송 이력 접기' : `발송 이력 보기 (${logs.map((l) => timeLabel(l.sentAt)).join(', ')})`}
          </button>
          {showHistory ? logs.map((l, i) => <HistoryRow key={l.id} n={i + 1} log={l} items={items} />) : null}
        </div>
      ) : null}

      {photos.length > 0 ? <MediaLine label="사진" count={photos.length} unit="장" items={photos} onOpen={openFolder} /> : null}
      {videos.length > 0 ? <MediaLine label="영상" count={videos.length} unit="개" items={videos} onOpen={openFolder} /> : null}
      {target.length === 0 && items.length > 0 ? <span className="sub">오늘 사진은 모두 보냈어요</span> : null}
      {items.length === 0 ? <span className="sub">저장된 사진이 없어요</span> : null}
      {items.length > 0 && items.some((m) => !m.blob) ? <span className="sub" style={{ color: 'var(--pink)' }}>원본이 정리된 사진은 보낼 수 없어요</span> : null}
      {ready && !supported ? <span className="sub" style={{ color: 'var(--pink)' }}>이 브라우저는 파일 공유를 지원하지 않아요. 누르면 파일로 내려받아요.</span> : null}

      {logs.length > 0 && items.some((m) => m.blob) ? (
        <label className="sexbox" style={{ height: 40, fontSize: 13, fontWeight: 500 }}>
          <input type="checkbox" checked={includeSent} onChange={(e) => setIncludeSent(e.target.checked)} />
          이미 보낸 사진도 포함해서 보내기
        </label>
      ) : null}

      {target.length === 0 ? null : batches.length <= 1 ? (
        <button type="button" className="btn" disabled={busy || !ready} onClick={() => send(0)}>
          {preparing ?? `보호자에게 보내기 (${target.length}개 · ${formatBytes(bytes)})`}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="sub">용량이 커서 {batches.length}묶음으로 나눠 보내요. 묶음마다 발송 1회로 기록돼요</span>
          {batches.map((b, i) => (
            <button key={i} type="button" className={`btn ${doneBatches.has(i) ? 'btn--ghost' : ''}`} disabled={busy || !ready || doneBatches.has(i)} onClick={() => send(i)}>
              {doneBatches.has(i) ? '✓ ' : ''}{i + 1}묶음 보내기 ({b.length}개 · {formatBytes(b.reduce((n, e) => n + e.file.size, 0))})
            </button>
          ))}
        </div>
      )}
      {msg ? <span className="sub">{msg}</span> : null}
    </div>
  );
}

/** 발송 1건: 회차·시각·개수와 그때 보낸 썸네일. */
function HistoryRow({ n, log, items }: { n: number; log: SendLog; items: MediaItem[] }) {
  const sent = log.mediaIds.map((id) => items.find((m) => m.id === id)).filter((m): m is MediaItem => !!m);
  return (
    <div className="history">
      <div className="history__head">
        <span className="badge badge--mint">{n}번째</span>
        <b>{timeLabel(log.sentAt)}</b>
        <span className="sub">사진 {log.photoCount}장{log.videoCount ? ` · 영상 ${log.videoCount}개` : ''}</span>
      </div>
      {sent.length > 0 ? (
        <div className="thumbrow">{sent.map((m) => <Thumb key={m.id} m={m} />)}</div>
      ) : <span className="sub">보낸 사진이 폴더에서 지워졌거나 기록이 없어요</span>}
    </div>
  );
}

function MediaLine({ label, count, unit, items, onOpen }: { label: string; count: number; unit: string; items: MediaItem[]; onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="sub"><b style={{ color: 'var(--text)' }}>{label} {count}{unit}</b></span>
      <div className="thumbrow">{items.map((m) => <Thumb key={m.id} m={m} onOpen={onOpen} />)}</div>
    </div>
  );
}

function Thumb({ m, onOpen }: { m: MediaItem; onOpen?: () => void }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  return (
    <button type="button" className="cell thumbrow__cell" onClick={onOpen} aria-label="폴더 열기" disabled={!onOpen}>
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
    </button>
  );
}
