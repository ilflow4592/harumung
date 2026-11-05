import { Text } from 'react-native';

import { Screen } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';

/** 앨범 생성·알림톡 발송은 4주차. */
export default function SendScreen() {
  return (
    <Screen style={{ padding: Spacing.xl }}>
      <Text style={{ fontSize: 12, color: Palette.textSecondary }}>서버 연동 후 구현 (4주차)</Text>
    </Screen>
  );
}
