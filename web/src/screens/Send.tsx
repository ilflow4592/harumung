import { useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';

/** 앨범 생성·알림톡 발송은 서버 연동 후(4주차). */
export function SendScreen() {
  const navigate = useNavigate();
  return (
    <div className="screen">
      <TopBar title="하루멍 보내기" onBack={() => navigate(-1)} />
      <main className="body"><span className="sub">서버 연동 후 구현 (4주차)</span></main>
    </div>
  );
}
