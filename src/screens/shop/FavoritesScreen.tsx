import React from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../../state/AppProvider';
import { EmptyState, Screen, ScreenHeader } from '../../components/UI';
import { ProductCard } from '../../components/ProductCard';
import { messageOf } from '../../data/errors';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

export default function FavoritesScreen({ navigation }: Props) {
  const { theme, products, favoriteIds, toggleFavorite, addToCart, toast } = useApp();
  const { width } = useWindowDimensions();

  const favorites = products.filter((p) => favoriteIds.includes(p.id));
  const columns = width >= 720 ? 3 : 2;
  const gap = 12;
  const cardWidth = (width - 32 - gap * (columns - 1)) / columns;

  return (
    <Screen>
      <ScreenHeader title="المفضلة ❤️" subtitle={`${favorites.length} منتج محفوظ`} onBack={() => navigation.goBack()} />
      {!favorites.length ? (
        <EmptyState
          emoji="❤️"
          title="المفضلة فارغة"
          message="لم تضيفي أي منتجات للمفضلة بعد. اضغطي على القلب في أي منتج ليُحفظ هنا."
          actionTitle="تصفّحي المنتجات"
          onAction={() => navigation.navigate('Main', { screen: 'Products' })}
        />
      ) : (
        <FlatList
          data={favorites}
          key={columns}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <View style={{ width: cardWidth, marginBottom: gap, marginLeft: index % columns === 0 ? 0 : gap }}>
              <ProductCard
                product={item}
                width={cardWidth}
                isFavorite
                onToggleFavorite={() => toggleFavorite(item.id)}
                onAddToCart={() => {
                  const variantIds = item.variants.length ? [item.variants[0].id] : [];
                  addToCart(item.id, variantIds, 1)
                    .then(() => toast('تم نقله إلى السلة 🛒', 'success'))
                    .catch((e) => toast(messageOf(e), 'error'));
                }}
                onPress={() => navigation.navigate('ProductDetails', { productId: item.id })}
              />
            </View>
          )}
        />
      )}
    </Screen>
  );
}
