import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import { TopBar, useObjectUrl } from '../components/ui';
import type { MediaItem } from '../db/db';
import { listDogKept } from '../db/repo';

/** 폴더 검수. 옮기기·A컷·미지정 배정은 4주차. 지금은 폴더 내용 확인만. */
export function FolderReviewScreen() {
  const navigate = useNavigate();
  const { dogId = '' } = useParams();
  const { data: items = [] } = useQuery({ queryKey: ['dog-kept', dogId], queryFn: () => listDogKept(dogId) });
  return (
    <div className="screen">
      <TopBar title="폴더 검수" onBack={() => navigate(-1)} right={<span className="sub">{items.length}개</span>} />
      <main className="body">
        <div className="grid3">{items.map((m) => <Cell key={m.id} m={m} />)}</div>
        <span className="sub">옮기기 · A컷 · 미지정 배정은 4주차에 붙어요</span>
      </main>
    </div>
  );
}

function Cell({ m }: { m: MediaItem }) {
  const url = useObjectUrl(m.thumbBlob ?? m.blob);
  return (
    <div className="cell">
      {url ? <img src={url} alt="" /> : null}
      {m.kind === 'VIDEO' ? <span className="cell__dur">{Math.round((m.durationMs ?? 0) / 1000)}초</span> : null}
    </div>
  );
}
