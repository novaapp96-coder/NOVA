import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import {
  AppText,
  Card,
  EmptyState,
  Row,
  Screen,
  ScreenHeader,
  Skeleton,
  StatusBadge,
} from '../../components/UI';
import { formatDateTime, formatPrice, isActiveOrder } from '../../core/logic';
import type { Order } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

export default function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, orders, loading, refreshOrders, user, toast } = useApp();
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [refreshing, setRefreshing] = useState(false);

  const list = useMemo(
    () => orders.filter((o) => (tab === 'active' ? isActiveOrder(o.status) : !isActiveOrder(o.status))),
    [orders, tab],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshOrders();
    } catch {
      toast('تعذّر التحديث. حاولي مجددًا.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  if (!user) return null;

  const renderItem = ({ item, index }: { item: Order; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(280)}>
      <Pressable onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}>
        <Card style={{ gap: 12, marginBottom: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ gap: 3 }}>
              <AppText size={15.5} weight="bold" color={theme.c.primary}>
                {item.id}
              </AppText>
              <AppText size={12} color={theme.c.textMuted}>
                {formatDateTime(item.createdAt)}
              </AppText>
            </View>
            <StatusBadge status={item.status} />
          </Row>
          <View style={{ height: 1, backgroundColor: theme.c.border }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={13} color={theme.c.textMuted}>
              {item.items.length} منتج • {item.wilaya}
            </AppText>
            <AppText size={15} weight="bold" color={theme.c.text}>
              {formatPrice(item.total)}
            </AppText>
          </Row>
          <AppText size={12.5} color={theme.c.primary} weight="medium">
            عرض التفاصيل وتتبّع الطلب ←
          </AppText>
        </Card>
      </Pressable>
    </Animated.View>
  );

  return (
    <Screen>
      <ScreenHeader title="طلباتي" subtitle="تابعي طلباتكِ الحالية والسابقة" />
      <View style={{ flexDirection: 'row-reverse', gap: 10, padding: 16, paddingBottom: 4 }}>
        {([
          { key: 'active', label: 'الحالية', count: orders.filter((o) => isActiveOrder(o.status)).length },
          { key: 'past', label: 'السابقة', count: orders.filter((o) => !isActiveOrder(o.status)).length },
        ] as const).map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 11,
              borderRadius: theme.radius.pill,
              backgroundColor: tab === t.key ? theme.c.primary : theme.c.surface,
              borderWidth: 1,
              borderColor: tab === t.key ? theme.c.primary : theme.c.border,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <AppText size={14} weight="bold" color={tab === t.key ? '#fff' : theme.c.text}>
              {t.label} ({t.count})
            </AppText>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.c.primary} colors={[theme.c.primary]} />}
        ListEmptyComponent={
          loading.orders ? (
            <View style={{ gap: 12 }}>
              {[0, 1].map((i) => (
                <Skeleton key={i} h={120} r={20} />
              ))}
            </View>
          ) : (
            <EmptyState
              emoji="📦"
              title={tab === 'active' ? 'لا توجد طلبات جارية' : 'لا توجد طلبات سابقة'}
              message="لا توجد طلبات حتى الآن. ابدئي التسوق واختاري ما تحبين."
              actionTitle="تصفّحي المنتجات"
              onAction={() => navigation.navigate('Main', { screen: 'Products' })}
            />
          )
        }
      />
    </Screen>
  );
}
