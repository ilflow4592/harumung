/** 사진 편집 렌더. 미리보기와 내보내기가 같은 함수를 쓴다(좌표계: 프레임 px, 내보내기는 s배 확대). */

export type PhotoEdit = {
  rotation: 0 | 90 | 180 | 270;
  /** 프레임 비율 w/h. null이면 회전된 원본 비율(자르기 없음). */
  aspect: number | null;
  zoom: number; // 1 = 프레임을 꽉 채우는 최소 배율
  pan: { x: number; y: number }; // 프레임 px 단위 이동
  brightness: number; // -40 ~ 40
};

export const DEFAULT_EDIT: PhotoEdit = { rotation: 0, aspect: null, zoom: 1, pan: { x: 0, y: 0 }, brightness: 0 };

export function rotatedSize(w: number, h: number, rotation: number): { rw: number; rh: number } {
  return rotation % 180 === 0 ? { rw: w, rh: h } : { rw: h, rh: w };
}

/** 프레임 크기(미리보기 px). 사용 가능한 영역 안에 비율을 맞춰 넣는다. */
export function frameSize(availW: number, availH: number, imgW: number, imgH: number, edit: PhotoEdit): { fw: number; fh: number } {
  const { rw, rh } = rotatedSize(imgW, imgH, edit.rotation);
  const aspect = edit.aspect ?? rw / rh;
  let fw = availW;
  let fh = fw / aspect;
  if (fh > availH) { fh = availH; fw = fh * aspect; }
  return { fw: Math.round(fw), fh: Math.round(fh) };
}

/** 이미지가 프레임을 항상 덮도록 pan을 가둔다. */
export function clampPan(fw: number, fh: number, imgW: number, imgH: number, edit: PhotoEdit): { x: number; y: number } {
  const { rw, rh } = rotatedSize(imgW, imgH, edit.rotation);
  const base = Math.max(fw / rw, fh / rh) * edit.zoom;
  const maxX = Math.max(0, (rw * base - fw) / 2);
  const maxY = Math.max(0, (rh * base - fh) / 2);
  return { x: Math.max(-maxX, Math.min(maxX, edit.pan.x)), y: Math.max(-maxY, Math.min(maxY, edit.pan.y)) };
}

/** 프레임 좌표계로 그린다. s는 내보내기 배율(미리보기는 1). */
export function renderEdit(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  fw: number,
  fh: number,
  edit: PhotoEdit,
  s = 1,
): void {
  const { rw, rh } = rotatedSize(img.width, img.height, edit.rotation);
  const base = Math.max(fw / rw, fh / rh) * edit.zoom;
  const pan = clampPan(fw, fh, img.width, img.height, edit);
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, fw, fh);
  ctx.translate(fw / 2 + pan.x, fh / 2 + pan.y);
  ctx.rotate((edit.rotation * Math.PI) / 180);
  ctx.scale(base, base);
  ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);
  ctx.restore();
  if (edit.brightness !== 0) {
    ctx.save();
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalAlpha = Math.min(0.6, Math.abs(edit.brightness) / 100);
    ctx.fillStyle = edit.brightness > 0 ? '#fff' : '#000';
    ctx.fillRect(0, 0, fw, fh);
    ctx.restore();
  }
}

/** 전체 해상도로 내보내기. 프레임 px → 원본 px 배율로 키운다. */
export async function exportEdit(img: ImageBitmap, fw: number, fh: number, edit: PhotoEdit, quality = 0.9): Promise<Blob> {
  const { rw, rh } = rotatedSize(img.width, img.height, edit.rotation);
  const base = Math.max(fw / rw, fh / rh);
  const s = 1 / base; // 프레임 1px = 원본 s px (zoom 1 기준)
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(fw * s);
  canvas.height = Math.round(fh * s);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  renderEdit(ctx, img, fw, fh, edit, s);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('인코딩 실패'))), 'image/jpeg', quality));
}
