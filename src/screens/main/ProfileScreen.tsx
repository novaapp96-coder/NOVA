import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Card, Row, Screen, ScreenHeader } from '../../components/UI';
import type { RootStackParamList } from '../../navigation/types';

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, user, logout, confirm, unreadCount, orders, favoriteIds, toast } = useApp();

  if (!user) return null;

  const activeOrders = orders.filter((o) =>
    ['received', 'confirmed', 'preparing', 'out_for_delivery'].includes(o.status),
  ).length;

  const menu: { icon: string; label: string; hint?: string; onPress: () => void }[] = [
    { icon: 'account-card-outline', label: 'معلومات الحساب', onPress: () => navigation.navigate('MyInfo') },
    { icon: 'package-variant-closed', label: 'طلباتي', hint: activeOrders ? `${activeOrders} جارية` : undefined, onPress: () => navigation.navigate('Main', { screen: 'Orders' }) },
    { icon: 'heart-outline', label: 'المفضلة', hint: `${favoriteIds.length}`, onPress: () => navigation.navigate('Favorites') },
    { icon: 'map-marker-outline', label: 'عناويني', hint: undefined, onPress: () => navigation.navigate('Addresses') },
    { icon: 'bell-outline', label: 'الإشعارات', hint: unreadCount ? `${unreadCount} جديد` : undefined, onPress: () => navigation.navigate('Notifications') },
    { icon: 'headset', label: 'المساعدة', onPress: () => navigation.navigate('Support') },
    { icon: 'information-outline', label: 'من نحن', onPress: () => navigation.navigate('About') },
    { icon: 'file-document-outline', label: 'الشروط والأحكام', onPress: () => navigation.navigate('Terms') },
    { icon: 'shield-lock-outline', label: 'سياسة الخصوصية', onPress: () => navigation.navigate('Privacy') },
  ];

  const doLogout = async () => {
    const ok = await confirm({
      title: 'تسجيل الخروج',
      message: 'هل تريدين الخروج من حسابكِ؟',
      confirmText: 'خروج',
      destructive: true,
    });
    if (ok) {
      await logout();
      toast('تم تسجيل الخروج. ننتظركِ 💜', 'info');
    }
  };

  return (
    <Screen>
      <ScreenHeader title="حسابي" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <Card style={{ gap: 14 }}>
          <Row gap={14}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 24,
                backgroundColor: theme.c.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText size={24} weight="bold" color="#fff">
                {user.name.charAt(0)}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <AppText size={17} weight="bold" numberOfLines={1}>
                {user.name}
              </AppText>
              <AppText size={13.5} color={theme.c.textMuted}>
                {user.phone}
              </AppText>
              {user.role === 'admin' ? (
                <View style={{ alignSelf: 'flex-start', backgroundColor: theme.c.primarySoft, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}>
                  <AppText size={11.5} weight="bold" color={theme.c.primary}>
                    حساب إدارة 🛡️
                  </AppText>
                </View>
              ) : null}
            </View>
          </Row>
        </Card>

        {/* Menu */}
        <Card padded={false}>
          {menu.map((m, idx) => (
            <Pressable
              key={m.label}
              onPress={m.onPress}
              style={({ pressed }) => ({
                flexDirection: 'row-reverse',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 15,
                backgroundColor: pressed ? theme.c.surfaceAlt : 'transparent',
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: theme.c.border,
              })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: theme.c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name={m.icon as never} size={19} color={theme.c.primary} />
              </View>
              <AppText size={14.5} weight="medium" style={{ flex: 1 }}>
                {m.label}
              </AppText>
              {m.hint ? (
                <View style={{ backgroundColor: theme.c.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                  <AppText size={11.5} weight="bold" color={theme.c.accent}>
                    {m.hint}
                  </AppText>
                </View>
              ) : null}
              <MaterialCommunityIcons name="chevron-left" size={22} color={theme.c.textMuted} />
            </Pressable>
          ))}
        </Card>

        {user.role === 'admin' ? (
          <Pressable onPress={() => navigation.navigate('Admin')}>
            <Card style={{ backgroundColor: theme.c.primary, borderColor: theme.c.primary }}>
              <Row gap={12}>
                <MaterialCommunityIcons name="view-dashboard-outline" size={26} color="#fff" />
                <View style={{ flex: 1 }}>
                  <AppText size={16} weight="bold" color="#fff">
                    لوحة الإدارة
                  </AppText>
                  <AppText size={12.5} color="rgba(255,255,255,0.85)" style={{ textAlign: 'right' }}>
                    المنتجات، الطلبات، المخزون، العملاء والإعدادات
                  </AppText>
                </View>
                <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
              </Row>
            </Card>
          </Pressable>
        ) : null}

        <Pressable onPress={doLogout}>
          <Card style={{ backgroundColor: theme.c.dangerSoft, borderColor: theme.c.dangerSoft }}>
            <Row gap={10} style={{ justifyContent: 'center' }}>
              <MaterialCommunityIcons name="logout" size={20} color={theme.c.danger} />
              <AppText size={15} weight="bold" color={theme.c.danger}>
                تسجيل الخروج
              </AppText>
            </Row>
          </Card>
        </Pressable>

        <AppText size={11.5} color={theme.c.textMuted} align="center">
          Nova — الإصدار 1.0.0 💜
        </AppText>
      </ScrollView>
    </Screen>
  );
}
