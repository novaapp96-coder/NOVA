import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import { AppText, Card, EmptyState, Row, Screen, ScreenHeader } from '../../components/UI';
import { timeAgo } from '../../core/logic';
import type { NotificationType } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const TYPE_META: Record<NotificationType, { icon: string; bg: string; fg: string }> = {
  order: { icon: 'package-variant-closed', bg: '#EFEAFF', fg: '#7C5CFC' },
  promo: { icon: 'sale', bg: '#FFE7F0', fg: '#FF7BA9' },
  system: { icon: 'information-outline', bg: '#E4EDFF', fg: '#2F6FED' },
};

export default function NotificationsScreen({ navigation }: Props) {
  const { theme, notifications, unreadCount, markAllNotificationsRead, refreshNotifications } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <Screen>
      <ScreenHeader
        title="الإشعارات"
        subtitle={unreadCount ? `${unreadCount} إشعار غير مقروء` : 'كل الإشعارات مقروءة'}
        onBack={() => navigation.goBack()}
        right={
          unreadCount ? (
            <Pressable onPress={markAllNotificationsRead} hitSlop={8}>
              <AppText size={13} weight="bold" color={theme.c.primary}>
                قراءة الكل
              </AppText>
            </Pressable>
          ) : null
        }
      />
      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refreshNotifications();
              setRefreshing(false);
            }}
            tintColor={theme.c.primary}
            colors={[theme.c.primary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            emoji="🔔"
            title="لا توجد إشعارات"
            message="ستصلكِ هنا تحديثات طلباتكِ والعروض الخاصة."
          />
        }
        renderItem={({ item, index }) => {
          const meta = TYPE_META[item.type] ?? TYPE_META.system;
          return (
            <Animated.View entering={FadeInDown.delay(index * 40).duration(260)}>
              <Pressable
                onPress={() => {
                  if (item.orderId) navigation.navigate('OrderDetails', { orderId: item.orderId });
                }}
              >
                <Card style={{ gap: 8, opacity: item.read ? 0.72 : 1 }}>
                  <Row gap={10} style={{ alignItems: 'flex-start' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 16, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name={meta.icon as never} size={19} color={meta.fg} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <AppText size={14} weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                          {item.title}
                        </AppText>
                        {!item.read ? (
                          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: theme.c.accent }} />
                        ) : null}
                      </Row>
                      <AppText size={12.5} color={theme.c.textMuted} style={{ lineHeight: 20 }}>
                        {item.body}
                      </AppText>
                      <AppText size={11} color={theme.c.textMuted}>
                        {timeAgo(item.createdAt)}
                      </AppText>
                    </View>
                  </Row>
                  {item.orderId ? (
                    <AppText size={12} color={theme.c.primary} weight="medium" style={{ textAlign: 'right' }}>
                      عرض الطلب {item.orderId} ←
                    </AppText>
                  ) : null}
                </Card>
              </Pressable>
            </Animated.View>
          );
        }}
      />
    </Screen>
  );
}
