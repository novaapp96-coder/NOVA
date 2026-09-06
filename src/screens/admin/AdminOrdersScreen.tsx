import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import { AppText, Card, Chip, EmptyState, Row, Screen, ScreenHeader, Skeleton, StatusBadge } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { formatDateTime, formatPrice, isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Order, OrderStatus } from '../../core/types';
import type { AdminStackParamList } from '../../navigation/types';

type Filter = OrderStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'received', label: 'جديدة' },
  { value: 'confirmed', label: 'مؤكدة' },
  { value: 'preparing', label: 'قيد التجهيز' },
  { value: 'out_for_delivery', label: 'خرجت' },
  { value: 'delivered', label: 'مُسلّمة' },
  { value: 'cancelled', label: 'ملغاة' },
];

export default function AdminOrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const { theme, user, toast } = useApp();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!isAdmin(user)) return;
    try {
      setOrders(await adminRepository.listOrders(user, filter));
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  }, [user, filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const list = orders ?? [];

  return (
    <Screen>
      <ScreenHeader title="إدارة الطلبات" subtitle={orders ? `${orders.length} طلب` : '…'} onBack={() => navigation.goBack()} />
      <View style={{ paddingVertical: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row-reverse', paddingHorizontal: 16 }}>
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={list}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10, paddingBottom: 40 }}
        ListEmptyComponent={
          orders === null ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} h={104} r={20} />
              ))}
            </View>
          ) : (
            <EmptyState emoji="🧾" title="لا توجد طلبات" message="لا توجد طلبات ضمن هذا التصنيف حاليًا." />
          )
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 35).duration(240)}>
            <Card
              style={{ gap: 10 }}
            >
              <View onTouchEnd={() => navigation.navigate('AdminOrderDetails', { orderId: item.id })}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ gap: 3 }}>
                    <AppText size={15} weight="bold" color={theme.c.primary}>
                      {item.id}
                    </AppText>
                    <AppText size={11.5} color={theme.c.textMuted}>
                      {formatDateTime(item.createdAt)}
                    </AppText>
                  </View>
                  <StatusBadge status={item.status} small />
                </Row>
                <View style={{ height: 1, backgroundColor: theme.c.border, marginVertical: 2 }} />
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ gap: 2 }}>
                    <AppText size={13.5} weight="medium">
                      {item.customerName}
                    </AppText>
                    <AppText size={12} color={theme.c.textMuted}>
                      {item.phone} • {item.wilaya}
                    </AppText>
                  </View>
                  <AppText size={15} weight="bold" color={theme.c.primary}>
                    {formatPrice(item.total)}
                  </AppText>
                </Row>
              </View>
            </Card>
          </Animated.View>
        )}
      />
    </Screen>
  );
}
