import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Field, Screen, ScreenHeader } from '../../components/UI';
import { registerErrors } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { theme, register, toast } = useApp();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const errs = registerErrors({ name, phone, email, password, confirm });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await register({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, password });
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="إنشاء حساب" subtitle="دقيقة واحدة وتصبحي جزءًا من Nova" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14 }}>
            <Field
              label="الاسم الكامل"
              placeholder="مثال: أمينة بلقاسم"
              value={name}
              onChangeText={setName}
              error={errors.name}
              icon="account-outline"
              returnKeyType="next"
            />
            <Field
              label="رقم الهاتف"
              placeholder="0550123456"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
              icon="phone-outline"
              maxLength={10}
              returnKeyType="next"
            />
            <Field
              label="البريد الإلكتروني (اختياري)"
              placeholder="name@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              icon="email-outline"
            />
            <Field
              label="كلمة المرور"
              placeholder="6 أحرف على الأقل"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={errors.password}
              icon="lock-outline"
            />
            <Field
              label="تأكيد كلمة المرور"
              placeholder="أعيدي كتابة كلمة المرور"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              error={errors.confirm}
              icon="lock-check-outline"
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Button title="إنشاء الحساب" icon="account-plus-outline" loading={loading} onPress={submit} />
          </Card>
          <AppText size={12} color={theme.c.textMuted} align="center">
            بإنشائكِ الحساب فأنتِ توافقين على الشروط والأحكام وسياسة الخصوصية.
          </AppText>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'center', gap: 6 }}>
            <AppText size={13} color={theme.c.textMuted}>
              لديكِ حساب؟
            </AppText>
            <AppText size={13} weight="bold" color={theme.c.primary} onPress={() => navigation.goBack()}>
              تسجيل الدخول
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
