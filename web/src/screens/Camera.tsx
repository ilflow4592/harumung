import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DogAvatar, useObjectUrl } from '../components/ui';
import type { MediaItem } from '../db/db';
import { getOrCreateOpenSession, insertCapturedMedia, listActiveDogs, listAttendedDogIds, listSessionMedia, localDate, markSessionReviewing } from '../db/repo';
import { MAX_VIDEO_MS, applyModeResolution, applyNativeZoom, cameraErrorMessage, capturePhotoBest, makeThumbnail, nativeZoomRange, openCamera, openMic, startRecording, stopStream, streamResolution, videoDurationMs, videoThumbnail, type RecordingHandle } from '../lib/camera';
import { shutterFeedback } from '../lib/feedback';
import { useCaptureStore } from '../store/capture';

const HQ_KEY = 'harumung.hq';
/** 고화질 모드: 기본 카메라 앱으로 찍어 원본을 가져온다. iOS 사파리도 ImageCapture 객체는 있어서 기능 감지로 못 가른다. 전 기기에 노출. */
const hqAvailable = true;

export function CameraScreen() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const [noMic, setNoMic] = useState(false);
  const recRef = useRef<RecordingHandle | null>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const hqInput = useRef<HTMLInputElement>(null);
  const [hq, setHq] = useState<boolean>(() => { try { return localStorage.getItem(HQ_KEY) === '1'; } catch { return false; } });
  const [resolution, setResolution] = useState<string | null>(null);
  const [lastSource, setLastSource] = useState<'sensor' | 'preview' | 'native' | null>(null);
  const toggleHq = () => setHq((v) => { const n = !v; try { localStorage.setItem(HQ_KEY, n ? '1' : '0'); } catch { /* 저장 못 해도 동작엔 지장 없음 */ } return n; });
  const [importing, setImporting] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0); // 녹화 경과 시간
  // 줌. 기기 줌이 되면 렌즈 줌, 아니면 디지털 줌(미리보기 확대 + 캔버스 크롭).
  // 손가락을 따라 즉시 반영해야 하므로 미리보기 transform은 state를 거치지 않고 ref로 직접 쓴다.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const zoomRange = useRef<{ min: number; max: number } | null>(null);
  const [nativeZoom, setNativeZoom] = useState(false);
  const nativeRef = useRef(false);
  const DIGITAL_MAX = 3;
  const zoomMax = nativeZoom ? Math.min(zoomRange.current?.max ?? DIGITAL_MAX, 5) : DIGITAL_MAX;
  const gestureRef = useRef<HTMLDivElement>(null);
  const applying = useRef(false);
  const pendingZoom = useRef<number | null>(null);

  /** 렌즈 줌을 순서대로 적용. 진행 중이면 마지막 값만 남겨 뒀다 이어서 적용. 실패하면 디지털 줌으로 전환. */
  const pushNativeZoom = useCallback(async (z: number) => {
    if (applying.current) { pendingZoom.current = z; return; }
    applying.current = true;
    try {
      let target: number | null = z;
      while (target !== null) {
        const ok = await applyNativeZoom(streamRef.current, target);
        if (!ok) {
          nativeRef.current = false;
          setNativeZoom(false);
          if (videoRef.current) videoRef.current.style.transform = `scale(${zoomRef.current})`;
          break;
        }
        target = pendingZoom.current;
        pendingZoom.current = null;
      }
    } finally {
      applying.current = false;
    }
  }, []);

  const changeZoom = useCallback((next: number) => {
    const max = nativeRef.current ? Math.min(zoomRange.current?.max ?? DIGITAL_MAX, 5) : DIGITAL_MAX;
    const min = nativeRef.current ? (zoomRange.current?.min ?? 1) : 1;
    const z = Math.min(max, Math.max(min, next));
    zoomRef.current = z;
    setZoom(Math.round(z * 10) / 10);
    if (nativeRef.current) {
      void pushNativeZoom(z);
    } else if (videoRef.current) {
      videoRef.current.style.transform = `scale(${z})`;
    }
  }, [pushNativeZoom]);

  // 핀치: touch 이벤트를 직접 단다. 사파리는 두 손가락이 닿으면 pointer 이벤트를 끊고 페이지 줌으로 가져가므로
  // touchmove에서 preventDefault(passive: false)와 gesturestart 차단이 필요하다.
  useEffect(() => {
    const el = gestureRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        startDist = dist(e.touches);
        startZoom = zoomRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        changeZoom(startZoom * (dist(e.touches) / startDist));
      }
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) startDist = 0; };
    const block = (e: Event) => e.preventDefault();
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('gesturestart', block);
    el.addEventListener('gesturechange', block);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('gesturestart', block);
      el.removeEventListener('gesturechange', block);
    };
  }, [changeZoom]);

  /** 줌 칩 탭: 1× → 2× → 3× → 1× */
  const cycleZoom = () => {
    const steps = [1, 2, 3].filter((v) => v <= zoomMax);
    const next = steps.find((v) => v > zoom + 0.05) ?? steps[0];
    changeZoom(next);
  };
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0); // 바뀔 때마다 흰 플래시 1회
  const [saved, setSaved] = useState<string | null>(null); // "저장됨" 토스트
  const savedTimer = useRef<number | undefined>(undefined);
  const showSaved = useCallback((text: string) => {
    setSaved(text);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(null), 1200);
  }, []);

  const { sessionId, mode, selectedDogIds, shotCount, setSession, setMode, toggleDog, clearSelected, bumpShotCount } = useCaptureStore();
  const { data: allDogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const date = localDate();
  const { data: attended = [] } = useQuery({ queryKey: ['attendance', date], queryFn: () => listAttendedDogIds(date) });
  const [showAll, setShowAll] = useState(false);
  // 등원 체크가 있으면 스트립에 오늘 온 아이만. 선택 중인 아이는 명단에 없어도 유지한다.
  const dogs = useMemo(() => {
    if (attended.length === 0 || showAll) return allDogs;
    const set = new Set(attended);
    return allDogs.filter((d) => set.has(d.id) || selectedDogIds.includes(d.id));
  }, [allDogs, attended, showAll, selectedDogIds]);
  const qc = useQueryClient();
  const { data: sessionMedia = [] } = useQuery({
    queryKey: ['session-media', sessionId],
    queryFn: () => (sessionId ? listSessionMedia(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });
  // 촬영·가져오기 뒤 호출. 아래 사진 줄을 갱신한다.
  const refreshStrip = useCallback(() => qc.invalidateQueries({ queryKey: ['session-media', sessionId] }), [qc, sessionId]);

  // 지금 선택된 강아지(들)의 이번 세션 사진. 여러 마리면 그 조합이 모두 들어간 사진. 미지정 모드면 미지정 사진.
  const stripMedia = useMemo(() => {
    if (selectedDogIds.length === 0) return sessionMedia.filter((m) => m.dogIds.length === 0);
    return sessionMedia.filter((m) => selectedDogIds.every((id) => m.dogIds.includes(id)));
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
        setResolution(streamResolution(s));
        const range = nativeZoomRange(s);
        zoomRange.current = range;
        nativeRef.current = !!range;
        setNativeZoom(!!range);
        const z0 = range ? Math.max(1, range.min) : 1;
        zoomRef.current = z0;
        setZoom(z0);
        if (videoRef.current) videoRef.current.style.transform = range ? '' : `scale(${z0})`;
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

  // 사진 4K / 영상 1080p. 스트림을 다시 열지 않고 트랙 제약만 바꾼다.
  useEffect(() => {
    if (!ready) return;
    applyModeResolution(streamRef.current, mode).then(() => setResolution(streamResolution(streamRef.current)));
  }, [mode, ready]);

  const selectedDogs = allDogs.filter((d) => selectedDogIds.includes(d.id));
  // "코코 외 1마리" 식 짧은 이름. 토스트와 아래 사진 줄 제목에 쓴다.
  const nameLabel =
    selectedDogs.length === 0 ? '미지정'
    : selectedDogs.length === 1 ? selectedDogs[0].name
    : `${selectedDogs[0].name} 외 ${selectedDogs.length - 1}마리`;

  const takePhoto = useCallback(async () => {
    if (!sessionId || busy || !videoRef.current) return;
    // 고화질 모드: 기본 카메라 앱을 연다. 결과는 onHqPicked로 들어온다.
    if (hq && hqAvailable) { hqInput.current?.click(); return; }
    setBusy(true);
    // 셔터 효과는 저장 전에 즉시. 사용자가 "찍혔다"를 바로 느끼게 한다.
    setFlash((n) => n + 1);
    shutterFeedback();
    try {
      const { blob, source } = await capturePhotoBest(videoRef.current, streamRef.current, nativeRef.current ? 1 : zoomRef.current);
      setLastSource(source);
      const thumbBlob = await makeThumbnail(blob);
      await insertCapturedMedia({ sessionId, kind: 'PHOTO', blob, thumbBlob, mimeType: blob.type || 'image/jpeg', durationMs: null, dogIds: selectedDogIds });
      bumpShotCount();
      refreshStrip();
      showSaved(`${nameLabel} · ${stripMedia.length + 1}장째 저장됨`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, hq, selectedDogIds, bumpShotCount, refreshStrip, showSaved, nameLabel, stripMedia.length]);

  /** 고화질 모드 결과(기본 카메라 앱 원본). 앨범 가져오기와 같은 경로로 저장. */
  const onHqPicked = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!sessionId || !file) return;
      setBusy(true);
      try {
        const thumbBlob = await makeThumbnail(file);
        await insertCapturedMedia({ sessionId, kind: 'PHOTO', blob: file, thumbBlob, mimeType: file.type || 'image/jpeg', durationMs: null, dogIds: selectedDogIds });
        setLastSource('native');
        bumpShotCount();
        refreshStrip();
        showSaved(`${nameLabel} · ${stripMedia.length + 1}장째 저장됨 (원본)`);
      } finally {
        setBusy(false);
        if (hqInput.current) hqInput.current.value = '';
      }
    },
    [sessionId, selectedDogIds, bumpShotCount, refreshStrip, showSaved, nameLabel, stripMedia.length],
  );

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
    setRecMs(0);
    const startedAt = Date.now();
    const tick = window.setInterval(() => setRecMs(Date.now() - startedAt), 200);
    shutterFeedback();
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
      .finally(() => { window.clearInterval(tick); setRecording(false); setRecMs(0); setBusy(false); recRef.current = null; });
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

  const lastShot = stripMedia[stripMedia.length - 1] ?? sessionMedia[sessionMedia.length - 1] ?? null;
  const dogCountLabel = attended.length > 0 ? `등원 ${attended.length}` : `전체 ${allDogs.length}`;

  return (
    <div className="cam">
      <video ref={videoRef} className="preview" playsInline muted autoPlay />
      <div ref={gestureRef} className="cam__gesture" />
      {flash > 0 ? <div key={flash} className="cam__flash" /> : null}
      {error ? <div className="cam__center">{error}</div> : null}
      {!ready && !error ? <div className="cam__center">카메라 여는 중…</div> : null}

      {/* 상단: 닫기 · 모드 · HQ. 세 개만. */}
      <div className="cam__top">
        <button type="button" className="cam__round" aria-label="촬영 마치고 검수" onClick={close}>✕</button>
        <div className="cam__seg" role="tablist" aria-label="촬영 모드">
          <button type="button" role="tab" aria-selected={mode === 'photo'} className={mode === 'photo' ? 'on' : ''} disabled={recording} onClick={() => setMode('photo')}>사진</button>
          <button type="button" role="tab" aria-selected={mode === 'video'} className={mode === 'video' ? 'on' : ''} disabled={recording} onClick={() => setMode('video')}>영상</button>
        </div>
        {mode === 'photo' ? (
          <button type="button" className={`cam__round cam__hq ${hq ? 'cam__hq--on' : ''}`} aria-pressed={hq} onClick={toggleHq} title="고화질: 기본 카메라로 찍기">HQ</button>
        ) : (
          <span className="cam__round" style={{ visibility: 'hidden' }} />
        )}
      </div>

      {/* 가운데: 지금 누구를 찍는지 한 줄. 녹화 중엔 타이머로 바뀐다. */}
      {recording ? (
        <div className="cam__rec" role="status">
          <span className="cam__rec-dot" />
          <span className="cam__rec-time">{fmtRec(recMs)}</span>
          <span className="cam__rec-max">/ {MAX_VIDEO_MS / 1000}초</span>
          <span className="cam__rec-bar"><span style={{ width: `${Math.min(100, (recMs / MAX_VIDEO_MS) * 100)}%` }} /></span>
        </div>
      ) : selectedDogs.length === 0 ? (
        <div className="cam__who cam__who--none">미지정 · 아래에서 강아지를 고르세요</div>
      ) : (
        <div className="cam__who">
          <b>{nameLabel}</b>
          {stripMedia.length > 0 ? <span className="cam__who-count">{stripMedia.length}장</span> : null}
          <button type="button" className="cam__who-x" aria-label="선택 해제" onClick={clearSelected}>✕</button>
        </div>
      )}

      {/* 하단: 강아지 줄 → 방금 찍은 사진 줄 → 셔터. */}
      <div className="cam__bottom">
        <button type="button" className="cam__zoom" onClick={cycleZoom} aria-label="줌 바꾸기">
          {zoom.toFixed(1).replace(/\.0$/, '')}×
        </button>
        <div className="cam__strip">
          {dogs.map((d) => {
            const selected = selectedDogIds.includes(d.id);
            return (
              <button key={d.id} type="button" className={`cam__dog ${selected ? 'cam__dog--on' : ''}`} aria-pressed={selected} disabled={recording} onClick={() => toggleDog(d.id)}>
                <span className="cam__dog-av">
                  <DogAvatar name={d.name} sex={d.sex} thumb={d.thumbBlob} size={52} selected={selected} />
                  {selected ? <span className="cam__dog-check">✓</span> : null}
                </span>
                <span className="cam__dog-name">{d.name}</span>
              </button>
            );
          })}
          {attended.length > 0 && attended.length < allDogs.length ? (
            <button type="button" className="cam__dog" disabled={recording} onClick={() => setShowAll((v) => !v)}>
              <span className="cam__more">{showAll ? '−' : '+'}</span>
              <span className="cam__dog-name">{showAll ? dogCountLabel : '전체'}</span>
            </button>
          ) : null}
        </div>

        {stripMedia.length > 0 ? <ShotStrip items={stripMedia} /> : null}

        <div className="cam__controls">
          <button type="button" className="cam__side cam__side--last" aria-label="촬영 마치고 검수" onClick={close}>
            {lastShot ? <LastThumb m={lastShot} /> : null}
            {shotCount > 0 ? <span key={shotCount} className="cam__side-badge cam__pill--bump">{shotCount}</span> : null}
          </button>
          <button
            type="button"
            className={`cam__shutter ${mode === 'video' ? 'cam__shutter--video' : ''} ${recording ? 'cam__shutter--rec' : ''}`}
            aria-label={mode === 'photo' ? '촬영' : recording ? '녹화 종료' : '녹화 시작'}
            disabled={busy || !ready}
            onClick={mode === 'photo' ? takePhoto : toggleRecording}
          >
            <span />
          </button>
          <button type="button" className="cam__side" aria-label="앨범에서 가져오기" disabled={recording || busy} onClick={() => albumInput.current?.click()}>
            <AlbumIcon />
          </button>
          <input ref={hqInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onHqPicked(e.target.files)} />
          <input ref={albumInput} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={(e) => importFromAlbum(e.target.files)} />
        </div>
        {import.meta.env.DEV ? (
          <div className="cam__debug">
            {hq ? '기본 카메라' : resolution ?? ''}{lastSource ? ` · ${lastSource}` : ''} · {nativeZoom ? '렌즈 줌' : '디지털 줌'}
          </div>
        ) : null}
      </div>

      {importing ? <div className="cam__toast">{importing}</div> : null}
      {!importing && saved ? <div className="cam__toast cam__toast--saved">✓ {saved}</div> : null}
      {mode === 'video' && noMic && !saved && !importing ? <div className="cam__toast">마이크 권한이 없어 무음으로 녹화돼요</div> : null}
    </div>
  );
}

function LastThumb({ m }: { m: MediaItem }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  return url ? <img src={url} alt="" /> : null;
}

function AlbumIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 15l-5-5-8 8" />
    </svg>
  );
}

function fmtRec(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 선택된 강아지의 이번 세션 사진 줄. 촬영 순서대로, 새 사진이 오른쪽 끝에 붙고 자동으로 끝까지 스크롤. */
function ShotStrip({ items }: { items: MediaItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [items.length]);
  return (
    <div className="cam__shots">
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
