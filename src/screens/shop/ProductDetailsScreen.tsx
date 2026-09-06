import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  IconButton,
  LoadingOverlay,
  Price,
  QuantityStepper,
  RatingStars,
  Row,
  Screen,
  ScreenHeader,
  SectionHeader,
  SmartImage,
} from '../../components/UI';
import { catalogRepository } from '../../repositories/catalogRepository';
import { availableStock, discountPercent, formatDateTime } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Product, Review } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetails'>;

export default function ProductDetailsScreen({ navigation, route }: Props) {
  const { productId } = route.params;
  const { theme, products, categories, favoriteIds, toggleFavorite, addToCart, user, toast, confirm } = useApp();
  const { width } = useWindowDimensions();

  const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
  const [imageIndex, setImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [busy, setBusy] = useState(false);

  const sizes = useMemo(() => product?.variants.filter((v) => v.type === 'size') ?? [], [product]);
  const colors = useMemo(() => product?.variants.filter((v) => v.type === 'color') ?? [], [product]);
  const chosenVariantIds = useMemo(() => {
    const ids: string[] = [];
    if (selectedSize) ids.push(selectedSize);
    if (selectedColor) ids.push(selectedColor);
    return ids;
  }, [selectedSize, selectedColor]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingReviews(true);
      try {
        const list = await catalogRepository.getReviews(productId);
        if (mounted) setReviews(list);
      } catch {
        if (mounted) setReviews([]);
      } finally {
        if (mounted) setLoadingReviews(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [productId]);

  if (!product) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل المنتج" onBack={() => navigation.goBack()} />
        <EmptyState
          emoji="🛍️"
          title="المنتج غير موجود"
          message="ربما تم حذفه أو أصبح غير متاح."
          actionTitle="العودة للمنتجات"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const stock = availableStock(product, chosenVariantIds);
  const off = discountPercent(product.price, product.oldPrice);
  const isFav = favoriteIds.includes(product.id);
  const category = categories.find((c) => c.id === product.categoryId);
  const needsVariant = sizes.length > 0 || colors.length > 0;
  const variantReady = (!sizes.length || !!selectedSize) && (!colors.length || !!selectedColor);

  const handleAdd = async (buyNow = false) => {
    if (needsVariant && !variantReady) {
      toast('يرجى اختيار اللون والمقاس أولًا.', 'error');
      return;
    }
    if (stock <= 0) {
      toast('هذا المنتج غير متوفر حاليًا.', 'error');
      return;
    }
    setBusy(true);
    try {
      await addToCart(product.id, chosenVariantIds, qty);
      if (buyNow) navigation.navigate('Checkout');
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleFavorite = async () => {
    if (!user) {
      const ok = await confirm({
        title: 'تسجيل الدخول مطلوب',
        message: 'سجّلي الدخول لحفظ المنتجات في المفضلة.',
        confirmText: 'حسنًا',
        cancelText: 'إغلاق',
      });
      void ok;
      return;
    }
    await toggleFavorite(product.id);
  };

  return (
    <Screen>
      <ScreenHeader
        title="تفاصيل المنتج"
        subtitle={category?.name}
        onBack={() => navigation.goBack()}
        right={<IconButton icon={isFav ? 'heart' : 'heart-outline'} color={isFav ? theme.c.danger : theme.c.primary} onPress={handleFavorite} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 18 }} showsVerticalScrollIndicator={false}>
        {/* Gallery */}
        <View style={{ borderRadius: theme.radius.xl, overflow: 'hidden', backgroundColor: theme.c.surface }}>
          <FlatList
            data={product.images.length ? product.images : ['']}
            keyExtractor={(item, i) => `${item}-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setImageIndex(Math.round(e.nativeEvent.contentOffset.x / width))
            }
            renderItem={({ item }) => (
              <SmartImage uri={item} emoji={category?.emoji ?? '🛍️'} style={{ width, height: width * 0.95 }} />
            )}
          />
          {off ? (
            <View style={{ position: 'absolute', top: 14, right: 14, backgroundColor: theme.c.accent, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 }}>
              <AppText size={13} weight="bold" color="#fff">
                ‎-{off}%
              </AppText>
            </View>
          ) : null}
          {product.images.length > 1 ? (
            <View style={{ position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row-reverse', gap: 6 }}>
              {product.images.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === imageIndex ? 20 : 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: i === imageIndex ? theme.c.primary : 'rgba(255,255,255,0.7)',
                  }}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Title + price */}
        <View style={{ gap: 10 }}>
          <AppText size={21} weight="bold">
            {product.name}
          </AppText>
          <Row style={{ justifyContent: 'space-between' }}>
            <Price value={product.price} old={product.oldPrice} size={21} />
            <RatingStars rating={product.rating} count={product.reviewsCount} size={16} />
          </Row>
          <Row gap={8}>
            <View
              style={{
                backgroundColor: stock > 0 ? theme.c.successSoft : theme.c.dangerSoft,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
              }}
            >
              <AppText size={12} weight="bold" color={stock > 0 ? theme.c.success : theme.c.danger}>
                {stock > 0 ? (stock <= 5 ? `آخر ${stock} قطع 🚨` : 'متوفر في المخزون ✅') : 'نفد المخزون ❌'}
              </AppText>
            </View>
            <View style={{ backgroundColor: theme.c.surfaceAlt, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
              <AppText size={12} color={theme.c.textMuted}>
                تم بيع {product.soldCount}
              </AppText>
            </View>
            {product.isNew ? (
              <View style={{ backgroundColor: theme.c.primarySoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
                <AppText size={12} weight="bold" color={theme.c.primary}>
                  جديد ✨
                </AppText>
              </View>
            ) : null}
          </Row>
        </View>

        {/* Variants (only if they exist) */}
        {sizes.length ? (
          <View style={{ gap: 10 }}>
            <SectionHeader title="المقاس" />
            <Row gap={8} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {sizes.map((v) => {
                const active = selectedSize === v.id;
                const out = v.stock <= 0;
                return (
                  <Pressable
                    key={v.id}
                    disabled={out}
                    onPress={() => {
                      setSelectedSize(v.id);
                      setQty(1);
                    }}
                    style={{
                      minWidth: 48,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: theme.radius.md,
                      borderWidth: 1.5,
                      borderColor: active ? theme.c.primary : theme.c.border,
                      backgroundColor: active ? theme.c.primary : theme.c.surface,
                      opacity: out ? 0.4 : 1,
                    }}
                  >
                    <AppText size={14} weight="bold" color={active ? '#fff' : theme.c.text} align="center">
                      {v.value}
                    </AppText>
                  </Pressable>
                );
              })}
            </Row>
          </View>
        ) : null}

        {colors.length ? (
          <View style={{ gap: 10 }}>
            <SectionHeader title="اللون" />
            <Row gap={10} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {colors.map((v) => {
                const active = selectedColor === v.id;
                const out = v.stock <= 0;
                return (
                  <Pressable
                    key={v.id}
                    disabled={out}
                    onPress={() => {
                      setSelectedColor(v.id);
                      setQty(1);
                    }}
                    style={{
                      flexDirection: 'row-reverse',
                      alignItems: 'center',
                      gap: 7,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: active ? theme.c.primary : theme.c.border,
                      backgroundColor: active ? theme.c.primarySoft : theme.c.surface,
                      opacity: out ? 0.4 : 1,
                    }}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: v.swatch ?? theme.c.textMuted, borderWidth: 1, borderColor: theme.c.border }} />
                    <AppText size={13} weight="medium" color={active ? theme.c.primary : theme.c.text}>
                      {v.value}
                    </AppText>
                  </Pressable>
                );
              })}
            </Row>
          </View>
        ) : null}

        {/* Quantity */}
        <View style={{ gap: 10 }}>
          <SectionHeader title="الكمية" />
          <Card padded={false} style={{ padding: 14 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <QuantityStepper value={qty} onChange={setQty} max={Math.max(1, stock)} />
              <AppText size={13} color={theme.c.textMuted}>
                {stock > 0 ? `متوفر: ${stock}` : 'غير متوفر'}
              </AppText>
            </Row>
          </Card>
        </View>

        {/* Description */}
        <View style={{ gap: 8 }}>
          <SectionHeader title="الوصف" />
          <AppText size={14.5} color={theme.c.textMuted} style={{ lineHeight: 24 }}>
            {product.description}
          </AppText>
        </View>

        {/* Reviews */}
        <View style={{ gap: 10 }}>
          <SectionHeader title={`التقييمات (${reviews.length})`} />
          {loadingReviews ? (
            <AppText size={13} color={theme.c.textMuted}>
              جاري تحميل التقييمات…
            </AppText>
          ) : reviews.length ? (
            reviews.map((r) => (
              <Card key={r.id} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={8}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: theme.c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                      <AppText size={14} weight="bold" color={theme.c.primary}>
                        {r.userName.charAt(0)}
                      </AppText>
                    </View>
                    <View>
                      <AppText size={13.5} weight="bold">
                        {r.userName}
                      </AppText>
                      <AppText size={11.5} color={theme.c.textMuted}>
                        {formatDateTime(r.createdAt)}
                      </AppText>
                    </View>
                  </Row>
                  <RatingStars rating={r.rating} size={13} />
                </Row>
                <AppText size={13.5} color={theme.c.textMuted} style={{ lineHeight: 21 }}>
                  {r.comment}
                </AppText>
              </Card>
            ))
          ) : (
            <AppText size={13.5} color={theme.c.textMuted}>
              كن أول من يقيّم هذا المنتج ⭐
            </AppText>
          )}
          <Button
            title="إضافة تقييم"
            variant="outline"
            small
            icon="star-outline"
            onPress={async () => {
              if (!user) {
                toast('سجّلي الدخول لإضافة تقييم.', 'error');
                return;
              }
              const ok = await confirm({
                title: 'إضافة تقييم',
                message: 'هل ترغبين بإضافة تقييم 5 نجوم مع تعليق «منتج رائع، أنصح به»؟',
                confirmText: 'إضافة',
              });
              if (!ok) return;
              try {
                const list = await catalogRepository.addReview(product.id, { id: user.id, name: user.name }, 5, 'منتج رائع، أنصح به 💜');
                setReviews(list);
                toast('شكرًا لمشاركتكِ رأيكِ ⭐', 'success');
              } catch (e) {
                toast(messageOf(e), 'error');
              }
            }}
          />
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <Animated.View
        entering={FadeIn.duration(240)}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: 'row-reverse',
          gap: 10,
          padding: 14,
          paddingBottom: 22,
          backgroundColor: theme.c.surface,
          borderTopWidth: 1,
          borderTopColor: theme.c.border,
        }}
      >
        <IconButton
          icon={isFav ? 'heart' : 'heart-outline'}
          color={isFav ? theme.c.danger : theme.c.primary}
          size={24}
          onPress={handleFavorite}
        />
        <Button
          title="أضفي للسلة"
          variant="outline"
          icon="basket-plus-outline"
          style={{ flex: 1 }}
          disabled={stock <= 0}
          loading={busy}
          onPress={() => handleAdd(false)}
        />
        <Button
          title="اشتري الآن"
          icon="flash-outline"
          style={{ flex: 1 }}
          disabled={stock <= 0}
          onPress={() => handleAdd(true)}
        />
      </Animated.View>
      <LoadingOverlay visible={busy} label="جارٍ الإضافة…" />
    </Screen>
  );
}
