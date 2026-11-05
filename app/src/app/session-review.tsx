import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DogAvatar, PrimaryButton, Screen } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { finishSessionReview, listActiveDogs, listSessionMedia, type SessionMediaRow } from '@/db/repo';
import { useCaptureStore } from '@/store/capture';

const UNASSIGNED = '__unassigned__';

export default function SessionReviewScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { sessionId, reset } = useCaptureStore();
  const { data: items = [] } = useQuery({
    queryKey: ['session-media', sessionId],
    queryFn: () => (sessionId ? listSessionMedia(sessionId) : Promise.resolve([])),
    enabled: !!sessionId,
  });
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  const [deleted, setDeleted] = useState<Set<string>>(new Set());

  // 강아지별 섹션. 다중 선택 사진은 여러 섹션에 나온다. 미지정은 맨 위.
  const sections = useMemo(() => {
    const map = new Map<string, SessionMediaRow[]>();
    for (const m of items) {
      const keys = m.dogIds.length ? m.dogIds : [UNASSIGNED];
      for (const k of keys) map.set(k, [...(map.get(k) ?? []), m]);
    }
    const ordered = [UNASSIGNED, ...dogs.map((d) => d.id)].filter((k) => map.has(k));
    return ordered.map((k) => ({ key: k, dog: dogs.find((d) => d.id === k) ?? null, media: map.get(k) ?? [] }));
  }, [items, dogs]);

  const toggle = (id: string) =>
    setDeleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const keptCount = items.length - deleted.size;

  const save = () => {
    if (!sessionId) return;
    const run = async () => {
      await finishSessionReview(sessionId, items.filter((m) => !deleted.has(m.id)).map((m) => m.id));
      await qc.invalidateQueries({ queryKey: ['folders'] });
      reset();
      router.replace('/folders');
    };
    if (deleted.size === 0) {
      run();
      return;
    }
    Alert.alert(`${deleted.size}개를 삭제할까요?`, '삭제는 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제하고 저장', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <Screen>
      <View style={styles.hintRow}>
        <Text style={styles.hint}>지울 사진만 탭하세요. 나머지는 모두 저장돼요</Text>
        <Pressable onPress={() => setDeleted(new Set())} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>전체 가져가기</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: 14, paddingBottom: 140 }}>
        {sections.map((s) => {
          const delInSection = s.media.filter((m) => deleted.has(m.id)).length;
          return (
            <View key={s.key} style={{ gap: 8 }}>
              <View style={styles.sectionHeader}>
                {s.dog ? <DogAvatar name={s.dog.name} sex={s.dog.sex} size={32} /> : <View style={styles.unassignedAvatar} />}
                <Text style={styles.sectionTitle}>{s.dog?.name ?? '미지정'}</Text>
                <Text style={[styles.sectionSub, !s.dog && { color: Palette.pink, fontWeight: '700' }]}>
                  {s.media.length}개 · 삭제 {delInSection}
                  {!s.dog ? ' · 저장 후 폴더 검수에서 배정' : ''}
                </Text>
                <Pressable
                  onPress={() => setDeleted((prev) => new Set([...prev, ...s.media.map((m) => m.id)]))}
                  style={styles.smallButton}
                >
                  <Text style={styles.smallButtonText}>전체 삭제</Text>
                </Pressable>
              </View>
              <View style={styles.grid}>
                {s.media.map((m) => {
                  const isDel = deleted.has(m.id);
                  return (
                    <Pressable key={m.id} onPress={() => toggle(m.id)} style={[styles.cell, isDel && styles.cellDeleted]}>
                      <Image source={{ uri: m.thumbPath ?? m.localPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      {m.kind === 'VIDEO' ? (
                        <View style={styles.durationBadge}>
                          <Text style={styles.durationText}>{Math.round((m.durationMs ?? 0) / 1000)}초</Text>
                        </View>
                      ) : null}
                      {isDel ? (
                        <View style={styles.delBadge}>
                          <Text style={{ color: Palette.white, fontSize: 11, fontWeight: '700' }}>✕</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 14, fontWeight: '700' }}>
            가져가기 {keptCount}개 · <Text style={{ color: Palette.pink }}>삭제 {deleted.size}개</Text>
          </Text>
          <Text style={styles.hint}>삭제는 되돌릴 수 없어요</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PrimaryButton label="계속 촬영" variant="outline" onPress={() => router.replace('/camera')} style={{ flex: 1 }} />
          <PrimaryButton label="저장하고 폴더로" onPress={save} style={{ flex: 1.6 }} />
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const CELL = 80;

const styles = StyleSheet.create({
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.xl, paddingTop: 12 },
  hint: { flex: 1, fontSize: 12, color: Palette.textSecondary },
  smallButton: { height: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: Palette.line, justifyContent: 'center' },
  smallButtonText: { fontSize: 12, fontWeight: '700', color: Palette.text },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionSub: { flex: 1, fontSize: 12, color: Palette.textSecondary },
  unassignedAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: Palette.gray },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: CELL, height: CELL, borderRadius: 10, overflow: 'hidden', backgroundColor: Palette.line },
  cellDeleted: { opacity: 0.6, borderWidth: 2, borderColor: Palette.pink },
  durationBadge: { position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(17,24,39,0.7)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  durationText: { color: Palette.white, fontSize: 10, fontWeight: '700' },
  delBadge: { position: 'absolute', right: 4, top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: Palette.pink, alignItems: 'center', justifyContent: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.xl,
    gap: 10,
    backgroundColor: Palette.surface,
    borderTopWidth: 1,
    borderTopColor: Palette.line,
  },
});
