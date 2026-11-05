import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DogAvatar, useObjectUrl } from '../components/ui';
import type { MediaItem } from '../db/db';
import { getOrCreateOpenSession, insertCapturedMedia, listActiveDogs, listSessionMedia, markSessionReviewing } from '../db/repo';
import { cameraErrorMessage, capturePhoto, makeThumbnail, openCamera, openMic, startRecording, stopStream, videoDurationMs, videoThumbnail, type RecordingHandle } from '../lib/camera';
import { shutterFeedback } from '../lib/feedback';
import { useCaptureStore } from '../store/capture';

export function CameraScreen() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const [noMic, setNoMic] = useState(false);
  const recRef = useRef<RecordingHandle | null>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0); // 바뀔 때마다 흰 플래시 1회
  const [saved, setSaved] = useState<string | null>(null); // "저장됨" 토스트
  const savedTimer = useRef<number | undefined>(undefined);
  const showSaved = useCallback((text: string) => {
    setSaved(text);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(null), 1200);
  }, []);

  const { sessionId, mode, selectedDogIds, shotCount, setSession, setMode, selectDog, toggleMultiDog, bumpShotCount } = useCaptureStore();
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const qc = useQueryClient();
  const { data: sessionMedia = [] } = useQuery({
    queryKey: ['session-media', sessionId],
    queryFn: () => (sessionId ? listSessionMedia(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });
  // 촬영·가져오기 뒤 호출. 아래 사진 줄을 갱신한다.
  const refreshStrip = useCallback(() => qc.invalidateQueries({ queryKey: ['session-media', sessionId] }), [qc, sessionId]);

  // 지금 선택된 강아지(단일)의 이번 세션 사진. 미지정 모드면 미지정 사진. 다중 선택이면 첫 강아지 기준.
  const stripMedia = useMemo(() => {
    const key = selectedDogIds[0] ?? null;
    return sessionMedia.filter((m) => (key ? m.dogIds.includes(key) : m.dogIds.length === 0));
  }, [sessionMedia, selectedDogIds]);

  // 카메라 스트림은 화면 진입 시 한 번만 연다. 사진/영상 전환으로는 다시 열지 않는다(iOS에서 재오픈이 실패하던 원인).
  // 화면 복귀(visibilitychange) 시 멈춘 트랙이 있으면 다시 연다.
  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      stopStream(streamRef.current);
      try {
        const s = await openCamera();
        if (cancelled) { stopStream(s); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
        setReady(true);
        setError(null);
      } catch (e) {
        setError(cameraErrorMessage(e));
      }
    };
    open();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const alive = streamRef.current?.getVideoTracks().some((t) => t.readyState === 'live');
      if (!alive) open();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      stopStream(streamRef.current);
      streamRef.current = null;
      stopStream(micRef.current);
      micRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!sessionId) getOrCreateOpenSession().then(setSession);
  }, [sessionId, setSession]);

  const selectedDogs = dogs.filter((d) => selectedDogIds.includes(d.id));
  const nameLabel = selectedDogs.length === 0 ? '미지정' : selectedDogs.map((d) => d.name).join(' · ');

  const takePhoto = useCallback(async () => {
    if (!sessionId || busy || !videoRef.current) return;
    setBusy(true);
    // 셔터 효과는 저장 전에 즉시. 사용자가 "찍혔다"를 바로 느끼게 한다.
    setFlash((n) => n + 1);
    shutterFeedback();
    try {
      const blob = await capturePhoto(videoRef.current);
      const thumbBlob = await makeThumbnail(blob);
      await insertCapturedMedia({ sessionId, kind: 'PHOTO', blob, thumbBlob, mimeType: 'image/jpeg', durationMs: null, dogIds: selectedDogIds });
      bumpShotCount();
      refreshStrip();
      showSaved(`${nameLabel} · ${stripMedia.length + 1}장째 저장됨`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, selectedDogIds, bumpShotCount, refreshStrip, showSaved, nameLabel, stripMedia.length]);

  const toggleRecording = useCallback(async () => {
    if (!sessionId || !streamRef.current) return;
    if (recording) { recRef.current?.stop(); return; }
    const dogIdsAtStart = [...selectedDogIds]; // 녹화 시작 시점의 지정 강아지로 고정
    // 마이크는 첫 녹화 때 한 번만 요청. 거부되면 무음으로 녹화하고 안내만 띄운다.
    if (!micRef.current) {
      micRef.current = await openMic();
      setNoMic(!micRef.current);
    }
    const camera = streamRef.current;
    if (!camera) return;
    let handle: RecordingHandle;
    try {
      handle = startRecording(camera, micRef.current);
    } catch (e) {
      setError(`녹화를 시작하지 못했어요. (${String(e)})`);
      return;
    }
    recRef.current = handle;
    setRecording(true);
    handle.done
      .then(async ({ blob, mimeType, durationMs }) => {
        setBusy(true);
        const thumbBlob = await videoThumbnail(blob);
        await insertCapturedMedia({ sessionId, kind: 'VIDEO', blob, thumbBlob, mimeType, durationMs, dogIds: dogIdsAtStart });
        bumpShotCount();
        refreshStrip();
        showSaved(`영상 ${Math.round(durationMs / 1000)}초 저장됨`);
      })
      .catch((e) => setError(String(e)))
      .finally(() => { setRecording(false); setBusy(false); recRef.current = null; });
  }, [recording, sessionId, selectedDogIds, bumpShotCount, refreshStrip, showSaved]);

  /** 앨범에서 가져온 사진·영상을 현재 지정 강아지로 세션에 넣는다. 여러 장 가능. */
  const importFromAlbum = useCallback(
    async (files: FileList | null) => {
      if (!sessionId || !files || files.length === 0) return;
      const dogIds = [...selectedDogIds];
      setBusy(true);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setImporting(`${i + 1}/${files.length} 가져오는 중`);
          if (file.type.startsWith('video/')) {
            const [thumbBlob, durationMs] = await Promise.all([videoThumbnail(file), videoDurationMs(file)]);
            await insertCapturedMedia({ sessionId, kind: 'VIDEO', blob: file, thumbBlob, mimeType: file.type, durationMs, dogIds });
          } else if (file.type.startsWith('image/')) {
            const thumbBlob = await makeThumbnail(file);
            await insertCapturedMedia({ sessionId, kind: 'PHOTO', blob: file, thumbBlob, mimeType: file.type || 'image/jpeg', durationMs: null, dogIds });
          } else {
            continue;
          }
          bumpShotCount();
        }
        refreshStrip();
        showSaved(`${files.length}개 가져옴`);
      } finally {
        setImporting(null);
        setBusy(false);
        if (albumInput.current) albumInput.current.value = '';
      }
    },
    [sessionId, selectedDogIds, bumpShotCount, refreshStrip, showSaved],
  );

  const close = useCallback(async () => {
    recRef.current?.stop();
    if (sessionId && shotCount > 0) {
      await markSessionReviewing(sessionId);
      navigate('/session-review', { replace: true });
    } else {
      navigate(-1);
    }
  }, [sessionId, shotCount, navigate]);

  return (
    <div className="cam">
      <video ref={videoRef} className="preview" playsInline muted autoPlay />
      {flash > 0 ? <div key={flash} className="cam__flash" /> : null}
      {error ? <div className="cam__center">{error}</div> : null}
      {!ready && !error ? <div className="cam__center">카메라 여는 중…</div> : null}

      <div className="cam__top">
        <button type="button" className="cam__round" aria-label="촬영 마치고 검수" onClick={close}>✕</button>
        <div key={shotCount} className={`cam__pill ${shotCount > 0 ? 'cam__pill--bump' : ''}`}>오늘 {shotCount}장</div>
        <div className="cam__seg" role="tablist" aria-label="촬영 모드">
          <button type="button" role="tab" aria-selected={mode === 'photo'} className={mode === 'photo' ? 'on' : ''} disabled={recording} onClick={() => setMode('photo')}>사진</button>
          <button type="button" role="tab" aria-selected={mode === 'video'} className={mode === 'video' ? 'on' : ''} disabled={recording} onClick={() => setMode('video')}>영상</button>
        </div>
      </div>

      <div className="cam__name">
        <b>{nameLabel}</b>
        <span className="sub">{selectedDogs.length ? `지금 찍는 ${mode === 'photo' ? '사진' : '영상'}은 ${nameLabel} 폴더로 저장돼요` : '폴더 검수에서 나중에 정해요'}</span>
      </div>

      <div className="cam__bottom">
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', fontSize: 12 }}>
          <b>오늘 등원 {dogs.length}마리</b>
          <span style={{ color: '#D1D5DB' }}>길게 누르면 여러 마리 선택</span>
        </div>
        <div className="cam__strip">
          {dogs.map((d) => {
            const selected = selectedDogIds.includes(d.id);
            let timer: number | undefined;
            return (
              <button
                key={d.id}
                type="button"
                className="cam__dog"
                disabled={recording}
                onClick={() => selectDog(d.id)}
                onContextMenu={(e) => { e.preventDefault(); toggleMultiDog(d.id); }}
                onTouchStart={() => { timer = window.setTimeout(() => toggleMultiDog(d.id), 500); }}
                onTouchEnd={() => window.clearTimeout(timer)}
                onTouchMove={() => window.clearTimeout(timer)}
              >
                <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} size={60} selected={selected} />
                <span style={{ fontWeight: selected ? 700 : 500 }}>{d.name}</span>
              </button>
            );
          })}
        </div>
        <ShotStrip items={stripMedia} label={selectedDogs[0]?.name ?? '미지정'} />
        <div className="cam__controls">
          <button type="button" className="cam__side" onClick={close}>폴더</button>
          <button
            type="button"
            className={`cam__shutter ${recording ? 'cam__shutter--rec' : ''}`}
            aria-label={mode === 'photo' ? '촬영' : recording ? '녹화 종료' : '녹화 시작'}
            disabled={busy || !ready}
            onClick={mode === 'photo' ? takePhoto : toggleRecording}
          >
            <span />
          </button>
          <button
            type="button"
            className="cam__side cam__side--album"
            aria-label="앨범에서 가져오기"
            disabled={recording || busy}
            onClick={() => albumInput.current?.click()}
          >
            앨범
          </button>
          <input
            ref={albumInput}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => importFromAlbum(e.target.files)}
          />
        </div>
      </div>
      {importing ? <div className="cam__toast">{importing}</div> : null}
      {!importing && saved ? <div className="cam__toast cam__toast--saved">✓ {saved}</div> : null}
      {mode === 'video' && noMic && !saved && !importing ? <div className="cam__toast">마이크 권한이 없어 무음으로 녹화돼요</div> : null}
    </div>
  );
}

/** 선택된 강아지의 이번 세션 사진 줄. 촬영 순서대로, 새 사진이 오른쪽 끝에 붙고 자동으로 끝까지 스크롤. */
function ShotStrip({ items, label }: { items: MediaItem[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [items.length]);
  return (
    <div className="cam__shots">
      <div className="cam__shots-head">
        <span>{label} · {items.length}장</span>
        {items.length === 0 ? <span style={{ color: '#D1D5DB' }}>아직 찍은 사진이 없어요</span> : null}
      </div>
      <div ref={ref} className="cam__shots-row">
        {items.map((m, i) => <ShotThumb key={m.id} m={m} index={i + 1} latest={i === items.length - 1} />)}
      </div>
    </div>
  );
}

function ShotThumb({ m, index, latest }: { m: MediaItem; index: number; latest: boolean }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  return (
    <div className={`cam__shot ${latest ? 'cam__shot--new' : ''}`}>
      {url ? <img src={url} alt="" /> : null}
      <span className="cam__shot-no">{index}</span>
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
    </div>
  );
}
