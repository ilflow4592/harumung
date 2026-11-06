/**
 * 개발 빌드 전용 테스트 데이터. 콘솔에서 window.__harumungSeed() 호출.
 * 사용 안내 스크린샷·수동 테스트용. 프로덕션 빌드에는 포함되지 않는다.
 */
import { ulid } from 'ulid';

import { db } from '../db/db';
import { createDog, localDate, markSent, setAttendance, setFolderReviewed } from '../db/repo';
import { makeThumbnail } from '../lib/camera';

const PALETTE = ['#5FD3C0', '#93C5FD', '#F9A8D4', '#FCD34D', '#C4B5FD', '#FCA5A5', '#A7F3D0', '#FDBA74'];

/** 색 배경 + 강아지 이모지 + 라벨로 된 가짜 사진. */
async function fakePhoto(label: string, idx: number, w = 1440, h = 1920): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, PALETTE[idx % PALETTE.length]);
  g.addColorStop(1, PALETTE[(idx + 3) % PALETTE.length]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc((i * 331) % w, (i * 577) % h, 60 + (i % 5) * 30, 0, Math.PI * 2); ctx.fill(); }
  ctx.font = `${Math.round(w * 0.35)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🐶', w / 2, h / 2 - w * 0.05);
  ctx.fillStyle = 'rgba(17,24,39,0.75)'; ctx.font = `bold ${Math.round(w * 0.07)}px system-ui`;
  ctx.fillText(label, w / 2, h * 0.8);
  return new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/jpeg', 0.85));
}

async function fakeVideo(label: string, seconds = 3): Promise<{ blob: Blob; mimeType: string }> {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const stream = c.captureStream(24);
  const mimeType = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<Blob>((r) => { rec.onstop = () => r(new Blob(chunks, { type: rec.mimeType || 'video/webm' })); });
  rec.start(500);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      ctx.fillStyle = '#0B7A6B'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#fff'; ctx.font = '160px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🐕', 640 + Math.sin(t * 3) * 300, 360);
      ctx.font = 'bold 48px system-ui'; ctx.fillText(label, 640, 620);
      if (t < seconds) requestAnimationFrame(frame); else resolve();
    };
    frame();
  });
  rec.stop();
  const blob = await done;
  return { blob, mimeType: blob.type };
}

async function addMedia(sessionId: string, kind: 'PHOTO' | 'VIDEO', blob: Blob, mimeType: string, dogIds: string[], takenAt: Date, durationMs: number | null, reviewStatus: 'pending' | 'kept') {
  const thumbBlob = kind === 'PHOTO' ? await makeThumbnail(blob) : await makeThumbnail(await fakePhoto('영상', 2, 480, 270));
  await db.media.add({
    id: ulid(), sessionId, kind, takenAt: takenAt.toISOString(), blob, thumbBlob, mimeType, durationMs, sizeBytes: blob.size,
    dogIds, aCutDogIds: [], reviewStatus, uploadStatus: reviewStatus === 'kept' ? 'queued' : 'none', uploadAttempts: 0, remoteId: null,
  });
}

export async function seed(): Promise<string> {
  for (const t of db.tables) await t.clear();
  const date = localDate();
  const base = new Date(); base.setHours(10, 12, 0, 0);
  const at = (min: number) => new Date(base.getTime() + min * 60_000);

  const dogsSpec: { name: string; sex: 'MALE' | 'FEMALE'; phones: string[]; memo: string | null }[] = [
    { name: '코코', sex: 'FEMALE', phones: ['01012345678'], memo: '닭고기 알레르기' },
    { name: '보리', sex: 'MALE', phones: ['01023456789', '01087654321'], memo: null },
    { name: '몽이', sex: 'MALE', phones: ['01034567890'], memo: '낯가림 있음' },
    { name: '두부', sex: 'FEMALE', phones: ['01045678901'], memo: null },
    { name: '초코', sex: 'MALE', phones: ['01056789012'], memo: null },
    { name: '루피', sex: 'FEMALE', phones: ['01067890123'], memo: '3시 약 먹이기' },
  ];
  const ids: Record<string, string> = {};
  for (let i = 0; i < dogsSpec.length; i++) {
    const d = dogsSpec[i];
    const thumb = await makeThumbnail(await fakePhoto(d.name, i, 600, 600));
    ids[d.name] = await createDog({ name: d.name, sex: d.sex, thumbBlob: thumb, memo: d.memo, phones: d.phones });
  }

  await setAttendance(date, [ids['코코'], ids['보리'], ids['몽이'], ids['두부']]);

  // 저장된 세션 (오늘 오전)
  const saved = ulid();
  await db.shootSessions.add({ id: saved, startedAt: at(0).toISOString(), closedAt: at(40).toISOString(), status: 'saved' });
  let n = 0;
  const photo = async (label: string, dogs: string[], min: number) => addMedia(saved, 'PHOTO', await fakePhoto(label, n++), 'image/jpeg', dogs, at(min), null, 'kept');
  await photo('코코 1', [ids['코코']], 1);
  await photo('코코 2', [ids['코코']], 2);
  await photo('코코 3', [ids['코코']], 4);
  await photo('코코 4', [ids['코코']], 5);
  const v1 = await fakeVideo('코코 영상');
  await addMedia(saved, 'VIDEO', v1.blob, v1.mimeType, [ids['코코']], at(6), 3000, 'kept');
  await photo('보리 1', [ids['보리']], 8);
  await photo('보리 2', [ids['보리']], 9);
  await photo('보리 3', [ids['보리']], 10);
  await photo('코코·보리', [ids['코코'], ids['보리']], 12);
  await photo('코코·보리 2', [ids['코코'], ids['보리']], 13);
  await photo('몽이 1', [ids['몽이']], 15);
  await photo('몽이 2', [ids['몽이']], 16);
  await photo('미지정 1', [], 18);
  await photo('미지정 2', [], 19);
  await photo('미지정 3', [], 20);

  await setFolderReviewed(date, ids['보리'], true);
  await setFolderReviewed(date, ids['몽이'], true);
  {
    const mongi = (await db.media.where('dogIds').equals(ids['몽이']).toArray()).filter((m) => m.reviewStatus === 'kept');
    await markSent(date, ids['몽이'], mongi);
  }

  // 어제 사진 (날짜 이동 확인용)
  const y = new Date(base); y.setDate(y.getDate() - 1);
  const ysess = ulid();
  await db.shootSessions.add({ id: ysess, startedAt: y.toISOString(), closedAt: y.toISOString(), status: 'saved' });
  await addMedia(ysess, 'PHOTO', await fakePhoto('어제 두부', 5), 'image/jpeg', [ids['두부']], y, null, 'kept');
  await addMedia(ysess, 'PHOTO', await fakePhoto('어제 두부 2', 6), 'image/jpeg', [ids['두부']], new Date(y.getTime() + 60_000), null, 'kept');

  return `강아지 ${dogsSpec.length}마리, 오늘 사진 15개(영상 1), 어제 2장`;
}

declare global {
  interface Window { __harumungSeed?: () => Promise<string> }
}
window.__harumungSeed = seed;
