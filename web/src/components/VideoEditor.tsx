import { useEffect, useRef, useState } from 'react';

import type { MediaItem } from '../db/db';
import { saveEdited } from '../db/repo';
import { track } from '../lib/analytics';
import { makeThumbnail, videoThumbnail } from '../lib/camera';
import { compressVideo, unlockAudio } from '../lib/videoCompress';
import { useObjectUrl } from './ui';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;

/** 영상 편집: 구간 자르기·무음·현재 장면 사진으로 저장. 자르기는 재생 시간만큼 걸린다. */
export function VideoEditor({ item, onClose, onSaved }: { item: MediaItem; onClose: () => void; onSaved: () => void }) {
  const url = useObjectUrl(item.blob);
  const videoRef = useRef<HTMLVideoElement>(null);
  // 길이는 저장된 durationMs로 먼저 채운다. iOS는 재생 전엔 메타데이터를 늦게 주거나 duration을 Infinity로 준다.
  const knownSec = item.durationMs && item.durationMs > 0 ? item.durationMs / 1000 : 0;
  const [duration, setDuration] = useState(knownSec);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(knownSec);
  const [mute, setMute] = useState(false);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef(end);
  endRef.current = end;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    const applyDuration = (d: number) => {
      if (!Number.isFinite(d) || d <= 0) return;
      setDuration(d);
      setEnd((prev) => (prev === 0 || prev > d ? d : prev));
    };
    const onMeta = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) { applyDuration(v.duration); return; }
      // MediaRecorder 결과는 duration이 Infinity인 경우가 있다. 끝으로 탐색해 실제 길이를 알아낸다.
      const back = () => { applyDuration(v.duration); v.currentTime = 0; v.removeEventListener('timeupdate', back); };
      v.addEventListener('timeupdate', back);
      v.currentTime = 1e101;
    };
    const onTime = () => { setCurrent(v.currentTime); const e = endRef.current; if (e > 0 && v.currentTime >= e && !v.paused) v.pause(); };
    const onErr = () => setErr('영상을 불러오지 못했어요. 원본이 정리됐거나 이 폰에서 재생할 수 없는 형식이에요.');
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', () => applyDuration(v.duration));
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('error', onErr);
    if (v.readyState >= 1) onMeta();
    else v.load();
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('timeupdate', onTime); v.removeEventListener('error', onErr); };
  }, [url]);

  const seek = (t: number) => { const v = videoRef.current; if (v) { v.currentTime = t; setCurrent(t); } };
  const playRange = async () => {
    const v = videoRef.current; if (!v) return;
    try { v.currentTime = start; v.muted = mute; await v.play(); setErr(null); }
    catch (e) { setErr(`재생이 막혔어요 (${(e as { name?: string })?.name ?? 'Error'}). 화면을 한 번 탭한 뒤 다시 눌러 주세요.`); }
  };

  /** iOS는 한 번도 재생하지 않은 영상에서 프레임을 못 읽는다. 필요하면 잠깐 재생했다 멈춘다. */
  const ensureFrame = async (v: HTMLVideoElement) => {
    if (v.readyState >= 2 && v.videoWidth > 0) return;
    await v.play();
    await new Promise<void>((r) => { const done = () => { v.removeEventListener('timeupdate', done); r(); }; v.addEventListener('timeupdate', done); window.setTimeout(done, 700); });
    v.pause();
  };

  const captureFrame = async () => {
    const v = videoRef.current;
    if (!v) return;
    setBusy('장면 저장 중…');
    setErr(null);
    try {
      await ensureFrame(v);
      v.pause();
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      if (canvas.width === 0) throw new Error('프레임을 읽지 못했어요. 구간 재생을 한 번 누른 뒤 다시 시도해 주세요.');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(v, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('인코딩 실패'))), 'image/jpeg', 0.9));
      const thumbBlob = await makeThumbnail(blob);
      await saveEdited(item.id, { blob, thumbBlob, mimeType: 'image/jpeg', durationMs: null, kind: 'PHOTO' }, 'copy');
      track('video_frame_captured', { at_sec: Math.round(v.currentTime * 10) / 10 });
      onSaved();
    } catch (e) {
      setErr((e as { message?: string })?.message ?? '장면 저장에 실패했어요');
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
      track('video_edit_saved', { mode, trimmed, mute, duration_ms: r.durationMs, original_ms: Math.round(duration * 1000), bytes: r.blob.size });
      onSaved();
    } catch (e) {
      setErr(`변환에 실패했어요 (${(e as { message?: string })?.message ?? 'Error'})`);
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
        {url ? <video ref={videoRef} src={url} playsInline preload="metadata" controls={false} className="viewer__media" onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) v.play().catch(() => undefined); else v.pause(); }} /> : <span className="viewer__empty">원본이 없어요</span>}
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
        {err ? <span className="sub" style={{ color: '#FCA5A5', fontWeight: 700 }}>{err}</span> : null}
        {duration === 0 ? <span className="sub" style={{ color: '#FCA5A5' }}>영상 길이를 아직 못 읽었어요. 구간 재생을 한 번 눌러 주세요.</span> : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--outline" style={{ flex: 1, background: 'transparent', color: 'var(--white)', borderColor: 'rgba(255,255,255,0.5)' }} disabled={!!busy || !changed} onClick={() => save('copy')}>복사본으로 저장</button>
          <button type="button" className="btn" style={{ flex: 1 }} disabled={!!busy || !changed} onClick={() => save('replace')}>{busy ?? '덮어쓰기'}</button>
        </div>
      </div>
    </div>
  );
}
