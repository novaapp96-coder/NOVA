import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, EmptyState, Field, Row, Screen, ScreenHeader } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Category } from '../../core/types';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminCategories'>;

const empty = { name: '', emoji: '🛍️', icon: 'tag', active: true };

export default function AdminCategoriesScreen({ navigation }: Props) {
  const { theme, user, products, toast, confirm, refreshCatalog } = useApp();
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { catalogRepository } = await import('../../repositories/catalogRepository');
    setCategories(await catalogRepository.getAllCategories());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!isAdmin(user)) return;
    setSaving(true);
    try {
      await adminRepository.saveCategory(user, form, editing?.id);
      await load();
      await refreshCatalog();
      setOpen(false);
      toast('تم حفظ التصنيف ✅', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Category) => {
    if (!isAdmin(user)) return;
    const ok = await confirm({
      title: 'حذف التصنيف',
      message: `هل تريدين حذف تصنيف «${c.name}»؟`,
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await adminRepository.deleteCategory(user, c.id);
      await load();
      await refreshCatalog();
      toast('تم الحذف.', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="التصنيفات"
        subtitle={`${categories.length} تصنيف`}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}>
        {!categories.length ? (
          <EmptyState emoji="🗂️" title="لا توجد تصنيفات" message="أضيفي أول تصنيف للتنظيم." />
        ) : (
          categories.map((c) => {
            const count = products.filter((p) => p.categoryId === c.id).length;
            return (
              <Card key={c.id} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={10}>
                    <View style={{ width: 42, height: 42, borderRadius: 16, backgroundColor: theme.c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                      <AppText size={20}>{c.emoji}</AppText>
                    </View>
                    <View style={{ gap: 2 }}>
                      <AppText size={15} weight="bold">
                        {c.name}
                      </AppText>
                      <AppText size={12} color={theme.c.textMuted}>
                        {count} منتج • {c.active ? 'ظاهر' : 'مخفي'}
                      </AppText>
                    </View>
                  </Row>
                  <Row gap={6}>
                    <MaterialCommunityIcons
                      name="pencil-outline"
                      size={20}
                      color={theme.c.primary}
                      onPress={() => {
                        setEditing(c);
                        setForm({ name: c.name, emoji: c.emoji, icon: c.icon, active: c.active });
                        setOpen(true);
                      }}
                    />
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.c.danger} onPress={() => remove(c)} />
                  </Row>
                </Row>
              </Card>
            );
          })
        )}
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 22, backgroundColor: theme.c.surface, borderTopWidth: 1, borderTopColor: theme.c.border }}>
        <Button
          title="إضافة تصنيف"
          icon="plus"
          onPress={() => {
            setEditing(null);
            setForm({ ...empty });
            setOpen(true);
          }}
        />
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: theme.c.overlay }} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: theme.c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14 }}>
            <AppText size={17} weight="bold" align="center">
              {editing ? 'تعديل تصنيف' : 'تصنيف جديد'}
            </AppText>
            <Field label="اسم التصنيف" value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              <Field label="الرمز التعبيري (إيموجي)" value={form.emoji} onChangeText={(t) => setForm({ ...form, emoji: t })} style={{ flex: 1 }} maxLength={4} />
              <Field label="أيقونة" value={form.icon} onChangeText={(t) => setForm({ ...form, icon: t })} style={{ flex: 1 }} autoCapitalize="none" />
            </Row>
            <Pressable onPress={() => setForm({ ...form, active: !form.active })} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
              <MaterialCommunityIcons
                name={form.active ? 'toggle-switch' : 'toggle-switch-off-outline'}
                size={34}
                color={form.active ? theme.c.primary : theme.c.textMuted}
              />
              <AppText size={14}>ظاهر في المتجر</AppText>
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
