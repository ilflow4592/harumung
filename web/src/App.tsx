import { Navigate, Route, Routes } from 'react-router-dom';

import { AttendanceScreen } from './screens/Attendance';
import { CameraScreen } from './screens/Camera';
import { DogFormScreen } from './screens/DogForm';
import { DogsScreen } from './screens/Dogs';
import { FolderReviewScreen } from './screens/FolderReview';
import { FoldersScreen } from './screens/Folders';
import { SendScreen } from './screens/Send';
import { SessionReviewScreen } from './screens/SessionReview';
import { SettingsScreen } from './screens/Settings';

export default function App() {
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
      <Route path="/send" element={<SendScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to="/folders" replace />} />
    </Routes>
  );
}
