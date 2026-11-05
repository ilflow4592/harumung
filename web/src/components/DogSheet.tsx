import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { Dog } from '../db/db';
import { useCaptureStore } from '../store/capture';
import { DogAvatar, SexBadge } from './ui';

/** 강아지를 누르면 아래서 올라오는 메뉴. 촬영 시작은 그 강아지를 지정한 채 카메라로 간다. */
export function DogSheet({ dog, count, onClose }: { dog: Dog | null; count?: number; onClose: () => void }) {
  const navigate = useNavigate();
  const setSelected = useCaptureStore((s) => s.setSelected);
  const [closing, setClosing] = useState(false);

  // dog가 바뀌면 닫힘 상태 초기화
  useEffect(() => setClosing(false), [dog]);

  if (!dog) return null;

  const close = () => {
    setClosing(true);
    window.setTimeout(onClose, 180);
  };

  const startShoot = () => {
    setSelected([dog.id]);
    navigate('/camera');
  };

  return (
    <div className={`sheet-backdrop ${closing ? 'sheet-backdrop--out' : ''}`} onClick={close}>
      <div className={`sheet ${closing ? 'sheet--out' : ''}`} role="dialog" aria-label={`${dog.name} 메뉴`} onClick={(e) => e.stopPropagation()}>
        <div className="card--row" style={{ padding: '4px 0 8px' }}>
          <DogAvatar name={dog.name} sex={dog.sex} thumb={dog.thumbBlob} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="title">{dog.name}</span>
              <SexBadge sex={dog.sex} />
            </span>
            {count !== undefined ? <span className="sub">오늘 사진 {count}장</span> : null}
          </span>
        </div>
        <button type="button" className="btn" onClick={startShoot}>촬영 시작</button>
        <button type="button" className="btn btn--outline" onClick={() => navigate(`/folders/${dog.id}`)}>사진 폴더 검수</button>
        <button type="button" className="btn btn--ghost" onClick={close}>취소</button>
      </div>
    </div>
  );
}
