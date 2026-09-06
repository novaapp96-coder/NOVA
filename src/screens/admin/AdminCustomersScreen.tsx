import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import { AppText, Card, EmptyState, Row, Screen, ScreenHeader, Skeleton } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import { formatDate, formatPrice, isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { AdminStackParamList } from '../../navigation/types';

type Customer = Awaited<ReturnType<typeof adminRepository.listCustomers>>[number];
type Props = NativeStackScreenProps<AdminStackParamList, 'AdminCustomers'>;

export default function AdminCustomersScreen({ navigation }: Props) {
  const { theme, user, toast } = useApp();
  const [customers, setCustomers] = useState<Customer[] | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin(user)) return;
    try {
      setCustomers(await adminRepository.listCustomers(user));
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  }, [user, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <ScreenHeader title="العميلات" subtitle={customers ? `${customers.length} عميلة` : '…'} onBack={() => navigation.goBack()} />
      <FlatList
        data={customers ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
        ListEmptyComponent={
          customers === null ? (
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} h={86} r={20} />
              ))}
            </View>
          ) : (
            <EmptyState emoji="👥" title="لا توجد عميلات بعد" message="ستظهر هنا كل العميلات المسجّلات." />
          )
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 35).duration(240)}>
            <Card style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={10}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <AppText size={17} weight="bold" color={theme.c.primary}>
                      {item.name.charAt(0)}
                    </AppText>
                  </View>
                  <View style={{ gap: 2 }}>
                    <AppText size={14.5} weight="bold">
                      {item.name}
                    </AppText>
                    <AppText size={12.5} color={theme.c.textMuted}>
                      {item.phone}
                      {item.email ? ` • ${item.email}` : ''}
                    </AppText>
                  </View>
                </Row>
                <MaterialCommunityIcons name="chevron-left" size={22} color={theme.c.textMuted} />
              </Row>
              <View style={{ height: 1, backgroundColor: theme.c.border }} />
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText size={12.5} color={theme.c.textMuted}>
                  عضوة منذ {formatDate(item.createdAt)}
                </AppText>
                <AppText size={13} weight="bold" color={theme.c.primary}>
                  {item.ordersCount} طلب • {formatPrice(item.totalSpent)}
                </AppText>
              </Row>
            </Card>
          </Animated.View>
        )}
      />
    </Screen>
  );
}
