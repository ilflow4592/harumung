import { useNavigate } from 'react-router-dom';

import { TopBar } from '../components/ui';

export function SettingsScreen() {
  const navigate = useNavigate();
  return (
    <div className="screen">
      <TopBar title="설정" onBack={() => navigate(-1)} />
      <main className="body"><span className="sub">Wi-Fi 전용 업로드, 테스트 기능 토글 (5주차)</span></main>
    </div>
  );
}
