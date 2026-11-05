import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton, Screen } from '@/components/ui';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { createDog } from '@/db/repo';

type Sex = 'MALE' | 'FEMALE';

const normalizePhone = (s: string) => s.replace(/[^0-9]/g, '');
const isPhone = (s: string) => /^01[016789][0-9]{7,8}$/.test(s);

export default function DogFormScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [showPhone2, setShowPhone2] = useState(false);
  const [memo, setMemo] = useState('');

  const p1 = normalizePhone(phone1);
  const p2 = normalizePhone(phone2);
  const valid = name.trim().length > 0 && sex !== null && isPhone(p1) && (p2.length === 0 || isPhone(p2));

  const submit = async () => {
    if (!valid || !sex) return;
    await createDog({
      name: name.trim(),
      sex,
      thumbnailPath: null, // 정면 사진 촬영은 1주차에 붙인다
      memo: memo.trim() || null,
      phones: [p1, p2],
    });
    await qc.invalidateQueries({ queryKey: ['dogs'] });
    await qc.invalidateQueries({ queryKey: ['folders'] });
    router.back();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.photoBox}>
          <Text style={{ color: Palette.mint, fontWeight: '700', fontSize: 12 }}>정면 사진</Text>
          <Text style={styles.help}>목록 썸네일로 쓰여요 (1주차)</Text>
        </View>

        <Field label="강아지 이름" required>
          <TextInput value={name} onChangeText={setName} placeholder="예: 콩이" style={styles.input} maxLength={20} />
        </Field>

        <Field label="성별" required help="하나만 선택돼요. 다른 쪽을 고르면 자동으로 해제">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <SexCheck label="남아" checked={sex === 'MALE'} onPress={() => setSex('MALE')} tone="blue" />
            <SexCheck label="여아" checked={sex === 'FEMALE'} onPress={() => setSex('FEMALE')} tone="pink" />
          </View>
        </Field>

        <Field label="보호자 연락처" required help="하루멍 링크를 알림톡·문자로 보내는 데만 써요">
          <TextInput value={phone1} onChangeText={setPhone1} placeholder="010-0000-0000" keyboardType="phone-pad" style={styles.input} />
          {showPhone2 ? (
            <TextInput value={phone2} onChangeText={setPhone2} placeholder="두 번째 연락처" keyboardType="phone-pad" style={styles.input} />
          ) : (
            <Pressable onPress={() => setShowPhone2(true)} style={{ paddingVertical: 8 }}>
              <Text style={{ color: Palette.blue, fontWeight: '700', fontSize: 13 }}>+ 연락처 하나 더 (최대 2개)</Text>
            </Pressable>
          )}
        </Field>

        <Field label="메모" optional>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder="알레르기, 성향, 주의할 점"
            multiline
            style={[styles.input, { height: 72, paddingTop: 12 }]}
          />
        </Field>
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <PrimaryButton label="등록하기" onPress={submit} disabled={!valid} />
      </SafeAreaView>
    </Screen>
  );
}

function Field({
  label,
  required,
  optional,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>
        {label} {required ? <Text style={{ color: Palette.pink }}>*</Text> : null}
        {optional ? <Text style={{ fontWeight: '400', color: Palette.textSecondary }}>(선택)</Text> : null}
      </Text>
      {children}
      {help ? <Text style={styles.help}>{help}</Text> : null}
    </View>
  );
}

/** 체크박스 2개, 하나만 선택되는 성별 입력 */
function SexCheck({ label, checked, onPress, tone }: { label: string; checked: boolean; onPress: () => void; tone: 'blue' | 'pink' }) {
  const fg = tone === 'blue' ? Palette.blueDark : Palette.pink;
  const bg = tone === 'blue' ? Palette.blueLight : Palette.pinkLight;
  const border = tone === 'blue' ? Palette.blue : Palette.pink;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[styles.sexBox, checked && { backgroundColor: bg, borderColor: border }]}
    >
      <View style={[styles.checkbox, checked && { backgroundColor: border, borderColor: border }]}>
        {checked ? <Text style={{ color: Palette.white, fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: checked ? fg : Palette.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: Spacing.xl, gap: Spacing.xl, paddingBottom: 120 },
  photoBox: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 36,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Palette.mintMid,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: { fontSize: 13, fontWeight: '700', color: Palette.text },
  help: { fontSize: 12, color: Palette.textSecondary },
  input: {
    height: 48,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Palette.line,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Palette.text,
  },
  sexBox: {
    flex: 1,
    height: 48,
    borderRadius: Radius.control,
    borderWidth: 1.5,
    borderColor: Palette.line,
    backgroundColor: Palette.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: Palette.line, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: Spacing.xl, borderTopWidth: 1, borderTopColor: Palette.line, backgroundColor: Palette.white },
});
