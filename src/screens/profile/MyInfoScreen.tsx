import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Field, Screen, ScreenHeader } from '../../components/UI';
import { isValidEmail, isValidPhone } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MyInfo'>;

export default function MyInfoScreen({ navigation }: Props) {
  const { theme, user, updateProfile, changePassword, toast } = useApp();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
  const [changing, setChanging] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 3) e.name = 'الاسم قصير جدًا.';
    if (!isValidPhone(phone)) e.phone = 'رقم هاتف جزائري غير صحيح.';
    if (email.trim() && !isValidEmail(email)) e.email = 'البريد الإلكتروني غير صحيح.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim(), email: email.trim() });
    } catch (err) {
      toast(messageOf(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const change = async () => {
    const e: Record<string, string> = {};
    if (!current) e.current = 'يرجى إدخال كلمة المرور الحالية.';
    if (next.length < 6) e.next = 'كلمة المرور الجديدة 6 أحرف على الأقل.';
    if (next !== confirmPwd) e.confirmPwd = 'كلمتا المرور غير متطابقتين.';
    setPwdErrors(e);
    if (Object.keys(e).length) return;
    setChanging(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirmPwd('');
      setPwdErrors({});
    } catch (err) {
      toast(messageOf(err), 'error');
    } finally {
      setChanging(false);
    }
  };

  if (!user) return null;

  return (
    <Screen>
      <ScreenHeader title="معلومات الحساب" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14 }}>
            <AppText size={16} weight="bold">
              بياناتي
            </AppText>
            <Field label="الاسم الكامل" value={name} onChangeText={setName} error={errors.name} icon="account-outline" />
            <Field
              label="رقم الهاتف"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={10}
              error={errors.phone}
              icon="phone-outline"
            />
            <Field
              label="البريد الإلكتروني (اختياري)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              icon="email-outline"
            />
            <Button title="حفظ التعديلات" icon="content-save-outline" loading={saving} onPress={save} />
          </Card>

          <Card style={{ gap: 14 }}>
            <AppText size={16} weight="bold">
              تغيير كلمة المرور
            </AppText>
            <AppText size={12.5} color={theme.c.textMuted}>
              كلمة المرور مُشفّرة ولا تُحفظ كنص واضح. اختاري كلمة مرور قوية.
            </AppText>
            <Field label="كلمة المرور الحالية" value={current} onChangeText={setCurrent} secureTextEntry error={pwdErrors.current} icon="lock-outline" />
            <Field label="كلمة المرور الجديدة" value={next} onChangeText={setNext} secureTextEntry error={pwdErrors.next} icon="lock-plus-outline" />
            <Field label="تأكيد كلمة المرور الجديدة" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry error={pwdErrors.confirmPwd} icon="lock-check-outline" />
            <Button title="تحديث كلمة المرور" variant="outline" loading={changing} onPress={change} />
          </Card>

          <View style={{ backgroundColor: theme.c.surfaceAlt, borderRadius: theme.radius.md, padding: 14, gap: 4 }}>
            <AppText size={12.5} color={theme.c.textMuted}>
              عضوة منذ: {new Date(user.createdAt).toLocaleDateString('ar-DZ')}
            </AppText>
            <AppText size={12.5} color={theme.c.textMuted}>
              نوع الحساب: {user.role === 'admin' ? 'إدارة' : 'عميلة'}
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
