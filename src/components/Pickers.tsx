import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../state/AppProvider';
import { AppText, Button, Card, Field, Row, ScreenHeader, SmartImage } from './UI';
import { WILAYAS } from '../core/constants';
import type { Product } from '../core/types';

/** Bottom-sheet style option list used for sort / category / wilaya / status pickers. */
export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string; emoji?: string }[];
  value?: T | null;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  const { theme } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.c.overlay }} onPress={onClose} />
      <View
        style={{
          backgroundColor: theme.c.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingBottom: 28,
          maxHeight: '75%',
        }}
      >
        <ScreenHeader title={title} onBack={onClose} />
        <ScrollView style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onSelect(opt.value);
                  onClose();
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row-reverse',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 15,
                  paddingHorizontal: 14,
                  borderRadius: theme.radius.md,
                  backgroundColor: active ? theme.c.primarySoft : pressed ? theme.c.surfaceAlt : 'transparent',
                  marginBottom: 6,
                })}
              >
                <Row gap={8}>
                  {opt.emoji ? <AppText size={17}>{opt.emoji}</AppText> : null}
                  <AppText size={15} weight={active ? 'bold' : 'regular'} color={active ? theme.c.primary : theme.c.text}>
                    {opt.label}
                  </AppText>
                </Row>
                {active ? <MaterialCommunityIcons name="check-circle" size={20} color={theme.c.primary} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function WilayaPicker({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value?: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const { theme } = useApp();
  const [search, setSearch] = useState('');
  const list = useMemo(
    () => WILAYAS.filter((w) => w.includes(search.trim())),
    [search],
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.c.overlay }} onPress={onClose} />
      <View style={{ backgroundColor: theme.c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '80%' }}>
        <ScreenHeader title="اختيار الولاية" onBack={onClose} />
        <View style={{ padding: 16 }}>
          <Field label="بحث" placeholder="ابحثي عن ولايتكِ…" value={search} onChangeText={setSearch} icon="magnify" />
        </View>
        <ScrollView style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          {list.map((w) => (
            <Pressable
              key={w}
              onPress={() => {
                onSelect(w);
                onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row-reverse',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: theme.radius.md,
                backgroundColor: w === value ? theme.c.primarySoft : pressed ? theme.c.surfaceAlt : 'transparent',
                marginBottom: 4,
              })}
            >
              <AppText size={15} weight={w === value ? 'bold' : 'regular'} color={w === value ? theme.c.primary : theme.c.text}>
                {w}
              </AppText>
              {w === value ? <MaterialCommunityIcons name="check-circle" size={20} color={theme.c.primary} /> : null}
            </Pressable>
          ))}
          {!list.length ? (
            <AppText size={14} color={theme.c.textMuted} align="center" style={{ paddingVertical: 20 }}>
              لا توجد نتائج مطابقة.
            </AppText>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Quick-view product sheet (used from search results on Home). */
export function ProductPeekSheet({
  product,
  onClose,
  onOpen,
}: {
  product: Product | null;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { theme } = useApp();
  if (!product) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.c.overlay }} onPress={onClose} />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Card style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={16} weight="bold" numberOfLines={1} style={{ flex: 1 }}>
              {product.name}
            </AppText>
            <Pressable onPress={onClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={22} color={theme.c.textMuted} />
            </Pressable>
          </Row>
          <Row gap={12} style={{ alignItems: 'flex-start' }}>
            <SmartImage uri={product.images[0]} radius={16} style={{ width: 84, height: 84 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <AppText size={13} color={theme.c.textMuted} numberOfLines={3}>
                {product.description}
              </AppText>
            </View>
          </Row>
          <Button title="عرض التفاصيل" icon="arrow-left" onPress={onOpen} />
        </Card>
      </View>
    </Modal>
  );
}
