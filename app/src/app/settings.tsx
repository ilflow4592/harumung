import { Text } from 'react-native';

import { Screen } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <Screen style={{ padding: Spacing.xl }}>
      <Text style={{ fontSize: 12, color: Palette.textSecondary }}>Wi-Fi 전용 업로드, 테스트 기능 토글 (5주차)</Text>
    </Screen>
  );
}
