import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { initPartnerFromUrl, refreshPersonProps, track, trackPageview } from './lib/analytics';
import { runAutoPurge } from './lib/autoPurge';

import { AttendanceScreen } from './screens/Attendance';
import { CameraScreen } from './screens/Camera';
import { DogFormScreen } from './screens/DogForm';
import { DogsScreen } from './screens/Dogs';
import { FolderReviewScreen } from './screens/FolderReview';
import { FoldersScreen } from './screens/Folders';
import { GuideScreen } from './screens/Guide';
import { SendScreen } from './screens/Send';
import { SessionReviewScreen } from './screens/SessionReview';
import { SettingsScreen } from './screens/Settings';

export default function App() {
  const qc = useQueryClient();
  const location = useLocation();
  // 화면 전환마다 pageview
  useEffect(() => { trackPageview(location.pathname + location.search); }, [location.pathname, location.search]);
  // 앱을 열 때 하루 한 번, 보낸 지 N일 지난 원본 정리
  useEffect(() => {
    const partner = initPartnerFromUrl();
    track('app_opened', { has_partner: !!partner });
    refreshPersonProps();
    runAutoPurge().then((r) => {
      if (r) track('auto_purge_ran', { count: r.count, freed_bytes: r.freed });
      if (r && r.count > 0) qc.invalidateQueries();
    }).catch(() => undefined);
  }, [qc]);
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/folders" replace />} />
      <Route path="/folders" element={<FoldersScreen />} />
      <Route path="/folders/:dogId" element={<FolderReviewScreen />} />
      <Route path="/attendance" element={<AttendanceScreen />} />
      <Route path="/camera" element={<CameraScreen />} />
      <Route path="/session-review" element={<SessionReviewScreen />} />
      <Route path="/dogs" element={<DogsScreen />} />
      <Route path="/dogs/new" element={<DogFormScreen />} />
      <Route path="/dogs/:dogId/edit" element={<DogFormScreen />} />
      <Route path="/send" element={<SendScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/guide" element={<GuideScreen />} />
      <Route path="*" element={<Navigate to="/folders" replace />} />
    </Routes>
  );
}
