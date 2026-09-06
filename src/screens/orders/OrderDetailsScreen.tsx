import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  LoadingOverlay,
  Row,
  Screen,
  ScreenHeader,
  Skeleton,
  SmartImage,
  StatusBadge,
  STATUS_META,
} from '../../components/UI';
import { orderRepository } from '../../repositories/orderRepository';
import { canCancelOrder, formatDateTime, formatPrice } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Order, OrderStatus } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetails'>;

const TIMELINE: { status: OrderStatus; label: string; icon: string }[] = [
  { status: 'received', label: 'تم استلام الطلب', icon: 'clipboard-check-outline' },
  { status: 'confirmed', label: 'تم تأكيد الطلب', icon: 'check-decagram-outline' },
  { status: 'preparing', label: 'جاري تجهيز الطلب', icon: 'package-variant-closed' },
  { status: 'out_for_delivery', label: 'خرج للتوصيل', icon: 'truck-delivery-outline' },
  { status: 'delivered', label: 'تم التسليم', icon: 'check-circle-outline' },
];

export default function OrderDetailsScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { theme, user, cancelOrder, confirm, toast } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const o = await orderRepository.getOrder(user, orderId);
      setOrder(o);
      setError(null);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [user, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live timeline: refresh while the order is still moving
  useEffect(() => {
    if (!order || !['received', 'confirmed', 'preparing', 'out_for_delivery'].includes(order.status))
      return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [order, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onCancel = async () => {
    if (!order) return;
    const ok = await confirm({
      title: 'إلغاء الطلب',
      message: `هل تريدين إلغاء الطلب ${order.id}؟ سيعاد المنتجات إلى المخزون.`,
      confirmText: 'نعم، إلغاء',
      destructive: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelOrder(order.id);
      await load();
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (error && !order) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل الطلب" onBack={() => navigation.goBack()} />
        <EmptyState emoji="⚠️" title="تعذّر عرض الطلب" message={error} actionTitle="إعادة المحاولة" onAction={load} />
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل الطلب" onBack={() => navigation.goBack()} />
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton h={90} r={20} />
          <Skeleton h={180} r={20} />
          <Skeleton h={140} r={20} />
        </View>
      </Screen>
    );
  }

  const cancelled = order.status === 'cancelled';
  const currentIndex = TIMELINE.findIndex((t) => t.status === order.status);

  return (
    <Screen>
      <ScreenHeader
        title={order.id}
        subtitle={formatDateTime(order.createdAt)}
        onBack={() => navigation.goBack()}
        right={<StatusBadge status={order.status} />}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.c.primary} colors={[theme.c.primary]} />}
      >
        {/* Timeline */}
        <Card style={{ gap: 4 }}>
          <AppText size={16} weight="bold" style={{ marginBottom: 10 }}>
            تتبّع الطلب
          </AppText>
          {TIMELINE.map((step, idx) => {
            const done = !cancelled && idx <= currentIndex;
            const current = !cancelled && idx === currentIndex;
            const meta = STATUS_META[step.status];
            const historyEntry = order.history.find((h) => h.status === step.status);
            return (
              <View key={step.status} style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <View style={{ alignItems: 'center', width: 40 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: done ? meta.bg : theme.c.surfaceAlt,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: current ? 2 : 0,
                      borderColor: theme.c.primary,
                    }}
                  >
                    <MaterialCommunityIcons
                      name={step.icon as never}
                      size={19}
                      color={done ? meta.fg : theme.c.textMuted}
                    />
                  </View>
                  {idx < TIMELINE.length - 1 ? (
                    <View
                      style={{
                        width: 2.5,
                        flex: 1,
                        minHeight: 26,
                        backgroundColor: !cancelled && idx < currentIndex ? theme.c.success : theme.c.border,
                        marginVertical: 3,
                      }}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingBottom: idx < TIMELINE.length - 1 ? 16 : 4 }}>
                  <AppText size={14.5} weight={current ? 'bold' : 'medium'} color={done ? theme.c.text : theme.c.textMuted}>
                    {step.label}
                  </AppText>
                  {historyEntry ? (
                    <AppText size={11.5} color={theme.c.textMuted}>
                      {formatDateTime(historyEntry.at)}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })}
          {cancelled ? (
            <Animated.View entering={FadeIn} style={{ marginTop: 8, backgroundColor: theme.c.dangerSoft, borderRadius: theme.radius.md, padding: 12, gap: 4 }}>
              <Row gap={8}>
                <MaterialCommunityIcons name="close-circle" size={20} color={theme.c.danger} />
                <AppText size={14.5} weight="bold" color={theme.c.danger}>
                  تم إلغاء الطلب
                </AppText>
              </Row>
              <AppText size={12.5} color={theme.c.textMuted} style={{ textAlign: 'right' }}>
                {order.history.find((h) => h.status === 'cancelled')
                  ? formatDateTime(order.history.find((h) => h.status === 'cancelled')!.at)
                  : ''}
              </AppText>
            </Animated.View>
          ) : null}
        </Card>

        {/* Items */}
        <Card style={{ gap: 12 }}>
          <AppText size={16} weight="bold">
            المنتجات ({order.items.length})
          </AppText>
          {order.items.map((item, idx) => (
            <Row key={`${item.productId}-${idx}`} gap={10} style={{ alignItems: 'flex-start' }}>
              <PressableView onPress={() => navigation.navigate('ProductDetails', { productId: item.productId })}>
                <SmartImage uri={item.image} radius={12} style={{ width: 58, height: 58 }} />
              </PressableView>
              <View style={{ flex: 1, gap: 3 }}>
                <AppText size={13.5} weight="medium" numberOfLines={2}>
                  {item.name}
                </AppText>
                <AppText size={12} color={theme.c.textMuted}>
                  الكمية: {item.qty}
                  {item.variantLabels.length ? ` • ${item.variantLabels.join(' • ')}` : ''}
                </AppText>
                <AppText size={13} weight="bold" color={theme.c.primary}>
                  {formatPrice(item.unitPrice * item.qty)}
                </AppText>
              </View>
            </Row>
          ))}
        </Card>

        {/* Delivery info */}
        <Card style={{ gap: 10 }}>
          <AppText size={16} weight="bold">
            معلومات التوصيل
          </AppText>
          {[
            { icon: 'account-outline', label: 'الاسم', value: order.customerName },
            { icon: 'phone-outline', label: 'الهاتف', value: order.phone },
            { icon: 'map-marker-outline', label: 'العنوان', value: `${order.commune}، ${order.wilaya}` },
            { icon: 'home-outline', label: 'التفاصيل', value: order.address },
            ...(order.notes ? [{ icon: 'note-text-outline', label: 'ملاحظات', value: order.notes }] : []),
            { icon: 'cash-check', label: 'الدفع', value: 'الدفع عند الاستلام' },
          ].map((row) => (
            <Row key={row.label} gap={10} style={{ alignItems: 'flex-start' }}>
              <MaterialCommunityIcons name={row.icon as never} size={18} color={theme.c.textMuted} style={{ marginTop: 2 }} />
              <AppText size={12.5} color={theme.c.textMuted} style={{ width: 62 }}>
                {row.label}
              </AppText>
              <AppText size={13.5} weight="medium" style={{ flex: 1 }}>
                {row.value}
              </AppText>
            </Row>
          ))}
        </Card>

        {/* Totals */}
        <Card style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={14} color={theme.c.textMuted}>المجموع الفرعي</AppText>
            <AppText size={14} weight="medium">{formatPrice(order.subtotal)}</AppText>
          </Row>
          {order.discount > 0 ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={14} color={theme.c.success}>الخصم {order.couponCode ? `(${order.couponCode})` : ''}</AppText>
              <AppText size={14} weight="medium" color={theme.c.success}>-{formatPrice(order.discount)}</AppText>
            </Row>
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={14} color={theme.c.textMuted}>رسوم التوصيل</AppText>
            <AppText size={14} weight="medium" color={order.deliveryFee === 0 ? theme.c.success : theme.c.text}>
              {order.deliveryFee === 0 ? 'مجاني' : formatPrice(order.deliveryFee)}
            </AppText>
          </Row>
          <View style={{ height: 1, backgroundColor: theme.c.border }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={16} weight="bold">الإجمالي</AppText>
            <AppText size={18} weight="bold" color={theme.c.primary}>{formatPrice(order.total)}</AppText>
          </Row>
        </Card>

        {canCancelOrder(order.status) ? (
          <Button title="إلغاء الطلب" variant="danger" icon="close-circle-outline" onPress={onCancel} />
        ) : null}
        <Button
          title="تحديث الحالة"
          variant="outline"
          icon="refresh"
          onPress={async () => {
            await load();
            toast('تم تحديث الطلب.', 'info');
          }}
        />
      </ScrollView>
      <LoadingOverlay visible={cancelling} label="جارٍ الإلغاء…" />
    </Screen>
  );
}

function PressableView({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  const { Pressable } = require('react-native');
  return <Pressable onPress={onPress}>{children}</Pressable>;
}
