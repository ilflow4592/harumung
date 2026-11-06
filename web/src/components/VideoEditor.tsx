import { useEffect, useRef, useState } from 'react';

import type { MediaItem } from '../db/db';
import { saveEdited } from '../db/repo';
import { makeThumbnail, videoThumbnail } from '../lib/camera';
import { compressVideo, unlockAudio } from '../lib/videoCompress';
import { useObjectUrl } from './ui';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;

/** 영상 편집: 구간 자르기·무음·현재 장면 사진으로 저장. 자르기는 재생 시간만큼 걸린다. */
export function VideoEditor({ item, onClose, onSaved }: { item: MediaItem; onClose: () => void; onSaved: () => void }) {
  const url = useObjectUrl(item.blob);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [mute, setMute] = useState(false);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => { const d = Number.isFinite(v.duration) ? v.duration : (item.durationMs ?? 0) / 1000; setDuration(d); setEnd(d); };
    const onTime = () => { setCurrent(v.currentTime); if (v.currentTime >= end && end > 0 && !v.paused) v.pause(); };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('timeupdate', onTime);
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('timeupdate', onTime); };
  }, [end, item.durationMs]);

  const seek = (t: number) => { const v = videoRef.current; if (v) { v.currentTime = t; setCurrent(t); } };
  const playRange = async () => { const v = videoRef.current; if (!v) return; v.currentTime = start; v.muted = mute; await v.play(); };

  const captureFrame = async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy('장면 저장 중…');
    try {
      v.pause();
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('인코딩 실패'))), 'image/jpeg', 0.9));
      const thumbBlob = await makeThumbnail(blob);
      await saveEdited(item.id, { blob, thumbBlob, mimeType: 'image/jpeg', durationMs: null, kind: 'PHOTO' }, 'copy');
      onSaved();
    } finally { setBusy(null); }
  };

  const trimmed = start > 0.05 || (duration > 0 && end < duration - 0.05);
  const changed = trimmed || mute;

  const save = async (mode: 'replace' | 'copy') => {
    if (!item.blob) return;
    unlockAudio();
    videoRef.current?.pause();
    setBusy('변환 중 0%');
    try {
      const r = await compressVideo(item.blob, {
        maxHeight: 1080, bitrate: 2_500_000, start, end, mute,
        onProgress: (ratio) => setBusy(`변환 중 ${Math.round(ratio * 100)}%`),
      });
      const thumbBlob = await videoThumbnail(r.blob);
      await saveEdited(item.id, { blob: r.blob, thumbBlob, mimeType: r.mimeType, durationMs: r.durationMs }, mode);
      onSaved();
    } finally { setBusy(null); }
  };

  return (
    <div className="editor" role="dialog" aria-label="영상 편집">
      <div className="viewer__top">
        <button type="button" className="cam__round" aria-label="닫기" onClick={onClose}>✕</button>
        <span className="viewer__counter">영상 편집</span>
        <span className="cam__round" style={{ visibility: 'hidden' }} />
      </div>
      <div className="editor__stage">
        {url ? <video ref={videoRef} src={url} playsInline controls={false} className="viewer__media" onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); }} /> : <span className="viewer__empty">원본이 없어요</span>}
      </div>
      <div className="editor__tools">
        <div className="editor__row" style={{ justifyContent: 'space-between' }}>
          <span className="sub" style={{ color: 'rgba(255,255,255,0.7)' }}>현재 {fmt(current)} / {fmt(duration)}</span>
          <span className="sub" style={{ color: 'var(--mint-mid)' }}>구간 {fmt(start)} → {fmt(end)} ({(end - start).toFixed(1)}초)</span>
        </div>
        <label className="editor__slider">
          <span>시작</span>
          <input type="range" min={0} max={duration} step={0.1} value={start} onChange={(e) => { const t = Math.min(Number(e.target.value), end - 0.5); setStart(Math.max(0, t)); seek(t); }} />
          <b>{fmt(start)}</b>
        </label>
        <label className="editor__slider">
          <span>끝</span>
          <input type="range" min={0} max={duration} step={0.1} value={end} onChange={(e) => { const t = Math.max(Number(e.target.value), start + 0.5); setEnd(Math.min(duration, t)); seek(t); }} />
          <b>{fmt(end)}</b>
        </label>
        <div className="editor__row">
          <button type="button" className="btn btn--small btn--ghost editor__tool" onClick={playRange}>▶ 구간 재생</button>
          <button type="button" className={`btn btn--small ${mute ? '' : 'btn--ghost'} editor__tool`} onClick={() => setMute((m) => !m)}>{mute ? '🔇 무음' : '🔊 소리'}</button>
          <button type="button" className="btn btn--small btn--ghost editor__tool" disabled={!!busy} onClick={captureFrame}>📷 이 장면 사진으로</button>
        </div>
        <span className="sub" style={{ color: 'rgba(255,255,255,0.6)' }}>자르기는 영상 길이만큼 걸려요. 화면을 끄지 마세요.</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--outline" style={{ flex: 1, background: 'transparent', color: 'var(--white)', borderColor: 'rgba(255,255,255,0.5)' }} disabled={!!busy || !changed} onClick={() => save('copy')}>복사본으로 저장</button>
          <button type="button" className="btn" style={{ flex: 1 }} disabled={!!busy || !changed} onClick={() => save('replace')}>{busy ?? '덮어쓰기'}</button>
        </div>
      </div>
    </div>
  );
}
