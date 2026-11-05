import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  usePhotoOutput,
  useVideoOutput,
  type Recorder,
} from 'react-native-vision-camera';

import { DogAvatar } from '@/components/ui';
import { Palette, Touch, sexColors } from '@/constants/theme';
import { getOrCreateOpenSession, insertCapturedMedia, listActiveDogs, markSessionReviewing } from '@/db/repo';
import { fileSize, makeThumbnail, persistCapture, processVideo } from '@/lib/media';
import { useCaptureStore } from '@/store/capture';

const MAX_VIDEO_SECONDS = 30;

export default function CameraScreen() {
  const router = useRouter();
  const device = useCameraDevice('back');
  const cam = useCameraPermission();
  const mic = useMicrophonePermission();
  // 촬영 원본은 기기 최대 화질, 영상은 720p로 바로 받는다 (나중 변환 비용 절감)
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'balanced' });
  const videoOutput = useVideoOutput({ targetResolution: { width: 1280, height: 720 }, enableAudio: true, fileType: 'mp4' });
  const recorderRef = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const { sessionId, mode, selectedDogIds, shotCount, setSession, setMode, selectDog, toggleMultiDog, bumpShotCount } =
    useCaptureStore();
  const { data: dogs = [] } = useQuery({ queryKey: ['dogs'], queryFn: listActiveDogs });

  useEffect(() => {
    if (!cam.hasPermission && cam.canRequestPermission) cam.requestPermission();
    if (!mic.hasPermission && mic.canRequestPermission) mic.requestPermission();
  }, [cam, mic]);

  useEffect(() => {
    if (!sessionId) getOrCreateOpenSession().then(setSession);
  }, [sessionId, setSession]);

  const selectedDogs = dogs.filter((d) => selectedDogIds.includes(d.id));
  const nameLabel = selectedDogs.length === 0 ? '미지정' : selectedDogs.map((d) => d.name).join(' · ');

  const takePhoto = useCallback(async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    try {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false }, {});
      const localPath = persistCapture(file.filePath, 'jpg');
      const thumbPath = await makeThumbnail(localPath);
      await insertCapturedMedia({
        sessionId,
        kind: 'PHOTO',
        localPath,
        thumbPath,
        durationMs: null,
        sizeBytes: fileSize(localPath),
        dogIds: selectedDogIds,
      });
      bumpShotCount();
    } finally {
      setBusy(false);
    }
  }, [sessionId, busy, selectedDogIds, bumpShotCount, photoOutput]);

  const toggleRecording = useCallback(async () => {
    if (!sessionId) return;
    if (recording) {
      await recorderRef.current?.stopRecording();
      return;
    }
    // 녹화 시작 시점의 지정 강아지를 고정한다 (녹화 중 전환 불가)
    const dogIdsAtStart = [...selectedDogIds];
    const recorder = await videoOutput.createRecorder({ maxDuration: MAX_VIDEO_SECONDS });
    recorderRef.current = recorder;
    setRecording(true);
    await recorder.startRecording(
      async (filePath) => {
        setRecording(false);
        recorderRef.current = null;
        setBusy(true);
        try {
          const processed = await processVideo(filePath);
          await insertCapturedMedia({
            sessionId,
            kind: 'VIDEO',
            localPath: processed.localPath,
            thumbPath: processed.thumbPath,
            durationMs: processed.durationMs,
            sizeBytes: processed.sizeBytes,
            dogIds: dogIdsAtStart,
          });
          bumpShotCount();
        } finally {
          setBusy(false);
        }
      },
      (error) => {
        console.warn('녹화 실패', error);
        setRecording(false);
        recorderRef.current = null;
      },
    );
  }, [recording, sessionId, selectedDogIds, bumpShotCount, videoOutput]);

  const close = useCallback(async () => {
    if (recording) await recorderRef.current?.stopRecording();
    if (sessionId && shotCount > 0) {
      await markSessionReviewing(sessionId);
      router.replace('/session-review');
    } else {
      router.back();
    }
  }, [recording, sessionId, shotCount, router]);

  if (!device || !cam.hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={{ color: Palette.white }}>카메라 권한이 필요해요</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        outputs={[photoOutput, videoOutput]}
        enableNativeTapToFocusGesture
        onError={(e) => console.warn('카메라 오류', e)}
      />

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable accessibilityLabel="촬영 마치고 검수" onPress={close} style={styles.roundButton}>
          <Text style={styles.roundButtonText}>✕</Text>
        </Pressable>
        <View style={styles.pill}>
          <Text style={styles.pillText}>오늘 {shotCount}장</Text>
        </View>
        <Pressable
          accessibilityLabel={mode === 'photo' ? '영상 모드로' : '사진 모드로'}
          disabled={recording}
          onPress={() => setMode(mode === 'photo' ? 'video' : 'photo')}
          style={styles.roundButton}
        >
          <Text style={styles.roundButtonText}>{mode === 'photo' ? '영상' : '사진'}</Text>
        </Pressable>
      </SafeAreaView>

      <View style={styles.nameCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.dot, { backgroundColor: selectedDogs.length ? Palette.mint : Palette.textSecondary }]} />
          <Text style={styles.name}>{nameLabel}</Text>
          {selectedDogs.length === 1 ? (
            <View style={[styles.sexBadge, { backgroundColor: sexColors[selectedDogs[0].sex].bg }]}>
              <Text style={{ color: sexColors[selectedDogs[0].sex].fg, fontSize: 12, fontWeight: '700' }}>
                {sexColors[selectedDogs[0].sex].label}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.nameSub}>
          {selectedDogs.length
            ? `지금 찍는 ${mode === 'photo' ? '사진' : '영상'}은 ${nameLabel} 폴더로 저장돼요`
            : '폴더 검수에서 나중에 정해요'}
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <View style={styles.stripHeader}>
          <Text style={styles.stripTitle}>오늘 등원 {dogs.length}마리</Text>
          <Text style={styles.stripHint}>길게 누르면 여러 마리 선택</Text>
        </View>
        <FlatList
          horizontal
          data={dogs}
          keyExtractor={(d) => d.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
          renderItem={({ item }) => {
            const selected = selectedDogIds.includes(item.id);
            return (
              <Pressable
                disabled={recording}
                onPress={() => selectDog(item.id)}
                onLongPress={() => toggleMultiDog(item.id)}
                style={{ alignItems: 'center', gap: 6 }}
              >
                <DogAvatar name={item.name} sex={item.sex} size={60} selected={selected} />
                <Text style={[styles.stripName, selected && { fontWeight: '700' }]}>{item.name}</Text>
              </Pressable>
            );
          }}
        />
        <View style={styles.controls}>
          <Pressable accessibilityLabel="오늘 폴더 보기" onPress={close} style={styles.sideButton}>
            <Text style={{ color: Palette.mint, fontWeight: '700' }}>폴더</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={mode === 'photo' ? '촬영' : recording ? '녹화 종료' : '녹화 시작'}
            onPress={mode === 'photo' ? takePhoto : toggleRecording}
            disabled={busy}
            style={[styles.shutter, recording && { backgroundColor: Palette.pink }]}
          >
            <View style={[styles.shutterInner, recording && { borderRadius: 8, width: 28, height: 28 }]} />
          </Pressable>
          <View style={styles.sideButton} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.text },
  center: { flex: 1, backgroundColor: Palette.text, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8 },
  roundButton: {
    width: Touch.min,
    height: Touch.min,
    borderRadius: Touch.min / 2,
    backgroundColor: Palette.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: { color: Palette.white, fontWeight: '700', fontSize: 13 },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Palette.overlay, justifyContent: 'center' },
  pillText: { color: Palette.white, fontSize: 13, fontWeight: '500' },
  nameCard: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.94)',
    alignItems: 'center',
    gap: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: 26, fontWeight: '700', color: Palette.text },
  nameSub: { fontSize: 12, color: Palette.textSecondary },
  sexBadge: { height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
  bottom: { backgroundColor: 'rgba(17,24,39,0.72)', paddingTop: 14, gap: 14 },
  stripHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  stripTitle: { color: Palette.white, fontSize: 12, fontWeight: '700' },
  stripHint: { color: '#D1D5DB', fontSize: 12 },
  stripName: { color: Palette.white, fontSize: 12, fontWeight: '500' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 36, paddingBottom: 12 },
  sideButton: { width: 52, height: 52, borderRadius: 16, backgroundColor: Palette.mintLight, alignItems: 'center', justifyContent: 'center' },
  shutter: {
    width: Touch.shutter,
    height: Touch.shutter,
    borderRadius: Touch.shutter / 2,
    borderWidth: 5,
    borderColor: Palette.white,
    backgroundColor: Palette.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: Palette.mintMid },
});
