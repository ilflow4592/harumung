import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { FlatList, Text, View } from 'react-native';

import { Card, DogAvatar, PrimaryButton, Screen, SexBadge } from '@/components/ui';
import { Palette, Spacing } from '@/constants/theme';
import { listActiveDogs } from '@/db/repo';

export default function DogsScreen() {
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });
  return (
    <Screen style={{ backgroundColor: Palette.surface }}>
      <FlatList
        data={dogs}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: Spacing.xl, gap: 10 }}
        renderItem={({ item }) => (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <DogAvatar name={item.name} sex={item.sex} />
            <Text style={{ fontSize: 15, fontWeight: '700', flex: 1 }}>{item.name}</Text>
            <SexBadge sex={item.sex} />
          </Card>
        )}
        ListFooterComponent={
          <View style={{ paddingTop: 10 }}>
            <Link href="/dogs/form" asChild>
              <PrimaryButton label="강아지 등록" onPress={() => undefined} />
            </Link>
          </View>
        }
      />
    </Screen>
  );
}
