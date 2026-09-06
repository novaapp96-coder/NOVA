import { Platform, TextStyle, ViewStyle } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  star: string;
  overlay: string;
  onPrimary: string;
}

export const lightColors: ThemeColors = {
  bg: '#FAF7FF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4EFFF',
  primary: '#7C5CFC',
  primaryDark: '#5B3FD6',
  primarySoft: '#EFEAFF',
  accent: '#FF7BA9',
  accentSoft: '#FFE7F0',
  text: '#241C3B',
  textMuted: '#7A7290',
  border: '#EDE7F8',
  success: '#1FA971',
  successSoft: '#E3F7EE',
  warning: '#E8930C',
  warningSoft: '#FDF1DC',
  danger: '#E2446B',
  dangerSoft: '#FCE7ED',
  star: '#FFB020',
  overlay: 'rgba(24, 14, 48, 0.45)',
  onPrimary: '#FFFFFF',
};

export const darkColors: ThemeColors = {
  bg: '#141020',
  surface: '#1E1832',
  surfaceAlt: '#251D3D',
  primary: '#9B84FF',
  primaryDark: '#7C5CFC',
  primarySoft: '#2C2350',
  accent: '#FF92B8',
  accentSoft: '#3A2233',
  text: '#F4F0FF',
  textMuted: '#A79FC4',
  border: '#2E2648',
  success: '#4BD19A',
  successSoft: '#153529',
  warning: '#F5B24D',
  warningSoft: '#3A2E14',
  danger: '#FF7396',
  dangerSoft: '#3D1D28',
  star: '#FFC24D',
  overlay: 'rgba(6, 3, 16, 0.6)',
  onPrimary: '#FFFFFF',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const spacing = (n: number) => n * 4;

export const font = {
  regular: 'Tajawal_400Regular',
  medium: 'Tajawal_500Medium',
  bold: 'Tajawal_700Bold',
};

export const shadow = (level: number = 8): ViewStyle => ({
  shadowColor: '#3A2A6A',
  shadowOpacity: 0.1,
  shadowRadius: level,
  shadowOffset: { width: 0, height: Math.round(level / 2) },
  elevation: Platform.OS === 'android' ? Math.round(level / 2) : 0,
});

export interface AppTheme {
  dark: boolean;
  c: ThemeColors;
  radius: typeof radius;
  spacing: (n: number) => number;
  font: typeof font;
  shadow: (level?: number) => ViewStyle;
  text: (size: number, weight?: keyof typeof font, color?: string) => TextStyle;
}

export function makeTheme(dark: boolean): AppTheme {
  const c = dark ? darkColors : lightColors;
  return {
    dark,
    c,
    radius,
    spacing,
    font,
    shadow,
    text: (size, weight = 'regular', color = c.text) => ({
      fontSize: size,
      fontFamily: font[weight],
      color,
      writingDirection: 'rtl',
      textAlign: 'right',
    }),
  };
}
