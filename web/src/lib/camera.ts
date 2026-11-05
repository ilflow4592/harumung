/** 브라우저 카메라 유틸. getUserMedia 스트림, 캔버스 캡처, MediaRecorder 녹화. */

export const MAX_VIDEO_MS = 30_000;

export async function openCamera(withAudio: boolean): Promise<MediaStream> {
  // 후면 카메라, 가능하면 1080p. 기기가 못 주면 가장 가까운 해상도로 떨어진다.
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: withAudio,
  });
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
  const bitmap = await createImageBitmap(source);
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

export function startRecording(stream: MediaStream, maxMs = MAX_VIDEO_MS): RecordingHandle {
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
