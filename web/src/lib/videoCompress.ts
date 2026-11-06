import { pickRecorderMime } from './camera';

/**
 * 브라우저 안에서 영상을 720p로 다시 인코딩한다.
 * 방식: 숨은 <video>로 재생 → 캔버스에 그리기 → canvas.captureStream + MediaRecorder.
 * 재생 시간만큼 걸린다(30초 영상 = 30초). 오디오는 decodeAudioData로 따로 풀어 같이 넣는다.
 * iOS는 AudioContext를 사용자 탭 안에서 만들어 둬야 한다 → unlockAudio()를 토글 탭에서 호출.
 */

let audioCtx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

export type CompressedVideo = { blob: Blob; mimeType: string; durationMs: number };

export type ProcessOptions = {
  maxHeight?: number;
  bitrate?: number;
  /** 구간 자르기(초). 없으면 전체. */
  start?: number;
  end?: number;
  /** 무음으로 */
  mute?: boolean;
  onProgress?: (ratio: number) => void;
};

export async function compressVideo(src: Blob, opts: ProcessOptions = {}): Promise<CompressedVideo> {
  const maxHeight = opts.maxHeight ?? 720;
  const bitrate = opts.bitrate ?? 1_500_000;
  const url = URL.createObjectURL(src);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('영상을 읽지 못했습니다.'));
    });
    const scale = Math.min(1, maxHeight / Math.min(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale / 2) * 2;
    canvas.height = Math.round(video.videoHeight * scale / 2) * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');

    const stream = canvas.captureStream(30);

    const total = Number.isFinite(video.duration) ? video.duration : 0;
    const start = Math.max(0, Math.min(opts.start ?? 0, total));
    const end = Math.max(start, Math.min(opts.end ?? total, total));
    const span = Math.max(0.1, end - start);

    // 오디오: 파일을 디코드해 재생 시작과 함께 출력 노드로 흘린다.
    let audioSource: AudioBufferSourceNode | null = null;
    if (audioCtx && !opts.mute) {
      try {
        const buf = await audioCtx.decodeAudioData(await src.arrayBuffer());
        const dest = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = buf;
        audioSource.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch {
        audioSource = null; // 디코드 실패(지원 안 하는 코덱)면 무음
      }
    }

    const mimeType = pickRecorderMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: bitrate } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const done = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' }));
      recorder.onerror = () => reject(new Error('변환 중 오류'));
    });

    // 구간 시작점으로 이동
    if (start > 0) {
      video.currentTime = start;
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
    }

    let rafId = 0;
    let finished = false;
    const finish = new Promise<void>((resolve) => {
      const check = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        opts.onProgress?.(Math.min(1, (video.currentTime - start) / span));
        if (video.ended || video.currentTime >= end) {
          if (!finished) { finished = true; video.pause(); resolve(); }
          return;
        }
        rafId = requestAnimationFrame(check);
      };
      video.onended = () => { if (!finished) { finished = true; resolve(); } };
      rafId = requestAnimationFrame(check);
    });

    recorder.start(1000);
    await video.play();
    audioSource?.start(0, start, span);
    await finish;
    cancelAnimationFrame(rafId);
    recorder.stop();
    try { audioSource?.stop(); } catch { /* 이미 끝남 */ }
    const blob = await done;
    opts.onProgress?.(1);
    return { blob, mimeType: blob.type, durationMs: Math.round(span * 1000) };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
