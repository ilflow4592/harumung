import { useCallback, useEffect, useRef, useState } from 'react';

import type { Dog, MediaItem } from '../db/db';
import { useObjectUrl } from './ui';

/**
 * 사진·영상 크게 보기. 좌우로 넘기고(터치·화살표), ✕로 닫는다.
 * 원본이 정리된 항목은 썸네일을 크게 보여주고 표시만 한다.
 */
export function MediaViewer({ items, index, dogs, onClose, onIndexChange }: {
  items: MediaItem[]; index: number; dogs: Dog[]; onClose: () => void; onIndexChange: (i: number) => void;
}) {
  const item = items[index];
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);

  const go = useCallback((delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < items.length) onIndexChange(next);
  }, [index, items.length, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  if (!item) return null;
  const names = item.dogIds.map((id) => dogs.find((d) => d.id === id)?.name ?? '?');
  const time = new Date(item.takenAt);
  const timeLabel = `${time.getMonth() + 1}월 ${time.getDate()}일 ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  return (
    <div
      className="viewer"
      role="dialog"
      aria-label="크게 보기"
      onTouchStart={(e) => { if (e.touches.length === 1) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchMove={(e) => { if (touch.current && e.touches.length === 1) setDrag(e.touches[0].clientX - touch.current.x); }}
      onTouchEnd={() => {
        const dx = drag;
        touch.current = null;
        setDrag(0);
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="viewer__top">
        <button type="button" className="cam__round" aria-label="닫기" onClick={onClose}>✕</button>
        <span className="viewer__counter">{index + 1} / {items.length}</span>
        <span className="cam__round" style={{ visibility: 'hidden' }} />
      </div>
      <div className="viewer__stage" style={{ transform: `translateX(${drag}px)`, transition: drag ? 'none' : 'transform 160ms ease-out' }}>
        <Stage key={item.id} item={item} />
      </div>
      <div className="viewer__info">
        <b>{names.length === 0 ? '미지정' : names.join(' · ')}</b>
        <span>{timeLabel}{item.kind === 'VIDEO' ? ` · 영상 ${Math.round((item.durationMs ?? 0) / 1000)}초` : ''}{item.purgedAt ? ' · 원본 정리됨' : ''}</span>
      </div>
      {index > 0 ? <button type="button" className="viewer__nav viewer__nav--l" aria-label="이전" onClick={() => go(-1)}>‹</button> : null}
      {index < items.length - 1 ? <button type="button" className="viewer__nav viewer__nav--r" aria-label="다음" onClick={() => go(1)}>›</button> : null}
    </div>
  );
}

function Stage({ item }: { item: MediaItem }) {
  const full = useObjectUrl(item.blob ?? item.thumbBlob);
  if (!full) return <div className="viewer__empty">원본이 없어요</div>;
  if (item.kind === 'VIDEO' && item.blob) {
    return <video src={full} controls playsInline autoPlay className="viewer__media" />;
  }
  return <img src={full} alt="" className="viewer__media" draggable={false} />;
}
