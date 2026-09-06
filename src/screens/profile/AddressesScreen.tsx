import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, EmptyState, Field, Row, Screen, ScreenHeader, SelectField } from '../../components/UI';
import { WilayaPicker } from '../../components/Pickers';
import { messageOf } from '../../data/errors';
import type { Address } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Addresses'>;

const emptyForm = { fullName: '', phone: '', wilaya: '', commune: '', street: '', notes: '', isDefault: false };

export default function AddressesScreen({ navigation }: Props) {
  const { theme, addresses, saveAddress, removeAddress, user, confirm, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wilayaOpen, setWilayaOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, fullName: user?.name ?? '', phone: user?.phone ?? '' });
    setErrors({});
    setOpen(true);
  };

  const openEdit = (a: Address) => {
    setEditing(a);
    setForm({
      fullName: a.fullName,
      phone: a.phone,
      wilaya: a.wilaya,
      commune: a.commune,
      street: a.street,
      notes: a.notes ?? '',
      isDefault: a.isDefault,
    });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 3) e.fullName = 'يرجى إدخال الاسم الكامل.';
    if (!/^0[5-7]\d{8}$/.test(form.phone.trim())) e.phone = 'رقم هاتف غير صحيح.';
    if (!form.wilaya) e.wilaya = 'يرجى اختيار الولاية.';
    if (!form.commune.trim()) e.commune = 'يرجى إدخال البلدية.';
    if (form.street.trim().length < 5) e.street = 'يرجى إدخال العنوان بالتفصيل.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await saveAddress(
        {
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          wilaya: form.wilaya,
          commune: form.commune.trim(),
          street: form.street.trim(),
          notes: form.notes.trim() || undefined,
          isDefault: form.isDefault,
        },
        editing?.id,
      );
      setOpen(false);
    } catch (err) {
      toast(messageOf(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="عناويني"
        subtitle={`${addresses.length} عنوان محفوظ`}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={openNew} hitSlop={8} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
            <MaterialCommunityIcons name="plus" size={20} color={theme.c.primary} />
            <AppText size={13} weight="bold" color={theme.c.primary}>
              إضافة
            </AppText>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {!addresses.length ? (
          <EmptyState
            emoji="📍"
            title="لا توجد عناوين محفوظة"
            message="احفظي عنوانكِ لتسريع إتمام الطلبات مستقبلًا."
            actionTitle="إضافة عنوان"
            onAction={openNew}
          />
        ) : (
          addresses.map((a) => (
            <Card key={a.id} style={{ gap: 10 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={8}>
                  <MaterialCommunityIcons name="map-marker-outline" size={20} color={theme.c.primary} />
                  <AppText size={15} weight="bold">
                    {a.fullName}
                  </AppText>
                  {a.isDefault ? (
                    <View style={{ backgroundColor: theme.c.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                      <AppText size={11} weight="bold" color={theme.c.success}>
                        افتراضي
                      </AppText>
                    </View>
                  ) : null}
                </Row>
              </Row>
              <AppText size={13.5} color={theme.c.textMuted} style={{ lineHeight: 21 }}>
                {a.commune}، {a.wilaya}\n{a.street}
              </AppText>
              <AppText size={13} color={theme.c.textMuted}>
                📞 {a.phone}
              </AppText>
              <Row gap={10}>
                <Button small title="تعديل" variant="outline" style={{ flex: 1 }} onPress={() => openEdit(a)} />
                <Button
                  small
                  title="حذف"
                  variant="danger"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    const ok = await confirm({ title: 'حذف العنوان', message: 'هل تريدين حذف هذا العنوان؟', confirmText: 'حذف', destructive: true });
                    if (ok) removeAddress(a.id).catch((e) => toast(messageOf(e), 'error'));
                  }}
                />
              </Row>
            </Card>
          ))
        )}
      </ScrollView>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: theme.c.overlay }} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: theme.c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingBottom: 28 }}>
            <Row style={{ padding: 16, justifyContent: 'space-between' }}>
              <AppText size={17} weight="bold">
                {editing ? 'تعديل العنوان' : 'عنوان جديد'}
              </AppText>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color={theme.c.textMuted} />
              </Pressable>
            </Row>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
              <Field label="الاسم الكامل" value={form.fullName} onChangeText={(t) => setForm({ ...form, fullName: t })} error={errors.fullName} />
              <Field
                label="رقم الهاتف"
                value={form.phone}
                onChangeText={(t) => setForm({ ...form, phone: t })}
                keyboardType="phone-pad"
                maxLength={10}
                error={errors.phone}
              />
              <SelectField label="الولاية" placeholder="اختاري الولاية" value={form.wilaya} error={errors.wilaya} onPress={() => setWilayaOpen(true)} />
              <Field label="البلدية" value={form.commune} onChangeText={(t) => setForm({ ...form, commune: t })} error={errors.commune} />
              <Field label="العنوان بالتفصيل" value={form.street} onChangeText={(t) => setForm({ ...form, street: t })} error={errors.street} multiline />
              <Field label="ملاحظات (اختياري)" value={form.notes} onChangeText={(t) => setForm({ ...form, notes: t })} multiline />
              <Pressable
                onPress={() => setForm({ ...form, isDefault: !form.isDefault })}
                style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 6 }}
              >
                <MaterialCommunityIcons
                  name={form.isDefault ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={24}
                  color={form.isDefault ? theme.c.primary : theme.c.textMuted}
                />
                <AppText size={14}>تعيين كعنوان افتراضي</AppText>
              </Pressable>
              <Button title={editing ? 'حفظ التعديلات' : 'إضافة العنوان'} loading={saving} onPress={save} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
        <WilayaPicker visible={wilayaOpen} value={form.wilaya} onSelect={(w) => setForm({ ...form, wilaya: w })} onClose={() => setWilayaOpen(false)} />
      </Modal>
    </Screen>
  );
}
