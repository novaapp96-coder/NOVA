import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Field, Screen } from '../../components/UI';
import { APP_NAME, DEMO_ADMIN, DEMO_USER } from '../../core/constants';
import { messageOf } from '../../data/errors';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { theme, login, toast } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password) {
      toast('يرجى إدخال رقم الهاتف وكلمة المرور.', 'error');
      return;
    }
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  const fill = (id: string, pwd: string) => {
    setIdentifier(id);
    setPassword(pwd);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, gap: 22 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 30,
                backgroundColor: theme.c.primary,
                alignItems: 'center',
                justifyContent: 'center',
                ...theme.shadow(14),
              }}
            >
              <MaterialCommunityIcons name="shopping-outline" size={44} color="#fff" />
            </View>
            <AppText size={30} weight="bold" color={theme.c.primary}>
              {APP_NAME}
            </AppText>
            <AppText size={14} color={theme.c.textMuted} align="center">
              {theme.dark ? 'أهلًا بعودتكِ 💜' : 'تسوق أسهل، وخدمة تستحق ثقتك.'}
            </AppText>
          </View>

          <Card style={{ gap: 14 }}>
            <AppText size={18} weight="bold">
              تسجيل الدخول
            </AppText>
            <Field
              label="رقم الهاتف أو البريد الإلكتروني"
              placeholder="0550123456"
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
              icon="account-outline"
            />
            <Field
              label="كلمة المرور"
              placeholder="••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secure}
              returnKeyType="done"
              onSubmitEditing={submit}
              icon={secure ? 'lock-outline' : 'lock-open-variant-outline'}
            />
            <Pressable onPress={() => setSecure((s) => !s)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
              <AppText size={12.5} color={theme.c.primary} weight="medium">
                {secure ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور'}
              </AppText>
            </Pressable>
            <Button title="دخول" icon="login" loading={loading} onPress={submit} />
          </Card>

          <View style={{ gap: 8 }}>
            <AppText size={13} color={theme.c.textMuted} align="center">
              ليس لديكِ حساب؟
            </AppText>
            <Button
              title="إنشاء حساب جديد"
              variant="outline"
              onPress={() => navigation.navigate('Register')}
            />
          </View>

          <Card style={{ gap: 10, backgroundColor: theme.c.surfaceAlt }}>
            <AppText size={13} weight="bold" color={theme.c.textMuted}>
              حسابات تجريبية
            </AppText>
            <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
              <Button
                small
                title="عميلة"
                variant="outline"
                onPress={() => fill(DEMO_USER.phone, DEMO_USER.password)}
                style={{ flex: 1 }}
              />
              <Button
                small
                title="إدارة"
                variant="outline"
                onPress={() => fill(DEMO_ADMIN.email, DEMO_ADMIN.password)}
                style={{ flex: 1 }}
              />
            </View>
            <AppText size={11.5} color={theme.c.textMuted} align="center">
              💜 {DEMO_USER.phone} / {DEMO_USER.password} — 🛡️ {DEMO_ADMIN.email} / {DEMO_ADMIN.password}
            </AppText>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
