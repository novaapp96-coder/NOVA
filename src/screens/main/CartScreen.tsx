import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  QuantityStepper,
  Row,
  Screen,
  ScreenHeader,
  SmartImage,
} from '../../components/UI';
import { computeTotals, formatPrice, cartSubtotal } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { RootStackParamList } from '../../navigation/types';

export default function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme, cart, settings, updateCartQty, removeFromCart, clearCart, user, toast, confirm } = useApp();
  const [busyLine, setBusyLine] = useState<string | null>(null);

  const subtotal = useMemo(() => cartSubtotal(cart), [cart]);
  const totals = useMemo(
    () => computeTotals({ subtotal, coupon: null, settings }),
    [subtotal, settings],
  );

  const changeQty = async (lineId: string, qty: number) => {
    setBusyLine(lineId);
    try {
      await updateCartQty(lineId, qty);
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setBusyLine(null);
    }
  };

  const remove = async (lineId: string, name: string) => {
    const ok = await confirm({
      title: 'حذف المنتج',
      message: `هل تريدين حذف «${name}» من السلة؟`,
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeFromCart(lineId);
    } catch (e) {
      toast(messageOf(e), 'error');
    }
  };

  const onClear = async () => {
    const ok = await confirm({
      title: 'تفريغ السلة',
      message: 'سيتم حذف جميع المنتجات من السلة.',
      confirmText: 'تفريغ',
      destructive: true,
    });
    if (!ok) return;
    await clearCart();
    toast('تم تفريغ السلة.', 'info');
  };

  const goCheckout = () => {
    if (!user) {
      toast('سجّلي الدخول لإتمام الطلب.', 'error');
      return;
    }
    navigation.navigate('Checkout');
  };

  if (!cart.length) {
    return (
      <Screen>
        <ScreenHeader title="سلة التسوق" />
        <EmptyState
          emoji="🛒"
          title="سلتكِ فارغة"
          message="سلتكِ فارغة، اكتشفي منتجاتنا وأضيفي ما يعجبكِ."
          actionTitle="تصفّحي المنتجات"
          onAction={() => navigation.navigate('Main', { screen: 'Products' })}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={`سلة التسوق (${cart.length})`}
        right={
          <Pressable onPress={onClear} hitSlop={8} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.c.danger} />
            <AppText size={13} color={theme.c.danger} weight="medium">
              تفريغ
            </AppText>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 190 }} showsVerticalScrollIndicator={false}>
        {cart.map((line, idx) => (
          <Animated.View key={line.item.id} entering={FadeInDown.delay(idx * 45).duration(280)} layout={Layout.springify()}>
            <Card padded={false} style={{ padding: 12 }}>
              <Row gap={12} style={{ alignItems: 'flex-start' }}>
                <Pressable onPress={() => navigation.navigate('ProductDetails', { productId: line.product.id })}>
                  <SmartImage uri={line.product.images[0]} radius={theme.radius.md} style={{ width: 78, height: 78 }} />
                </Pressable>
                <View style={{ flex: 1, gap: 6 }}>
                  <AppText size={14.5} weight="bold" numberOfLines={2}>
                    {line.product.name}
                  </AppText>
                  {line.variantLabels.length ? (
                    <AppText size={12} color={theme.c.textMuted}>
                      {line.variantLabels.join(' • ')}
                    </AppText>
                  ) : null}
                  <AppText size={15} weight="bold" color={theme.c.primary}>
                    {formatPrice(line.unitPrice)}
                  </AppText>
                </View>
                <Pressable onPress={() => remove(line.item.id, line.product.name)} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={20} color={theme.c.textMuted} />
                </Pressable>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 10 }}>
                <QuantityStepper
                  compact
                  value={line.item.qty}
                  max={Math.max(1, line.product.stock)}
                  onChange={(v) => changeQty(line.item.id, v)}
                />
                <AppText size={14} weight="bold" color={theme.c.text}>
                  {formatPrice(line.lineTotal)}
                </AppText>
              </Row>
            </Card>
          </Animated.View>
        ))}

        <View style={{ height: 6 }} />

        <Card style={{ gap: 12 }}>
          <AppText size={16} weight="bold">
            ملخص الطلب
          </AppText>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={14} color={theme.c.textMuted}>
              المجموع الفرعي
            </AppText>
            <AppText size={14} weight="medium">
              {formatPrice(totals.subtotal)}
            </AppText>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={14} color={theme.c.textMuted}>
              رسوم التوصيل
            </AppText>
            <AppText size={14} weight="medium" color={totals.deliveryFee === 0 ? theme.c.success : theme.c.text}>
              {totals.deliveryFee === 0 ? 'مجاني 🎉' : formatPrice(totals.deliveryFee)}
            </AppText>
          </Row>
          {totals.freeDeliveryUnlocked ? (
            <View style={{ backgroundColor: theme.c.successSoft, borderRadius: theme.radius.md, padding: 10 }}>
              <AppText size={12.5} color={theme.c.success} weight="medium" align="center">
                🎉 ربحتِ الشحن المجاني! تسوقي أكثر ووفّري أكثر
              </AppText>
            </View>
          ) : (
            <View style={{ backgroundColor: theme.c.surfaceAlt, borderRadius: theme.radius.md, padding: 10 }}>
              <AppText size={12.5} color={theme.c.textMuted} align="center">
                أضيفي بقيمة {formatPrice(Math.max(0, settings.freeDeliveryThreshold - subtotal))} للحصول على شحن مجاني
              </AppText>
            </View>
          )}
          <View style={{ height: 1, backgroundColor: theme.c.border }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText size={16} weight="bold">
              الإجمالي
            </AppText>
            <AppText size={18} weight="bold" color={theme.c.primary}>
              {formatPrice(totals.total)}
            </AppText>
          </Row>
        </Card>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          paddingBottom: 22,
          backgroundColor: theme.c.surface,
          borderTopWidth: 1,
          borderTopColor: theme.c.border,
        }}
      >
        <Button title={`إتمام الطلب — ${formatPrice(totals.total)}`} icon="arrow-left" onPress={goCheckout} />
      </View>
    </Screen>
  );
}
