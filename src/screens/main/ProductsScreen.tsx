import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Chip, EmptyState, Field, IconButton, Row, Screen } from '../../components/UI';
import { ProductCard, ProductCardSkeleton } from '../../components/ProductCard';
import { OptionSheet } from '../../components/Pickers';
import { PAGE_SIZE } from '../../core/constants';
import { messageOf } from '../../data/errors';
import type { Product, ProductSort } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'السعر: من الأقل' },
  { value: 'price_desc', label: 'السعر: من الأعلى' },
  { value: 'best_selling', label: 'الأكثر مبيعًا' },
  { value: 'top_rated', label: 'الأعلى تقييمًا' },
];

export default function ProductsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Main'>>();
  const params = (route.params as { search?: string; categoryId?: string; offers?: boolean }) ?? {};
  const { theme, products, categories, loading, refreshCatalog, toggleFavorite, favoriteIds, addToCart, toast } = useApp();
  const { width } = useWindowDimensions();

  const [search, setSearch] = useState(params.search ?? '');
  const [debounced, setDebounced] = useState(params.search ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [offersOnly, setOffersOnly] = useState(!!params.offers);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<ProductSort>('newest');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [categoryId, sort, offersOnly, inStockOnly, minPrice, maxPrice]);

  const filtered = useMemo(() => {
    const min = minPrice.trim() ? Number(minPrice) : undefined;
    const max = maxPrice.trim() ? Number(maxPrice) : undefined;
    let list = products.filter((p) => !p.hidden);
    if (debounced.trim()) {
      const n = debounced.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(n) ||
          (p.brand ?? '').toLowerCase().includes(n) ||
          p.description.toLowerCase().includes(n),
      );
    }
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId);
    if (offersOnly) list = list.filter((p) => p.oldPrice && p.oldPrice > p.price);
    if (inStockOnly) list = list.filter((p) => p.stock > 0);
    if (typeof min === 'number' && !Number.isNaN(min)) list = list.filter((p) => p.price >= min);
    if (typeof max === 'number' && !Number.isNaN(max)) list = list.filter((p) => p.price <= max);

    switch (sort) {
      case 'price_asc':
        return [...list].sort((a, b) => a.price - b.price);
      case 'price_desc':
        return [...list].sort((a, b) => b.price - a.price);
      case 'best_selling':
        return [...list].sort((a, b) => b.soldCount - a.soldCount);
      case 'top_rated':
        return [...list].sort((a, b) => b.rating - a.rating);
      default:
        return [...list].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
  }, [products, debounced, categoryId, sort, offersOnly, inStockOnly, minPrice, maxPrice]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const columns = width >= 720 ? 3 : 2;
  const gap = 12;
  const cardWidth = (width - 32 - gap * (columns - 1)) / columns;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCatalog();
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const activeCategory = categories.find((c) => c.id === categoryId);

  const renderCard = ({ item, index }: { item: Product; index: number }) => (
    <View style={{ width: cardWidth, marginBottom: gap, marginLeft: index % columns === 0 ? 0 : gap }}>
      <ProductCard
        product={item}
        width={cardWidth}
        isFavorite={favoriteIds.includes(item.id)}
        onToggleFavorite={() => toggleFavorite(item.id)}
        onAddToCart={() => {
          const variantIds = item.variants.length ? [item.variants[0].id] : [];
          addToCart(item.id, variantIds, 1).catch((e) => toast(messageOf(e), 'error'));
        }}
        onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
      />
    </View>
  );

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12, backgroundColor: theme.c.surface, borderBottomWidth: 1, borderBottomColor: theme.c.border }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText size={20} weight="bold">
            المنتجات
          </AppText>
          <IconButton icon="heart-outline" onPress={() => navigation.navigate('Favorites')} />
        </Row>
        <View
          style={{
            flexDirection: 'row-reverse',
            alignItems: 'center',
            gap: 8,
            backgroundColor: theme.c.bg,
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
            placeholder="ماذا تبحثين عنه؟"
            placeholderTextColor={theme.c.textMuted}
            returnKeyType="search"
            style={[theme.text(14, 'regular'), { flex: 1, paddingVertical: 12 }]}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={19} color={theme.c.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Row gap={8}>
          <Chip
            label={SORTS.find((s) => s.value === sort)?.label ?? 'الترتيب'}
            emoji="↕️"
            active={sort !== 'newest'}
            onPress={() => setSortOpen(true)}
          />
          <Chip
            label="تصفية"
            emoji="🎚️"
            active={offersOnly || inStockOnly || !!minPrice || !!maxPrice || !!activeCategory}
            onPress={() => setFilterOpen(true)}
          />
          {offersOnly ? <Chip label="عروض فقط" emoji="🔥" active onPress={() => setOffersOnly(false)} /> : null}
          {activeCategory ? (
            <Chip label={activeCategory.name} emoji={activeCategory.emoji} active onPress={() => setCategoryId(null)} />
          ) : null}
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row-reverse' }}>
          <Chip label="الكل" active={!categoryId} onPress={() => setCategoryId(null)} />
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              emoji={c.emoji}
              active={categoryId === c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={visible}
        key={columns}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        numColumns={columns}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.c.primary} colors={[theme.c.primary]} />}
        ListEmptyComponent={
          loading.products ? (
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap }}>
              {[0, 1, 2, 3].map((i) => (
                <ProductCardSkeleton key={i} width={cardWidth} />
              ))}
            </View>
          ) : (
            <EmptyState
              emoji="🔍"
              title="لا توجد نتائج"
              message="لم نعثر على منتجات مطابقة. جرّبي كلمة أخرى أو أزيلي التصفية."
              actionTitle="إعادة ضبط البحث"
              onAction={() => {
                setSearch('');
                setCategoryId(null);
                setOffersOnly(false);
                setInStockOnly(false);
                setMinPrice('');
                setMaxPrice('');
                setSort('newest');
              }}
            />
          )
        }
        ListFooterComponent={
          visible.length < filtered.length ? (
            <Button
              title={`عرض المزيد (${filtered.length - visible.length})`}
              variant="outline"
              icon="chevron-down"
              onPress={() => setPage((p) => p + 1)}
              style={{ marginTop: 6 }}
            />
          ) : visible.length ? (
            <AppText size={12.5} color={theme.c.textMuted} align="center" style={{ marginTop: 10 }}>
              عرضتِ {visible.length} من {filtered.length} منتج
            </AppText>
          ) : null
        }
      />

      <OptionSheet
        visible={sortOpen}
        title="ترتيب النتائج"
        options={SORTS}
        value={sort}
        onSelect={(v) => setSort(v)}
        onClose={() => setSortOpen(false)}
      />

      <OptionSheet
        visible={filterOpen}
        title="تصفية"
        options={[
          { value: 'all', label: 'كل المنتجات' },
          { value: 'offers', label: 'العروض فقط', emoji: '🔥' },
          { value: 'stock', label: 'المتوفر فقط', emoji: '✅' },
        ]}
        value={offersOnly ? 'offers' : inStockOnly ? 'stock' : 'all'}
        onSelect={(v) => {
          setOffersOnly(v === 'offers');
          setInStockOnly(v === 'stock');
        }}
        onClose={() => setFilterOpen(false)}
      />

      <FilterPriceSheet
        visible={filterOpen}
        min={minPrice}
        max={maxPrice}
        onApply={(mn, mx) => {
          setMinPrice(mn);
          setMaxPrice(mx);
        }}
        onClose={() => setFilterOpen(false)}
      />
    </Screen>
  );
}

function FilterPriceSheet({
  visible,
  min,
  max,
  onApply,
  onClose,
}: {
  visible: boolean;
  min: string;
  max: string;
  onApply: (min: string, max: string) => void;
  onClose: () => void;
}) {
  const { theme } = useApp();
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);
  useEffect(() => {
    if (visible) {
      setLocalMin(min);
      setLocalMax(max);
    }
  }, [visible, min, max]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.c.overlay }} onPress={onClose} />
      <View style={{ backgroundColor: theme.c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14 }}>
        <AppText size={17} weight="bold" align="center">
          تصفية حسب السعر
        </AppText>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <Field
            label="السعر الأدنى (دج)"
            placeholder="0"
            keyboardType="number-pad"
            value={localMin}
            onChangeText={setLocalMin}
            style={{ flex: 1 }}
          />
          <Field
            label="السعر الأعلى (دج)"
            placeholder="20000"
            keyboardType="number-pad"
            value={localMax}
            onChangeText={setLocalMax}
            style={{ flex: 1 }}
          />
        </Row>
        <Row gap={10}>
          <Button
            title="تطبيق"
            style={{ flex: 1 }}
            onPress={() => {
              onApply(localMin, localMax);
              onClose();
            }}
          />
          <Button
            title="مسح"
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => {
              onApply('', '');
              onClose();
            }}
          />
        </Row>
      </View>
    </Modal>
  );
}
