import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';

import { Palette } from '@/constants/theme';
import { ensureSchema } from '@/db/client';

ensureSchema();

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: Palette.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: Palette.white },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="folders/index" options={{ title: '오늘 폴더', headerShown: false }} />
        <Stack.Screen name="folders/[dogId]" options={{ title: '폴더 검수' }} />
        <Stack.Screen name="camera" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="session-review" options={{ title: '이번 촬영 검수', headerBackVisible: false }} />
        <Stack.Screen name="dogs/index" options={{ title: '강아지' }} />
        <Stack.Screen name="dogs/form" options={{ title: '강아지 등록' }} />
        <Stack.Screen name="send" options={{ title: '하루멍 보내기' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
      </Stack>
    </QueryClientProvider>
  );
}
