import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, EmptyState, IconButton, Row, Screen, ScreenHeader, Skeleton, SmartImage } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { formatPrice, isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Product } from '../../core/types';
import type { AdminStackParamList } from '../../navigation/types';

export default function AdminProductsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const { theme, user, categories, toast, confirm, refreshCatalog } = useApp();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!isAdmin(user)) return;
    try {
      setProducts(await adminRepository.listProducts(user));
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  }, [user, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const list = useMemo(() => {
    if (!products) return [];
    const n = search.trim().toLowerCase();
    if (!n) return products;
    return products.filter((p) => p.name.toLowerCase().includes(n));
  }, [products, search]);

  const toggleHidden = async (p: Product) => {
    if (!isAdmin(user)) return;
    try {
      await adminRepository.toggleProductHidden(user, p.id);
      await load();
      await refreshCatalog();
      toast(p.hidden ? 'تم إظهار المنتج' : 'تم إخفاء المنتج', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  };

  const remove = async (p: Product) => {
    if (!isAdmin(user)) return;
    const ok = await confirm({
      title: 'حذف المنتج',
      message: `سيتم حذف «${p.name}» نهائيًا. هل أنتِ متأكدة؟`,
      confirmText: 'حذف نهائي',
      destructive: true,
    });
    if (!ok) return;
    try {
      await adminRepository.deleteProduct(user, p.id);
      await load();
      await refreshCatalog();
      toast('تم حذف المنتج.', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="إدارة المنتجات"
        subtitle={products ? `${products.length} منتج` : '…'}
        onBack={() => navigation.goBack()}
        right={
          <IconButton icon="plus" onPress={() => navigation.navigate('AdminProductEdit', {})} />
        }
      />
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row-reverse',
            alignItems: 'center',
            gap: 8,
            backgroundColor: theme.c.surface,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            borderColor: theme.c.border,
            paddingHorizontal: 14,
          }}
        >
          <MaterialCommunityIcons name="magnify" size={20} color={theme.c.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث في المنتجات…"
            placeholderTextColor={theme.c.textMuted}
            style={[theme.text(14, 'regular'), { flex: 1, paddingVertical: 12 }]}
          />
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, paddingBottom: 40 }}
        ListEmptyComponent={
          products === null ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} h={92} r={20} />
              ))}
            </View>
          ) : (
            <EmptyState emoji="📦" title="لا توجد منتجات" message="أضيفي أول منتج من الزر أدناه." />
          )
        }
        renderItem={({ item, index }) => {
          const category = categories.find((c) => c.id === item.categoryId);
          return (
            <Animated.View entering={FadeInDown.delay(index * 35).duration(240)}>
              <Card padded={false} style={{ padding: 12, opacity: item.hidden ? 0.6 : 1 }}>
                <Row gap={12} style={{ alignItems: 'flex-start' }}>
                  <SmartImage uri={item.images[0]} emoji={category?.emoji} radius={14} style={{ width: 64, height: 64 }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <AppText size={14} weight="bold" numberOfLines={1}>
                      {item.name}
                    </AppText>
                    <AppText size={12} color={theme.c.textMuted}>
                      {category?.name ?? 'بدون تصنيف'} • المخزون: {item.stock}
                    </AppText>
                    <Row gap={8}>
                      <AppText size={13.5} weight="bold" color={theme.c.primary}>
                        {formatPrice(item.price)}
                      </AppText>
                      {item.hidden ? (
                        <View style={{ backgroundColor: theme.c.dangerSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                          <AppText size={10.5} weight="bold" color={theme.c.danger}>
                            مخفي
                          </AppText>
                        </View>
                      ) : null}
                      {item.featured ? (
                        <View style={{ backgroundColor: theme.c.warningSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                          <AppText size={10.5} weight="bold" color={theme.c.warning}>
                            مميز
                          </AppText>
                        </View>
                      ) : null}
                    </Row>
                  </View>
                  <View style={{ gap: 6 }}>
                    <IconButton icon="pencil-outline" size={18} onPress={() => navigation.navigate('AdminProductEdit', { productId: item.id })} />
                    <IconButton
                      icon={item.hidden ? 'eye-outline' : 'eye-off-outline'}
                      size={18}
                      color={theme.c.warning}
                      onPress={() => toggleHidden(item)}
                    />
                    <IconButton icon="trash-can-outline" size={18} color={theme.c.danger} onPress={() => remove(item)} />
                  </View>
                </Row>
              </Card>
            </Animated.View>
          );
        }}
      />
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 22, backgroundColor: theme.c.surface, borderTopWidth: 1, borderTopColor: theme.c.border }}>
        <Button title="إضافة منتج جديد" icon="plus" onPress={() => navigation.navigate('AdminProductEdit', {})} />
      </View>
    </Screen>
  );
}
