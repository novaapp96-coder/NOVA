import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../state/AppProvider';
import { discountPercent } from '../core/logic';
import { AppText, Price, RatingStars, SmartImage, IconButton } from './UI';
import type { Product } from '../core/types';

/**
 * ProductCard — image, name, price, old price, discount %, rating, favorite & add-to-cart.
 * Width is computed from the screen so the grid stays responsive on tablets/phones.
 */
export function ProductCard({
  product,
  onPress,
  width,
  onAddToCart,
  onToggleFavorite,
  isFavorite,
}: {
  product: Product;
  onPress: () => void;
  width?: number;
  onAddToCart: () => void;
  onToggleFavorite: () => void;
  isFavorite: boolean;
}) {
  const { theme } = useApp();
  const { width: screenW } = useWindowDimensions();
  const cardWidth = width ?? Math.min(210, (screenW - 48) / 2);
  const off = discountPercent(product.price, product.oldPrice);
  const out = product.stock <= 0;
  const emoji = product.images.length ? '🛍️' : '🛍️';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: cardWidth,
        backgroundColor: theme.c.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.c.border,
        overflow: 'hidden',
        opacity: pressed ? 0.94 : 1,
        transform: [{ scale: pressed ? 0.985 : 1 }],
      })}
    >
      <View>
        <SmartImage uri={product.images[0]} emoji={emoji} style={{ width: '100%', height: cardWidth * 1.05 }} />
        {off ? (
          <View
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: theme.c.accent,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <AppText size={11} weight="bold" color="#fff">
              ‎-{off}%
            </AppText>
          </View>
        ) : null}
        {out ? (
          <View
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              backgroundColor: theme.c.text,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <AppText size={11} weight="bold" color="#fff">
              نفد المخزون
            </AppText>
          </View>
        ) : null}
        <View style={{ position: 'absolute', top: 8, left: 8 }}>
          <IconButton
            icon={isFavorite ? 'heart' : 'heart-outline'}
            color={isFavorite ? theme.c.danger : theme.c.primary}
            bg={theme.c.surface}
            size={19}
            onPress={onToggleFavorite}
          />
        </View>
      </View>

      <View style={{ padding: 12, gap: 7 }}>
        <AppText size={14} weight="medium" numberOfLines={2}>
          {product.name}
        </AppText>
        <RatingStars rating={product.rating} size={13} count={product.reviewsCount} />
        <Price value={product.price} old={product.oldPrice} size={16} />
        <Pressable
          onPress={onAddToCart}
          disabled={out}
          style={({ pressed }) => ({
            marginTop: 2,
            backgroundColor: out ? theme.c.surfaceAlt : pressed ? theme.c.primaryDark : theme.c.primarySoft,
            borderRadius: theme.radius.pill,
            paddingVertical: 9,
            flexDirection: 'row-reverse',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: out ? 0.6 : 1,
          })}
        >
          <MaterialCommunityIcons
            name={out ? 'bell-outline' : 'basket-plus-outline'}
            size={17}
            color={out ? theme.c.textMuted : theme.c.primary}
          />
          <AppText size={13} weight="bold" color={out ? theme.c.textMuted : theme.c.primary}>
            {out ? 'غير متوفر' : 'أضفي للسلة'}
          </AppText>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** Skeleton placeholder while products load. */
export function ProductCardSkeleton({ width }: { width?: number }) {
  const { theme } = useApp();
  const { width: screenW } = useWindowDimensions();
  const cardWidth = width ?? Math.min(210, (screenW - 48) / 2);
  const { Skeleton } = require('./UI');
  return (
    <View
      style={{
        width: cardWidth,
        backgroundColor: theme.c.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.c.border,
        overflow: 'hidden',
      }}
    >
      <Skeleton w="100%" h={cardWidth * 1.05} r={0} />
      <View style={{ padding: 12, gap: 8 }}>
        <Skeleton w="85%" h={14} />
        <Skeleton w="60%" h={12} />
        <Skeleton w="45%" h={16} />
      </View>
    </View>
  );
}
