/** 하루멍 색 토큰. 디자인 캔버스의 색상 템플릿과 같다. 라이트 모드만 지원. */
export const Palette = {
  white: '#FFFFFF',
  surface: '#F6FAF9',
  line: '#E5E7EB',
  text: '#111827',
  textSecondary: '#4B5563',
  mint: '#0B7A6B',
  mintMid: '#5FD3C0',
  mintLight: '#D7F3EE',
  blue: '#2563EB',
  blueDark: '#1D4ED8',
  blueMid: '#93C5FD',
  blueLight: '#DBEAFE',
  pink: '#C2256D',
  pinkMid: '#F9A8D4',
  pinkLight: '#FCE7F3',
  gray: '#F3F4F6',
  overlay: 'rgba(17,24,39,0.55)',
} as const;

export const Radius = { card: 16, control: 12, badge: 999, thumb: 20 } as const;
export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const Touch = { min: 44, shutter: 76 } as const;

export const sexColors = {
  MALE: { bg: Palette.blueLight, fg: Palette.blueDark, label: '남아' },
  FEMALE: { bg: Palette.pinkLight, fg: Palette.pink, label: '여아' },
} as const;
