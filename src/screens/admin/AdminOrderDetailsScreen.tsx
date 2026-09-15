import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, EmptyState, LoadingOverlay, Row, Screen, ScreenHeader, Skeleton, SmartImage, StatusBadge } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { formatDateTime, formatPrice, isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Order, OrderStatus } from '../../core/types';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminOrderDetails'>;

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'received', label: 'تم الاستلام' },
  { value: 'confirmed', label: 'تأكيد' },
  { value: 'preparing', label: 'تجهيز' },
  { value: 'out_for_delivery', label: 'خروج للتوصيل' },
  { value: 'delivered', label: 'تسليم' },
  { value: 'cancelled', label: 'إلغاء' },
];

export default function AdminOrderDetailsScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { theme, user, orders, toast, confirm, refreshOrders, refreshCatalog } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const local = orders.find((o) => o.id === orderId) ?? null;
    if (local) {
      setOrder(local);
      return;
    }
    // The app store holds only the signed-in user's orders, while the admin
    // list covers ALL users' orders — fetch any missing one via the admin
    // repository (orders.id stays TEXT: 'NOVA-000012'; no UUID/number parsing).
    try {
      setOrder(await adminRepository.getOrder(user, orderId));
    } catch {
      setOrder(null);
    }
  }, [orders, orderId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (status: OrderStatus) => {
    if (!isAdmin(user) || !order) return;
    const label = STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
    const ok = await confirm({
      title: `تغيير الحالة إلى «${label}»`,
      message: 'سيتم إرسال إشعار للعميلة بتحديث حالة الطلب.',
      confirmText: 'تأكيد و إرسال إشعار',
      destructive: status === 'cancelled',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await adminRepository.updateOrderStatus(user, order.id, status);
      setOrder(updated);
      await Promise.all([refreshOrders(), refreshCatalog()]);
      toast('تم تحديث الحالة وإرسال الإشعار ✅', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <Screen>
        <ScreenHeader title="تفاصيل الطلب" onBack={() => navigation.goBack()} />
        <EmptyState emoji="🧾" title="الطلب غير موجود" message="ربما تم حذفه أو تغيّر رقمه." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={order.id}
        subtitle={formatDateTime(order.createdAt)}
        onBack={() => navigation.goBack()}
        right={<StatusBadge status={order.status} small />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <Card style={{ gap: 10 }}>
          <AppText size={16} weight="bold">
            تغيير حالة الطلب
          </AppText>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
            {STATUS_OPTIONS.map((opt) => (
              <ChipLite
                key={opt.value}
                label={opt.label}
                active={order.status === opt.value}
                onPress={() => changeStatus(opt.value)}
              />
            ))}
          </View>
          <AppText size={12} color={theme.c.textMuted}>
            عند تغيير الحالة يصل إشعار فوري للعميلة بخصوص {order.id}.
          </AppText>
        </Card>

        <Card style={{ gap: 10 }}>
          <AppText size={16} weight="bold">
            بيانات العميلة
          </AppText>
          {[
            { icon: 'account-outline', label: order.customerName },
            { icon: 'phone-outline', label: order.phone },
            { icon: 'map-marker-outline', label: `${order.commune}، ${order.wilaya}` },
            { icon: 'home-outline', label: order.address },
            { icon: 'cash-check', label: 'الدفع عند الاستلام (COD)' },
          ].map((r) => (
            <Row key={r.icon} gap={10}>
              <MaterialCommunityIcons name={r.icon as never} size={18} color={theme.c.textMuted} />
              <AppText size={13.5} style={{ flex: 1 }}>
                {r.label}
              </AppText>
            </Row>
          ))}
        </Card>

        <Card style={{ gap: 12 }}>
          <AppText size={16} weight="bold">
            المنتجات
          </AppText>
          {order.items.map((item, idx) => (
            <Row key={`${item.productId}-${idx}`} gap={10} style={{ alignItems: 'flex-start' }}>
              <SmartImage uri={item.image} radius={12} style={{ width: 54, height: 54 }} />
              <View style={{ flex: 1, gap: 3 }}>
                <AppText size={13.5} weight="medium" numberOfLines={2}>
                  {item.name}
                </AppText>
                <AppText size={12} color={theme.c.textMuted}>
                  {item.qty} × {formatPrice(item.unitPrice)}
                </AppText>
              </View>
              <AppText size={13.5} weight="bold" color={theme.c.primary}>
                {formatPrice(item.unitPrice * item.qty)}
              </AppText>
            </Row>
          ))}
          <View style={{ height: 1, backgroundColor: theme.c.border }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={13} color={theme.c.textMuted}>المجموع الفرعي</AppText>
            <AppText size={13.5} weight="medium">{formatPrice(order.subtotal)}</AppText>
          </Row>
          {order.discount > 0 ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={13} color={theme.c.success}>الخصم</AppText>
              <AppText size={13.5} weight="medium" color={theme.c.success}>-{formatPrice(order.discount)}</AppText>
            </Row>
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={13} color={theme.c.textMuted}>التوصيل</AppText>
            <AppText size={13.5} weight="medium">{order.deliveryFee === 0 ? 'مجاني' : formatPrice(order.deliveryFee)}</AppText>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={15} weight="bold">الإجمالي</AppText>
            <AppText size={16} weight="bold" color={theme.c.primary}>{formatPrice(order.total)}</AppText>
          </Row>
        </Card>

        <Card style={{ gap: 8 }}>
          <AppText size={16} weight="bold">
            سجل الحالة
          </AppText>
          {order.history.map((h, i) => (
            <Row key={i} gap={8}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.c.primary }} />
              <AppText size={13} weight="medium" style={{ flex: 1 }}>
                {STATUS_OPTIONS.find((s) => s.value === h.status)?.label ?? h.status}
              </AppText>
              <AppText size={11.5} color={theme.c.textMuted}>
                {formatDateTime(h.at)}
              </AppText>
            </Row>
          ))}
        </Card>
      </ScrollView>
      <LoadingOverlay visible={busy} label="جارٍ تحديث الطلب…" />
    </Screen>
  );
}

function ChipLite({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { theme } = useApp();
  const { Pressable } = require('react-native');
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? theme.c.primary : theme.c.surfaceAlt,
      }}
    >
      <AppText size={12.5} weight="bold" color={active ? '#fff' : theme.c.textMuted}>
        {label}
      </AppText>
    </Pressable>
  );
}
