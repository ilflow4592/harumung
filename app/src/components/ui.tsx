import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Palette, Radius, Touch, sexColors } from '@/constants/theme';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = 'solid',
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'outline' | 'ghost';
  style?: StyleProp<ViewStyle>;
}) {
  const base =
    variant === 'solid'
      ? { backgroundColor: Palette.mint, borderColor: Palette.mint }
      : variant === 'outline'
        ? { backgroundColor: Palette.white, borderColor: Palette.mint }
        : { backgroundColor: Palette.white, borderColor: Palette.line };
  const color = variant === 'solid' ? Palette.white : variant === 'outline' ? Palette.mint : Palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, base, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function SexBadge({ sex }: { sex: 'MALE' | 'FEMALE' }) {
  const c = sexColors[sex];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{c.label}</Text>
    </View>
  );
}

export function Chip({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'mint' | 'blue' | 'pink' }) {
  const tones = {
    gray: { bg: Palette.gray, fg: Palette.textSecondary },
    mint: { bg: Palette.mintLight, fg: Palette.mint },
    blue: { bg: Palette.blueLight, fg: Palette.blueDark },
    pink: { bg: Palette.pinkLight, fg: Palette.pink },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: tones.bg }]}>
      <Text style={[styles.badgeText, { color: tones.fg }]}>{label}</Text>
    </View>
  );
}

/** 강아지 썸네일 자리. 사진이 없으면 이름 첫 글자. */
export function DogAvatar({
  name,
  sex,
  size = 48,
  selected = false,
}: {
  name: string;
  sex: 'MALE' | 'FEMALE';
  size?: number;
  selected?: boolean;
}) {
  const c = sexColors[sex];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        backgroundColor: c.bg,
        borderWidth: 3,
        borderColor: selected ? Palette.mintMid : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.fg, fontWeight: '700', fontSize: size * 0.34 }}>{name.slice(0, 1)}</Text>
    </View>
  );
}

export function Screen({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.white },
  card: {
    backgroundColor: Palette.white,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Palette.line,
    padding: 14,
  },
  button: {
    minHeight: 52,
    borderRadius: Radius.control,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  badge: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: Radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: Touch.min / 2,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
