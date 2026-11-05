/** 브라우저 카메라 유틸. getUserMedia 스트림, 캔버스 캡처, MediaRecorder 녹화. */

export const MAX_VIDEO_MS = 30_000;

/** 후면 카메라 영상 스트림만 연다. 마이크는 녹화 시작 때 따로 연다(권한 요청 분리, iOS 재오픈 실패 방지). */
export async function openCamera(): Promise<MediaStream> {
  // 후면 카메라, 가능하면 4K. 기기가 못 주면 가장 가까운 해상도(보통 1080p)로 떨어진다.
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    audio: false,
  });
}

/** 지금 스트림이 실제로 주는 해상도. 화질 확인용 표시. */
export function streamResolution(stream: MediaStream | null): string | null {
  const t = stream?.getVideoTracks()[0];
  const st = t?.getSettings();
  return st?.width && st?.height ? `${st.width}×${st.height}` : null;
}

// ImageCapture는 안드로이드 크롬만 있다. lib.dom에 타입이 없어 최소한만 선언.
type ImageCaptureLike = { takePhoto: (opts?: { imageWidth?: number; imageHeight?: number }) => Promise<Blob> };
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

export function hasImageCapture(): boolean {
  return typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture === 'function';
}

/**
 * 가능한 최고 화질로 한 장.
 * 안드로이드 크롬: ImageCapture.takePhoto → 센서 풀 해상도 JPEG. 실패하거나 없으면 미리보기 캔버스 캡처.
 * 반환 source는 어떤 경로로 찍혔는지 (화질 테스트용).
 */
export async function capturePhotoBest(video: HTMLVideoElement, stream: MediaStream | null): Promise<{ blob: Blob; source: 'sensor' | 'preview' }> {
  const track = stream?.getVideoTracks()[0];
  if (track && hasImageCapture()) {
    try {
      const Ctor = (window as unknown as { ImageCapture: ImageCaptureCtor }).ImageCapture;
      const blob = await new Ctor(track).takePhoto();
      if (blob.size > 0) return { blob, source: 'sensor' };
    } catch {
      /* 일부 기기는 takePhoto가 실패한다. 캔버스로 대체. */
    }
  }
  return { blob: await capturePhoto(video), source: 'preview' };
}

/** 마이크 스트림. 거부되거나 없으면 null — 영상은 무음으로 녹화한다. */
export async function openMic(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    return null;
  }
}

/** getUserMedia 실패 원인을 사용자 문장으로. */
export function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '카메라 권한이 필요해요. 브라우저 설정에서 카메라를 허용해 주세요.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '사용할 수 있는 카메라를 찾지 못했어요.';
    case 'NotReadableError':
    case 'AbortError':
      return '다른 앱이 카메라를 쓰고 있어요. 다른 앱을 닫고 다시 열어 주세요.';
    default:
      return `카메라를 열지 못했어요. (${name || String(e)})`;
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** 현재 프레임을 JPEG Blob으로. 미리보기 <video>의 실제 해상도를 그대로 쓴다. */
export async function capturePhoto(video: HTMLVideoElement, quality = 0.9): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  ctx.drawImage(video, 0, 0);
  return canvasToBlob(canvas, 'image/jpeg', quality);
}

/** 긴 변 maxSide px JPEG 썸네일. */
export async function makeThumbnail(source: Blob, maxSide = 400): Promise<Blob> {
  // 기본 카메라 앱·앨범에서 온 JPEG는 EXIF 회전이 있다. 썸네일은 보이는 방향대로.
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToBlob(canvas, 'image/jpeg', 0.8);
}

/** 녹화 영상의 첫 프레임 썸네일. 서버 변환 전 로컬 표시용. */
export async function videoThumbnail(video: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(video);
  try {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.src = url;
    await new Promise<void>((resolve, reject) => {
      el.onloadeddata = () => resolve();
      el.onerror = () => reject(new Error('영상을 읽지 못했습니다.'));
    });
    el.currentTime = 0.1;
    await new Promise<void>((resolve) => {
      el.onseeked = () => resolve();
    });
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) return null;
    ctx.drawImage(el, 0, 0);
    const full = await canvasToBlob(canvas, 'image/jpeg', 0.8);
    return makeThumbnail(full);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 앨범에서 가져온 영상의 길이(ms). 못 읽으면 null. */
export async function videoDurationMs(video: Blob): Promise<number | null> {
  const url = URL.createObjectURL(video);
  try {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.src = url;
    await new Promise<void>((resolve, reject) => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => reject(new Error('영상을 읽지 못했습니다.'));
    });
    return Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 브라우저가 지원하는 녹화 형식. iOS 사파리는 mp4, 안드로이드 크롬은 webm. 서버에서 720p mp4로 통일한다. */
export function pickRecorderMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
}

export type RecordingHandle = {
  stop: () => void;
  done: Promise<{ blob: Blob; mimeType: string; durationMs: number }>;
};

/** 카메라 영상 트랙 + (있으면) 마이크 트랙을 합쳐 녹화한다. 미리보기 스트림은 건드리지 않는다. */
export function startRecording(camera: MediaStream, mic: MediaStream | null, maxMs = MAX_VIDEO_MS): RecordingHandle {
  const stream = new MediaStream([...camera.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])]);
  const mimeType = pickRecorderMime();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = new Promise<{ blob: Blob; mimeType: string; durationMs: number }>((resolve, reject) => {
    recorder.onstop = () =>
      resolve({
        blob: new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }),
        mimeType: recorder.mimeType || mimeType || 'video/webm',
        durationMs: Date.now() - startedAt,
      });
    recorder.onerror = () => reject(new Error('녹화 중 오류가 났습니다.'));
  });
  recorder.start(1000);
  const timer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, maxMs);
  return {
    stop: () => {
      clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
    },
    done,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 인코딩 실패'))), type, quality);
  });
}
