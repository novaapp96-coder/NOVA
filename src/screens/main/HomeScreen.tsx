import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  Row,
  SectionHeader,
  Skeleton,
} from '../../components/UI';
import { ProductCard, ProductCardSkeleton } from '../../components/ProductCard';
import { ProductPeekSheet } from '../../components/Pickers';
import { queryProducts } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Product } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, user, categories, products, cart, loading, refreshCatalog, toggleFavorite, favoriteIds, addToCart, unreadCount, settings, toast } = useApp();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [peek, setPeek] = useState<Product | null>(null);

  const featured = useMemo(() => products.filter((p) => p.featured).slice(0, 8), [products]);
  const offers = useMemo(
    () => products.filter((p) => p.oldPrice && p.oldPrice > p.price).slice(0, 8),
    [products],
  );
  const fresh = useMemo(() => queryProducts(products, { sort: 'newest' }).slice(0, 8), [products]);
  const results = useMemo(
    () => (search.trim() ? queryProducts(products, { search, pageSize: 6 }).slice(0, 6) : []),
    [products, search],
  );

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

  const goProducts = (params?: { search?: string; categoryId?: string; offers?: boolean }) => {
    navigation.navigate('Main', { screen: 'Products', params });
  };

  const cardWidth = Math.min(172, (width - 52) / 2.15);

  const header = (
    <View style={{ gap: 26 }}>
      {/* Header with logo + icons */}
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={10}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              backgroundColor: theme.c.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="shopping-outline" size={24} color="#fff" />
          </View>
          <View>
            <AppText size={19} weight="bold" color={theme.c.primary}>
              Nova
            </AppText>
            <AppText size={10.5} color={theme.c.textMuted}>
              {settings.slogan}
            </AppText>
          </View>
        </Row>
        <Row gap={8}>
          <IconButton
            icon="bell-outline"
            badge={unreadCount}
            onPress={() => navigation.navigate('Notifications')}
          />
          <IconButton icon="cart-outline" badge={cart.length} onPress={() => navigation.navigate('Main', { screen: 'Cart' })} />
        </Row>
      </Row>

      {/* Greeting */}
      <View style={{ gap: 4 }}>
        <AppText size={20} weight="bold">
          مرحبًا بكِ في Nova 💜
        </AppText>
        <AppText size={14} color={theme.c.textMuted}>
          مرحبًا بكِ في Nova، اكتشفي منتجاتكِ المفضلة بسهولة.{user ? `، ${user.name.split(' ')[0]}` : ''}
        </AppText>
      </View>

      {/* Search */}
      <Pressable
        onPress={() => goProducts({ search })}
        style={{
          flexDirection: 'row-reverse',
          alignItems: 'center',
          gap: 10,
          backgroundColor: theme.c.surface,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: theme.c.border,
          paddingHorizontal: 18,
          paddingVertical: 13,
          ...theme.shadow(6),
        }}
      >
        <MaterialCommunityIcons name="magnify" size={21} color={theme.c.textMuted} />
        <View style={{ flex: 1 }}>
          <AppText size={14} color={search ? theme.c.text : theme.c.textMuted}>
            {search || 'ماذا تبحثين عنه؟'}
          </AppText>
        </View>
        <View style={{ width: 1, height: 22, backgroundColor: theme.c.border }} />
        <MaterialCommunityIcons name="tune-variant" size={19} color={theme.c.primary} />
      </Pressable>

      {/* Live results */}
      {results.length ? (
        <Card style={{ gap: 10 }}>
          <AppText size={12.5} weight="medium" color={theme.c.textMuted}>
            نتائج البحث ({results.length})
          </AppText>
          {results.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPeek(p)}
              style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 4 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="image-outline" size={18} color={theme.c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText size={13.5} weight="medium" numberOfLines={1}>
                  {p.name}
                </AppText>
                <AppText size={12.5} weight="bold" color={theme.c.primary}>
                  {p.price.toLocaleString('fr-FR')} دج
                </AppText>
              </View>
              <MaterialCommunityIcons name="chevron-left" size={22} color={theme.c.textMuted} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {/* Announcement */}
      {settings.announcement ? (
        <Animated.View entering={FadeInDown.duration(320)}>
          <View
            style={{
              backgroundColor: theme.c.accentSoft,
              borderRadius: theme.radius.lg,
              padding: 14,
              flexDirection: 'row-reverse',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <MaterialCommunityIcons name="sale" size={22} color={theme.c.accent} />
            <AppText size={13.5} weight="medium" style={{ flex: 1 }}>
              {settings.announcement}
            </AppText>
          </View>
        </Animated.View>
      ) : null}

      {/* Categories */}
      <View style={{ gap: 12 }}>
        <SectionHeader title="التصنيفات" actionLabel="عرض الكل" onAction={() => goProducts()} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, flexDirection: 'row-reverse', paddingHorizontal: 2 }}>
          {loading.products
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} w={78} h={92} r={20} />)
            : categories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => goProducts({ categoryId: c.id })}
                  style={({ pressed }) => ({
                    width: 78,
                    alignItems: 'center',
                    gap: 7,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 22,
                      backgroundColor: theme.c.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppText size={27}>{c.emoji}</AppText>
                  </View>
                  <AppText size={12} weight="medium" align="center" numberOfLines={1}>
                    {c.name}
                  </AppText>
                </Pressable>
              ))}
        </ScrollView>
      </View>

      {/* Track order */}
      <Pressable onPress={() => navigation.navigate('Main', { screen: 'Orders' })}>
        <View
          style={{
            backgroundColor: theme.c.primary,
            borderRadius: theme.radius.lg,
            padding: 16,
            flexDirection: 'row-reverse',
            alignItems: 'center',
            gap: 12,
            ...theme.shadow(10),
          }}
        >
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="truck-fast-outline" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText size={15.5} weight="bold" color="#fff">
              تتبّعي طلبكِ
            </AppText>
            <AppText size={12.5} color="rgba(255,255,255,0.85)" style={{ textAlign: 'right' }}>
              اعرفي أين وصل طلبكِ خطوة بخطوة
            </AppText>
          </View>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
        </View>
      </Pressable>
    </View>
  );

  const renderRow = (title: string, data: Product[], emoji: string) => (
    <View style={{ gap: 12 }}>
      <SectionHeader title={title} actionLabel="عرض الكل" onAction={() => goProducts()} />
      {loading.products ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, flexDirection: 'row-reverse' }}>
          {[0, 1, 2].map((i) => (
            <ProductCardSkeleton key={i} width={160} />
          ))}
        </ScrollView>
      ) : data.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, flexDirection: 'row-reverse' }}>
          {data.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              width={160}
              isFavorite={favoriteIds.includes(p.id)}
              onToggleFavorite={() => toggleFavorite(p.id)}
              onAddToCart={() =>
                addToCart(p.id, p.variants.length ? [p.variants[0].id] : [], 1).catch((e) =>
                  toast(messageOf(e), 'error'),
                )
              }
              onPress={() => navigation.navigate('ProductDetails', { productId: p.id })}
            />
          ))}
        </ScrollView>
      ) : (
        <AppText size={13} color={theme.c.textMuted}>
          {emoji} لا توجد منتجات هنا حاليًا.
        </AppText>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.c.bg }}>
      <FlatList
        data={[]}
        renderItem={null}
        keyExtractor={() => 'x'}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 26 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.c.primary} colors={[theme.c.primary]} />}
        ListFooterComponent={
          <View style={{ gap: 26 }}>
            {renderRow('منتجات مميزة ⭐', featured, '⭐')}
            {renderRow('عروض خاصة 🔥', offers, '🔥')}
            {renderRow('وصل حديثًا ✨', fresh, '✨')}

            {/* Help */}
            <Card style={{ gap: 12 }}>
              <Row gap={10}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="headset" size={22} color={theme.c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText size={15.5} weight="bold">
                    تحتاجين مساعدة؟
                  </AppText>
                  <AppText size={12.5} color={theme.c.textMuted} style={{ textAlign: 'right' }}>
                    فريقنا جاهز للإجابة عن كل استفساراتكِ
                  </AppText>
                </View>
              </Row>
              <Button title="تواصلي معنا" variant="outline" icon="chat-outline" onPress={() => navigation.navigate('Support')} />
            </Card>

            {!loading.products && !products.length ? (
              <EmptyState
                emoji="🛍️"
                title="لا توجد منتجات بعد"
                message="سيتم عرض المنتجات هنا قريبًا."
                actionTitle="تحديث"
                onAction={onRefresh}
              />
            ) : null}
          </View>
        }
      />
      <ProductPeekSheet
        product={peek}
        onClose={() => setPeek(null)}
        onOpen={() => {
          const p = peek;
          setPeek(null);
          if (p) navigation.navigate('ProductDetails', { productId: p.id });
        }}
      />
    </View>
  );
}
