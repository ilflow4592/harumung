import { useEffect, useRef, useState } from 'react';

import type { MediaItem } from '../db/db';
import { saveEdited } from '../db/repo';
import { track } from '../lib/analytics';
import { makeThumbnail } from '../lib/camera';
import { DEFAULT_EDIT, clampPan, exportEdit, frameSize, renderEdit, type PhotoEdit } from '../lib/photoEdit';

const ASPECTS: { label: string; value: number | null }[] = [
  { label: '원본', value: null }, { label: '1:1', value: 1 }, { label: '4:5', value: 4 / 5 }, { label: '3:4', value: 3 / 4 }, { label: '16:9', value: 16 / 9 },
];

/** 사진 편집: 회전·자르기(비율 프레임 + 끌어서 위치 + 확대)·밝기. 덮어쓰기 또는 복사본 저장. */
export function PhotoEditor({ item, onClose, onSaved }: { item: MediaItem; onClose: () => void; onSaved: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [preview, setPreview] = useState<ImageBitmap | null>(null);
  const [edit, setEdit] = useState<PhotoEdit>(DEFAULT_EDIT);
  const [avail, setAvail] = useState({ w: 320, h: 400 });
  const [busy, setBusy] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);

  // 원본 비트맵 + 미리보기용 축소본(긴 변 1400px). 미리보기 렌더를 가볍게.
  useEffect(() => {
    let cancelled = false;
    const src = item.blob ?? item.thumbBlob;
    if (!src) return;
    (async () => {
      const full = await createImageBitmap(src, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1400 / Math.max(full.width, full.height));
      const small = scale < 1 ? await createImageBitmap(full, { resizeWidth: Math.round(full.width * scale), resizeHeight: Math.round(full.height * scale) }) : full;
      if (cancelled) { full.close(); return; }
      setBitmap(full);
      setPreview(small);
    })();
    return () => { cancelled = true; };
  }, [item]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setAvail({ w: el.clientWidth, h: el.clientHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const { fw, fh } = preview ? frameSize(avail.w - 8, avail.h - 8, preview.width, preview.height, edit) : { fw: 0, fh: 0 };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !preview || fw === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = fw * dpr;
    c.height = fh * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    renderEdit(ctx, preview, fw, fh, edit, dpr);
  }, [preview, fw, fh, edit]);

  const rotate = () => setEdit((e) => ({ ...e, rotation: ((e.rotation + 90) % 360) as PhotoEdit['rotation'], pan: { x: 0, y: 0 } }));
  const setAspect = (a: number | null) => setEdit((e) => ({ ...e, aspect: a, pan: { x: 0, y: 0 } }));

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, pan: edit.pan };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !preview) return;
    const next = { x: drag.current.pan.x + (e.clientX - drag.current.x), y: drag.current.pan.y + (e.clientY - drag.current.y) };
    setEdit((ed) => ({ ...ed, pan: clampPan(fw, fh, preview.width, preview.height, { ...ed, pan: next }) }));
  };
  const onPointerUp = () => { drag.current = null; };

  const save = async (mode: 'replace' | 'copy') => {
    if (!bitmap || !preview) return;
    setBusy('저장 중…');
    try {
      // 내보내기는 원본 비트맵 기준. 미리보기 프레임 비율과 동일하게.
      const full = frameSize(avail.w - 8, avail.h - 8, bitmap.width, bitmap.height, edit);
      const scaled: PhotoEdit = { ...edit, pan: { x: edit.pan.x * (full.fw / fw), y: edit.pan.y * (full.fh / fh) } };
      const blob = await exportEdit(bitmap, full.fw, full.fh, scaled);
      const thumbBlob = await makeThumbnail(blob);
      await saveEdited(item.id, { blob, thumbBlob, mimeType: 'image/jpeg', durationMs: null }, mode);
      track('photo_edit_saved', { mode, rotation: edit.rotation, aspect: edit.aspect === null ? 'original' : String(Math.round(edit.aspect * 100) / 100), zoom: Math.round(edit.zoom * 10) / 10, brightness: edit.brightness, moved: edit.pan.x !== 0 || edit.pan.y !== 0 });
      onSaved();
    } finally {
      setBusy(null);
    }
  };

  const changed = edit.rotation !== 0 || edit.aspect !== null || edit.zoom !== 1 || edit.brightness !== 0 || edit.pan.x !== 0 || edit.pan.y !== 0;

  return (
    <div className="editor" role="dialog" aria-label="사진 편집">
      <div className="viewer__top">
        <button type="button" className="cam__round" aria-label="닫기" onClick={onClose}>✕</button>
        <span className="viewer__counter">사진 편집</span>
        <button type="button" className="cam__round" style={{ fontSize: 12, width: 'auto', padding: '0 12px' }} onClick={() => setEdit(DEFAULT_EDIT)} disabled={!changed}>초기화</button>
      </div>
      <div ref={boxRef} className="editor__stage">
        {preview ? (
          <canvas
            ref={canvasRef}
            className="editor__canvas"
            style={{ width: fw, height: fh }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ) : <span className="viewer__empty">불러오는 중…</span>}
      </div>
      <div className="editor__tools">
        <div className="editor__row">
          <button type="button" className="btn btn--small btn--ghost editor__tool" onClick={rotate}>↻ 회전</button>
          {ASPECTS.map((a) => (
            <button key={a.label} type="button" className={`btn btn--small ${edit.aspect === a.value ? '' : 'btn--ghost'} editor__tool`} onClick={() => setAspect(a.value)}>{a.label}</button>
          ))}
        </div>
        <label className="editor__slider">
          <span>확대</span>
          <input type="range" min={1} max={3} step={0.01} value={edit.zoom} onChange={(e) => setEdit((ed) => ({ ...ed, zoom: Number(e.target.value) }))} />
          <b>{edit.zoom.toFixed(1)}×</b>
        </label>
        <label className="editor__slider">
          <span>밝기</span>
          <input type="range" min={-40} max={40} step={1} value={edit.brightness} onChange={(e) => setEdit((ed) => ({ ...ed, brightness: Number(e.target.value) }))} />
          <b>{edit.brightness > 0 ? `+${edit.brightness}` : edit.brightness}</b>
        </label>
        <span className="sub" style={{ color: 'rgba(255,255,255,0.6)' }}>프레임 안에서 사진을 끌어 위치를 맞추세요</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--outline" style={{ flex: 1, background: 'transparent', color: 'var(--white)', borderColor: 'rgba(255,255,255,0.5)' }} disabled={!!busy || !changed} onClick={() => save('copy')}>복사본으로 저장</button>
          <button type="button" className="btn" style={{ flex: 1 }} disabled={!!busy || !changed} onClick={() => save('replace')}>{busy ?? '덮어쓰기'}</button>
        </div>
      </div>
    </div>
  );
}
