import React from 'react';
import { ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../../state/AppProvider';
import { AppText, Card, Screen, ScreenHeader } from '../../components/UI';
import { ABOUT_TEXT, APP_NAME, PRIVACY_TEXT, TERMS_TEXT } from '../../core/constants';
import type { RootStackParamList } from '../../navigation/types';

type ScreenName = 'About' | 'Terms' | 'Privacy';
type Props = NativeStackScreenProps<RootStackParamList, ScreenName>;

const CONTENT: Record<ScreenName, { title: string; body: string; emoji: string }> = {
  About: { title: 'من نحن', body: ABOUT_TEXT, emoji: '💜' },
  Terms: { title: 'الشروط والأحكام', body: TERMS_TEXT, emoji: '📄' },
  Privacy: { title: 'سياسة الخصوصية', body: PRIVACY_TEXT, emoji: '🔒' },
};

export default function StaticContentScreen({ navigation, route }: Props) {
  const { theme, settings } = useApp();
  const name = route.name as ScreenName;
  const content = CONTENT[name] ?? CONTENT.About;

  return (
    <Screen>
      <ScreenHeader title={content.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Card style={{ gap: 14 }}>
          {content.body.split('\n\n').map((para, i) => (
            <AppText key={i} size={14.5} color={theme.c.textMuted} style={{ lineHeight: 25 }}>
              {para}
            </AppText>
          ))}
          <AppText size={12} color={theme.c.textMuted} align="center">
            {APP_NAME} © {new Date().getFullYear()} — {settings.slogan}
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
  );
}
