import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, EmptyState, Field, Row, Screen, ScreenHeader } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { formatPrice, isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Coupon } from '../../core/types';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminCoupons'>;

export default function AdminCouponsScreen({ navigation }: Props) {
  const { theme, user, toast, confirm } = useApp();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [minSubtotal, setMinSubtotal] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { localDatabase } = await import('../../data/database');
    const db = await localDatabase.read();
    setCoupons(db.coupons);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!isAdmin(user)) return;
    setSaving(true);
    try {
      await adminRepository.saveCoupon(
        user,
        {
          code,
          type,
          value: parseInt(value || '0', 10) || 0,
          minSubtotal: parseInt(minSubtotal || '0', 10) || 0,
          active,
          expiresAt: null,
        },
        editing?.id,
      );
      await load();
      setOpen(false);
      toast('تم حفظ الكوبون ✅', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Coupon) => {
    if (!isAdmin(user)) return;
    const ok = await confirm({ title: 'حذف الكوبون', message: `حذف الكوبون ${c.code}؟`, confirmText: 'حذف', destructive: true });
    if (!ok) return;
    try {
      await adminRepository.deleteCoupon(user, c.id);
      await load();
      toast('تم الحذف.', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader title="الكوبونات" subtitle={`${coupons.length} كوبون`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}>
        {!coupons.length ? (
          <EmptyState emoji="🎟️" title="لا توجد كوبونات" message="أنشئي كوبون خصم لعملائكِ." />
        ) : (
          coupons.map((c) => (
            <Card key={c.id} style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={10}>
                  <View style={{ width: 42, height: 42, borderRadius: 16, backgroundColor: theme.c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="ticket-outline" size={21} color={theme.c.accent} />
                  </View>
                  <View style={{ gap: 2 }}>
                    <AppText size={15} weight="bold" color={theme.c.primary}>
                      {c.code}
                    </AppText>
                    <AppText size={12} color={theme.c.textMuted}>
                      {c.type === 'percent' ? `خصم ${c.value}%` : `خصم ${formatPrice(c.value)}`} • يبدأ من {formatPrice(c.minSubtotal)} • استخدام {c.uses}
                    </AppText>
                  </View>
                </Row>
                <Row gap={6}>
                  <MaterialCommunityIcons
                    name={c.active ? 'toggle-switch' : 'toggle-switch-off-outline'}
                    size={30}
                    color={c.active ? theme.c.success : theme.c.textMuted}
                    onPress={async () => {
                      if (!isAdmin(user)) return;
                      try {
                        await adminRepository.saveCoupon(user, { code: c.code, type: c.type, value: c.value, minSubtotal: c.minSubtotal, active: !c.active, expiresAt: c.expiresAt }, c.id);
                        await load();
                      } catch (e) {
                        toast(messageOf(e), 'error');
                      }
                    }}
                  />
                  <MaterialCommunityIcons
                    name="pencil-outline"
                    size={20}
                    color={theme.c.primary}
                    onPress={() => {
                      setEditing(c);
                      setCode(c.code);
                      setType(c.type);
                      setValue(String(c.value));
                      setMinSubtotal(String(c.minSubtotal));
                      setActive(c.active);
                      setOpen(true);
                    }}
                  />
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.c.danger} onPress={() => remove(c)} />
                </Row>
              </Row>
            </Card>
          ))
        )}
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 22, backgroundColor: theme.c.surface, borderTopWidth: 1, borderTopColor: theme.c.border }}>
        <Button
          title="كوبون جديد"
          icon="plus"
          onPress={() => {
            setEditing(null);
            setCode('');
            setType('percent');
            setValue('');
            setMinSubtotal('');
            setActive(true);
            setOpen(true);
          }}
        />
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: theme.c.overlay }} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: theme.c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14 }}>
            <AppText size={17} weight="bold" align="center">
              {editing ? 'تعديل الكوبون' : 'كوبون جديد'}
            </AppText>
            <Field label="رمز الكوبون" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" icon="ticket-outline" />
            <Row gap={10}>
              <Pressable
                onPress={() => setType('percent')}
                style={{ flex: 1, paddingVertical: 11, borderRadius: theme.radius.md, backgroundColor: type === 'percent' ? theme.c.primary : theme.c.surface, alignItems: 'center' }}
              >
                <AppText size={13.5} weight="bold" color={type === 'percent' ? '#fff' : theme.c.textMuted}>
                  نسبة %
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => setType('fixed')}
                style={{ flex: 1, paddingVertical: 11, borderRadius: theme.radius.md, backgroundColor: type === 'fixed' ? theme.c.primary : theme.c.surface, alignItems: 'center' }}
              >
                <AppText size={13.5} weight="bold" color={type === 'fixed' ? '#fff' : theme.c.textMuted}>
                  مبلغ دج
                </AppText>
              </Pressable>
            </Row>
            <Field label={type === 'percent' ? 'النسبة (%)' : 'المبلغ (دج)'} value={value} onChangeText={setValue} keyboardType="number-pad" />
            <Field label="الحد الأدنى للمجموع (دج)" value={minSubtotal} onChangeText={setMinSubtotal} keyboardType="number-pad" />
            <Pressable onPress={() => setActive(!active)} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons name={active ? 'toggle-switch' : 'toggle-switch-off-outline'} size={34} color={active ? theme.c.primary : theme.c.textMuted} />
              <AppText size={14}>مفعّل</AppText>
            </Pressable>
            <Row gap={10}>
              <Button title="حفظ" style={{ flex: 1 }} loading={saving} onPress={save} />
              <Button title="إلغاء" variant="outline" style={{ flex: 1 }} onPress={() => setOpen(false)} />
            </Row>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
