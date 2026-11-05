import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Chip, DogAvatar, PrimaryButton, Screen, SexBadge } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { listTodayFolders } from '@/db/repo';

function todayLabel(): string {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

export default function FoldersScreen() {
  const router = useRouter();
  const { data } = useQuery({
    queryKey: ['folders', new Date().toISOString().slice(0, 10)],
    queryFn: () => listTodayFolders(new Date().toISOString()),
  });
  const perDog = data?.perDog ?? [];
  const total = perDog.reduce((n, f) => n + f.count, 0) + (data?.unassigned ?? 0);

  return (
    <Screen style={{ backgroundColor: Palette.surface }}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.date}>{todayLabel()}</Text>
            <Text style={styles.title}>오늘 폴더</Text>
          </View>
          <Link href="/dogs/form" asChild>
            <Pressable accessibilityLabel="강아지 등록" style={styles.addButton}>
              <Text style={{ color: Palette.mint, fontSize: 22, fontWeight: '700' }}>+</Text>
            </Pressable>
          </Link>
        </View>
        <View style={styles.statsRow}>
          <Stat label="촬영" value={total} bg={Palette.surface} fg={Palette.text} />
          <Stat label="미지정" value={data?.unassigned ?? 0} bg={Palette.pinkLight} fg={Palette.pink} />
          <Stat label="발송 대기" value={perDog.filter((f) => f.count > 0).length} bg={Palette.blueLight} fg={Palette.blueDark} />
        </View>
      </SafeAreaView>

      <FlatList
        data={perDog}
        keyExtractor={(f) => f.dog.id}
        contentContainerStyle={{ padding: Spacing.xl, gap: 10, paddingBottom: 120 }}
        ListHeaderComponent={
          (data?.unassigned ?? 0) > 0 ? (
            <Card style={{ borderColor: Palette.pinkMid, borderWidth: 1.5, marginBottom: 4 }}>
              <Text style={{ fontWeight: '700', fontSize: 15 }}>미지정 사진 {data?.unassigned}장</Text>
              <Text style={styles.sub}>폴더 검수에서 강아지를 정해 주세요</Text>
            </Card>
          ) : undefined
        }
        ListEmptyComponent={
          <Card>
            <Text style={{ fontWeight: '700', fontSize: 15 }}>등록된 강아지가 없어요</Text>
            <Text style={styles.sub}>오른쪽 위 + 로 첫 강아지를 등록하세요</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/folders/[dogId]', params: { dogId: item.dog.id } })}>
            <Card style={styles.folderRow}>
              <DogAvatar name={item.dog.name} sex={item.dog.sex} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700' }}>{item.dog.name}</Text>
                  <SexBadge sex={item.dog.sex} />
                </View>
                <Text style={styles.sub}>
                  사진 {item.count}장 · A컷 {item.aCut}장
                </Text>
              </View>
              <Chip label={item.count > 0 ? '발송 대기' : '촬영 중'} tone={item.count > 0 ? 'blue' : 'gray'} />
            </Card>
          </Pressable>
        )}
      />

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <PrimaryButton label="촬영 시작" onPress={() => router.push('/camera')} />
      </SafeAreaView>
    </Screen>
  );
}

function Stat({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={{ fontSize: 12, color: fg }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '700', color: fg }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Palette.white,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.line,
    gap: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 12, color: Palette.textSecondary, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: '700', color: Palette.text },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Palette.mintLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 12, borderRadius: 14, gap: 2 },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  sub: { fontSize: 12, color: Palette.textSecondary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.xl,
    backgroundColor: Palette.surface,
    borderRadius: Radius.card,
  },
});
