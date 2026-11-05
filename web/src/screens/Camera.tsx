import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DogAvatar } from '../components/ui';
import { getOrCreateOpenSession, insertCapturedMedia, listActiveDogs, markSessionReviewing } from '../db/repo';
import { capturePhoto, makeThumbnail, openCamera, startRecording, stopStream, videoDurationMs, videoThumbnail, type RecordingHandle } from '../lib/camera';
import { useCaptureStore } from '../store/capture';

export function CameraScreen() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<RecordingHandle | null>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const { sessionId, mode, selectedDogIds, shotCount, setSession, setMode, selectDog, toggleMultiDog, bumpShotCount } = useCaptureStore();
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });

  // 스트림 열기. 화면 복귀(visibilitychange) 시 멈춘 스트림을 다시 연다 (iOS 사파리 대응).
  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      stopStream(streamRef.current);
      try {
        const s = await openCamera(mode === 'video');
        if (cancelled) { stopStream(s); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
        setReady(true);
        setError(null);
      } catch {
        setError('카메라 권한이 필요해요. 브라우저 설정에서 카메라를 허용해 주세요.');
      }
    };
    open();
    const onVisible = () => { if (document.visibilityState === 'visible') open(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (!sessionId) getOrCreateOpenSession().then(setSession);
  }, [sessionId, setSession]);

  const selectedDogs = dogs.filter((d) => selectedDogIds.includes(d.id));
  const nameLabel = selectedDogs.length === 0 ? '미지정' : selectedDogs.map((d) => d.name).join(' · ');

  const takePhoto = useCallback(async () => {
    if (!sessionId || busy || !videoRef.current) return;
    setBusy(true);
    try {
      const blob = await capturePhoto(videoRef.current);
      const thumbBlob = await makeThumbnail(blob);
      await insertCapturedMedia({ sessionId, kind: 'PHOTO', blob, thumbBlob, mimeType: 'image/jpeg', durationMs: null, dogIds: selectedDogIds });
      bumpShotCount();
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, selectedDogIds, bumpShotCount]);

  const toggleRecording = useCallback(async () => {
    if (!sessionId || !streamRef.current) return;
    if (recording) { recRef.current?.stop(); return; }
    const dogIdsAtStart = [...selectedDogIds]; // 녹화 시작 시점의 지정 강아지로 고정
    const handle = startRecording(streamRef.current);
    recRef.current = handle;
    setRecording(true);
    handle.done
      .then(async ({ blob, mimeType, durationMs }) => {
        setBusy(true);
        const thumbBlob = await videoThumbnail(blob);
        await insertCapturedMedia({ sessionId, kind: 'VIDEO', blob, thumbBlob, mimeType, durationMs, dogIds: dogIdsAtStart });
        bumpShotCount();
      })
      .catch((e) => setError(String(e)))
      .finally(() => { setRecording(false); setBusy(false); recRef.current = null; });
  }, [recording, sessionId, selectedDogIds, bumpShotCount]);

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
      } finally {
        setImporting(null);
        setBusy(false);
        if (albumInput.current) albumInput.current.value = '';
      }
    },
    [sessionId, selectedDogIds, bumpShotCount],
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
      {error ? <div className="cam__center">{error}</div> : null}
      {!ready && !error ? <div className="cam__center">카메라 여는 중…</div> : null}

      <div className="cam__top">
        <button type="button" className="cam__round" aria-label="촬영 마치고 검수" onClick={close}>✕</button>
        <div className="cam__pill">오늘 {shotCount}장</div>
        <button type="button" className="cam__round" disabled={recording} onClick={() => setMode(mode === 'photo' ? 'video' : 'photo')}>
          {mode === 'photo' ? '영상' : '사진'}
        </button>
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
    </div>
  );
}
