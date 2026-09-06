import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Card, Row, Screen, ScreenHeader, Skeleton, StatusBadge } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { formatDateTime, formatPrice, isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { AdminStackParamList } from '../../navigation/types';

type Stats = Awaited<ReturnType<typeof adminRepository.getStats>>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const { theme, user, orders, toast } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin(user)) return;
    try {
      setStats(await adminRepository.getStats(user));
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  }, [user, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const cards: { icon: string; label: string; value: string; bg: string; fg: string }[] = stats
    ? [
        { icon: 'cash-multiple', label: 'مبيعات مُسلّمة', value: formatPrice(stats.totalSales), bg: theme.c.successSoft, fg: theme.c.success },
        { icon: 'calendar-today', label: 'مبيعات اليوم', value: formatPrice(stats.salesToday), bg: theme.c.primarySoft, fg: theme.c.primary },
        { icon: 'package-variant-closed', label: 'إجمالي الطلبات', value: `${stats.ordersCount}`, bg: '#E4EDFF', fg: '#2F6FED' },
        { icon: 'clock-outline', label: 'طلبات نشطة', value: `${stats.activeCount}`, bg: theme.c.warningSoft, fg: theme.c.warning },
        { icon: 'account-group-outline', label: 'العميلات', value: `${stats.customersCount}`, bg: theme.c.accentSoft, fg: theme.c.accent },
        { icon: 'alert-outline', label: 'مخزون منخفض', value: `${stats.lowStock}`, bg: theme.c.dangerSoft, fg: theme.c.danger },
      ]
    : [];

  const quick = [
    { icon: 'package-variant', label: 'المنتجات', go: () => navigation.navigate('AdminProducts') },
    { icon: 'truck-fast-outline', label: 'الطلبات', go: () => navigation.navigate('AdminOrders') },
    { icon: 'shape-outline', label: 'التصنيفات', go: () => navigation.navigate('AdminCategories') },
    { icon: 'ticket-outline', label: 'الكوبونات', go: () => navigation.navigate('AdminCoupons') },
    { icon: 'account-group-outline', label: 'العميلات', go: () => navigation.navigate('AdminCustomers') },
    { icon: 'bell-ring-outline', label: 'إشعار جديد', go: () => navigation.navigate('AdminNotifications') },
    { icon: 'cog-outline', label: 'الإعدادات', go: () => navigation.navigate('AdminSettings') },
  ];

  return (
    <Screen>
      <ScreenHeader
        title="لوحة الإدارة"
        subtitle={`مرحبًا، ${user?.name ?? ''} 🛡️`}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={theme.c.primary}
            colors={[theme.c.primary]}
          />
        }
      >
        {/* Stats */}
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {stats
            ? cards.map((c) => (
                <View key={c.label} style={{ width: '47.5%', flexGrow: 1 }}>
                  <Card style={{ gap: 8, backgroundColor: c.bg, borderColor: c.bg }}>
                    <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name={c.icon as never} size={20} color={c.fg} />
                    </View>
                    <AppText size={19} weight="bold" color={c.fg}>
                      {c.value}
                    </AppText>
                    <AppText size={12.5} color={theme.c.textMuted}>
                      {c.label}
                    </AppText>
                  </Card>
                </View>
              ))
            : [0, 1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={{ width: '47.5%', flexGrow: 1 }}>
                  <Skeleton h={110} r={20} />
                </View>
              ))}
        </View>

        {/* Quick actions */}
        <View style={{ gap: 12 }}>
          <AppText size={16} weight="bold">
            إدارة سريعة
          </AppText>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
            {quick.map((q) => (
              <Card
                key={q.label}
                style={{ width: 106, alignItems: 'center', gap: 8, paddingVertical: 14 }}
              >
                <MaterialCommunityIcons
                  name={q.icon as never}
                  size={24}
                  color={theme.c.primary}
                  onPress={q.go}
                />
                <AppText size={12} weight="medium" align="center" onPress={q.go}>
                  {q.label}
                </AppText>
              </Card>
            ))}
          </View>
        </View>

        {/* Recent orders */}
        <View style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={16} weight="bold">
              أحدث الطلبات
            </AppText>
            <AppText size={13} weight="bold" color={theme.c.primary} onPress={() => navigation.navigate('AdminOrders')}>
              عرض الكل
            </AppText>
          </Row>
          {orders.slice(0, 5).map((o) => (
            <Card
              key={o.id}
              style={{ gap: 8 }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ gap: 2 }}>
                  <AppText size={14} weight="bold" color={theme.c.primary} onPress={() => navigation.navigate('AdminOrderDetails', { orderId: o.id })}>
                    {o.id}
                  </AppText>
                  <AppText size={11.5} color={theme.c.textMuted}>
                    {formatDateTime(o.createdAt)}
                  </AppText>
                </View>
                <StatusBadge status={o.status} small />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText size={12.5} color={theme.c.textMuted}>
                  {o.customerName} • {o.phone}
                </AppText>
                <AppText size={13.5} weight="bold">
                  {formatPrice(o.total)}
                </AppText>
              </Row>
            </Card>
          ))}
          {!orders.length ? (
            <AppText size={13} color={theme.c.textMuted}>
              لا توجد طلبات بعد.
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
