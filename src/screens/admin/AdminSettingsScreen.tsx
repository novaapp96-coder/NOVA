import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Field, Screen, ScreenHeader } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminSettings'>;

export default function AdminSettingsScreen({ navigation }: Props) {
  const { theme, user, settings, toast, confirm, refreshAll } = useApp();
  const [supportPhone, setSupportPhone] = useState(settings.supportPhone);
  const [deliveryFee, setDeliveryFee] = useState(String(settings.deliveryFee));
  const [freeThreshold, setFreeThreshold] = useState(String(settings.freeDeliveryThreshold));
  const [announcement, setAnnouncement] = useState(settings.announcement);
  const [slogan, setSlogan] = useState(settings.slogan);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!isAdmin(user)) return;
    setSaving(true);
    try {
      await adminRepository.updateSettings(user, {
        supportPhone: supportPhone.trim(),
        deliveryFee: parseInt(deliveryFee || '0', 10) || 0,
        freeDeliveryThreshold: parseInt(freeThreshold || '0', 10) || 0,
        announcement: announcement.trim(),
        slogan: slogan.trim(),
      });
      // reload settings into the app state
      await refreshAll();
      toast('تم حفظ الإعدادات ✅', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!isAdmin(user)) return;
    const ok = await confirm({
      title: 'إعادة ضبط البيانات',
      message: 'سيتم حذف كل الطلبات والحسابات والتعديلات والعودة للبيانات التجريبية. لا يمكن التراجع.',
      confirmText: 'إعادة الضبط',
      destructive: true,
    });
    if (!ok) return;
    try {
      await adminRepository.resetDemoData(user);
      toast('تمت إعادة الضبط. يرجى تسجيل الدخول مجددًا.', 'success');
      const { authRepository } = await import('../../repositories/authRepository');
      await authRepository.logout();
      const { localDatabase } = await import('../../data/database');
      await localDatabase.read();
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader title="إعدادات المتجر" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14 }}>
            <AppText size={16} weight="bold">
              بيانات المتجر
            </AppText>
            <Field label="الشعار" value={slogan} onChangeText={setSlogan} icon="format-quote-close" />
            <Field
              label="رقم التواصل (يظهر للعميلات)"
              value={supportPhone}
              onChangeText={setSupportPhone}
              keyboardType="phone-pad"
              maxLength={10}
              icon="phone-outline"
            />
            <Field label="شريط الإعلان (الرئيسية)" value={announcement} onChangeText={setAnnouncement} icon="bullhorn-outline" />
          </Card>

          <Card style={{ gap: 14 }}>
            <AppText size={16} weight="bold">
              التوصيل
            </AppText>
            <Field label="رسوم التوصيل (دج)" value={deliveryFee} onChangeText={setDeliveryFee} keyboardType="number-pad" />
            <Field label="حد الشحن المجاني (دج)" value={freeThreshold} onChangeText={setFreeThreshold} keyboardType="number-pad" />
            <AppText size={12.5} color={theme.c.textMuted}>
              تُحتسب رسوم التوصيل تلقائيًا في السلة وصفحة الدفع.
            </AppText>
          </Card>

          <Button title="حفظ الإعدادات" icon="content-save-outline" loading={saving} onPress={save} />
          <Button title="إعادة ضبط البيانات التجريبية" variant="danger" icon="restore-alert" onPress={reset} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
