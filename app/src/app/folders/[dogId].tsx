import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';

/** 폴더 검수: 옮기기·A컷·미지정 배정. 4주차 구현. 지금은 자리만. */
export default function FolderReviewScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  return (
    <Screen style={styles.body}>
      <Text style={styles.title}>폴더 검수</Text>
      <Text style={styles.sub}>강아지 {dogId}</Text>
      <View style={styles.placeholder}>
        <Text style={styles.sub}>3열 그리드 · 길게 누르면 크게 보기 · 옮기기 / A컷</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.xl, gap: Spacing.md },
  title: { fontSize: 18, fontWeight: '700', color: Palette.text },
  sub: { fontSize: 12, color: Palette.textSecondary },
  placeholder: {
    marginTop: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    alignItems: 'center',
  },
});
