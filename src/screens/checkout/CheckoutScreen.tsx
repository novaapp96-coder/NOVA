import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Field,
  LoadingOverlay,
  Row,
  Screen,
  ScreenHeader,
  SelectField,
  SmartImage,
} from '../../components/UI';
import { WilayaPicker } from '../../components/Pickers';
import { orderRepository } from '../../repositories/orderRepository';
import { computeTotals, formatPrice } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { Coupon, ResolvedCartItem } from '../../core/types';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

export default function CheckoutScreen({ navigation }: Props) {
  const { theme, user, cart, settings, addresses, checkout, toast } = useApp();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [wilaya, setWilaya] = useState('');
  const [commune, setCommune] = useState('');
  const [street, setStreet] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wilayaOpen, setWilayaOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [lines, setLines] = useState<ResolvedCartItem[]>(cart);

  // Prefill from default address
  useEffect(() => {
    const addr = addresses.find((a) => a.isDefault) ?? addresses[0];
    if (addr) {
      setName((n) => n || addr.fullName);
      setPhone((p) => p || addr.phone);
      setWilaya((w) => w || addr.wilaya);
      setCommune((c) => c || addr.commune);
      setStreet((s) => s || addr.street);
    }
  }, [addresses]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.product.price * l.item.qty, 0),
    [lines],
  );
  const totals = useMemo(
    () => computeTotals({ subtotal, coupon, settings }),
    [subtotal, coupon, settings],
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 3) e.name = 'يرجى إدخال الاسم الكامل.';
    if (!/^0[5-7]\d{8}$/.test(phone.trim())) e.phone = 'رقم هاتف جزائري غير صحيح.';
    if (!wilaya) e.wilaya = 'يرجى اختيار الولاية.';
    if (!commune.trim()) e.commune = 'يرجى إدخال البلدية.';
    if (street.trim().length < 5) e.street = 'يرجى إدخال العنوان بالتفصيل.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const applyCoupon = async () => {
    if (!couponInput.trim()) {
      setCoupon(null);
      setCouponError(null);
      return;
    }
    try {
      const preview = await orderRepository.previewTotals(user as never, couponInput);
      if (preview.coupon) {
        setCoupon(preview.coupon);
        setCouponError(null);
        toast(`تم تطبيق الكوبون ${preview.coupon.code} 🎉`, 'success');
      } else {
        setCoupon(null);
        setCouponError(preview.couponError ?? 'الكوبون غير صالح.');
      }
    } catch (e) {
      setCouponError(messageOf(e));
    }
  };

  const placeOrder = async () => {
    if (!validate()) return;
    if (!lines.length) {
      toast('سلتكِ فارغة.', 'error');
      return;
    }
    setPlacing(true);
    try {
      const order = await checkout({
        fullName: name.trim(),
        phone: phone.trim(),
        wilaya,
        commune: commune.trim(),
        address: street.trim(),
        notes: notes.trim() || undefined,
        couponCode: coupon?.code,
      });
      navigation.replace('OrderSuccess', { orderId: order.id });
    } catch (e) {
      toast(messageOf(e, 'تعذّر إنشاء الطلب. حاولي مرة أخرى.'), 'error');
      try {
        setLines(await orderRepository.previewTotals(user as never).then((r) => r.lines));
      } catch {
        /* keep current lines */
      }
    } finally {
      setPlacing(false);
    }
  };

  if (!lines.length) {
    return (
      <Screen>
        <ScreenHeader title="إتمام الطلب" onBack={() => navigation.goBack()} />
        <EmptyState
          emoji="🛒"
          title="سلتكِ فارغة"
          message="أضيفي منتجات قبل إتمام الطلب."
          actionTitle="تصفّحي المنتجات"
          onAction={() => navigation.navigate('Main', { screen: 'Products' })}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="إتمام الطلب" subtitle="خطوة واحدة وتكون طلبكِ في طريقه" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          {/* Items summary */}
          <Card style={{ gap: 12 }}>
            <AppText size={16} weight="bold">
              منتجاتكِ ({lines.length})
            </AppText>
            {lines.map((l) => (
              <Row key={l.item.id} gap={10} style={{ alignItems: 'flex-start' }}>
                <SmartImage uri={l.product.images[0]} radius={12} style={{ width: 54, height: 54 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <AppText size={13.5} weight="medium" numberOfLines={1}>
                    {l.product.name}
                  </AppText>
                  <AppText size={12} color={theme.c.textMuted}>
                    الكمية: {l.item.qty}
                    {l.variantLabels.length ? ` • ${l.variantLabels.join(' • ')}` : ''}
                  </AppText>
                </View>
                <AppText size={13.5} weight="bold" color={theme.c.primary}>
                  {formatPrice(l.product.price * l.item.qty)}
                </AppText>
              </Row>
            ))}
          </Card>

          {/* Address form */}
          <Card style={{ gap: 14 }}>
            <AppText size={16} weight="bold">
              عنوان التوصيل
            </AppText>
            <Field label="الاسم الكامل" placeholder="الاسم واللقب" value={name} onChangeText={setName} error={errors.name} icon="account-outline" />
            <Field
              label="رقم الهاتف"
              placeholder="0550123456"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={10}
              error={errors.phone}
              icon="phone-outline"
            />
            <SelectField
              label="الولاية"
              placeholder="اختاري ولايتكِ"
              value={wilaya}
              error={errors.wilaya}
              onPress={() => setWilayaOpen(true)}
            />
            <Field label="البلدية" placeholder="اسم البلدية" value={commune} onChangeText={setCommune} error={errors.commune} icon="map-marker-outline" />
            <Field
              label="العنوان بالتفصيل"
              placeholder="الحي، الشارع، رقم العمارة…"
              value={street}
              onChangeText={setStreet}
              error={errors.street}
              icon="home-outline"
              multiline
            />
            <Field label="ملاحظات (اختياري)" placeholder="أي تفاصيل تساعد المندوب في الوصول…" value={notes} onChangeText={setNotes} icon="note-text-outline" multiline />
            {addresses.length ? (
              <Pressable
                onPress={() => {
                  const addr = addresses.find((a) => a.isDefault) ?? addresses[0];
                  setName(addr.fullName);
                  setPhone(addr.phone);
                  setWilaya(addr.wilaya);
                  setCommune(addr.commune);
                  setStreet(addr.street);
                  setErrors({});
                }}
              >
                <AppText size={13} color={theme.c.primary} weight="medium">
                  ↺ استخدام عنوان محفوظ من «عناويني»
                </AppText>
              </Pressable>
            ) : null}
          </Card>

          {/* Coupon */}
          <Card style={{ gap: 12 }}>
            <AppText size={16} weight="bold">
              كوبون الخصم
            </AppText>
            <Row gap={10} style={{ alignItems: 'flex-end' }}>
              <Field
                label="رمز الكوبون"
                placeholder="مثال: WELCOME10"
                value={couponInput}
                onChangeText={(t) => setCouponInput(t.toUpperCase())}
                autoCapitalize="characters"
                style={{ flex: 1 }}
                icon="ticket-outline"
              />
              <Button title="تطبيق" small onPress={applyCoupon} />
            </Row>
            {couponError ? (
              <AppText size={12.5} color={theme.c.danger}>
                {couponError}
              </AppText>
            ) : null}
            {coupon ? (
              <View style={{ backgroundColor: theme.c.successSoft, borderRadius: theme.radius.md, padding: 10 }}>
                <AppText size={12.5} color={theme.c.success} weight="bold" align="center">
                  ✓ تم تطبيق الكوبون {coupon.code} (خصم {formatPrice(totals.discount)})
                </AppText>
              </View>
            ) : null}
          </Card>

          {/* Payment */}
          <Card style={{ gap: 12 }}>
            <AppText size={16} weight="bold">
              طريقة الدفع
            </AppText>
            <View style={{ backgroundColor: theme.c.primarySoft, borderRadius: theme.radius.md, padding: 14, gap: 8 }}>
              <Row gap={10}>
                <MaterialCommunityIcons name="cash-check" size={22} color={theme.c.primary} />
                <AppText size={14.5} weight="bold" color={theme.c.primary}>
                  الدفع عند الاستلام (COD)
                </AppText>
                <View style={{ flex: 1 }} />
                <MaterialCommunityIcons name="check-circle" size={22} color={theme.c.primary} />
              </Row>
              <AppText size={12.5} color={theme.c.textMuted} style={{ textAlign: 'right' }}>
                تدفعين نقدًا عند وصول الطلب إلى بابكِ. لا حاجة لبطاقة بنكية.
              </AppText>
            </View>
            <View style={{ opacity: 0.55, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.c.border, padding: 14, gap: 6 }}>
              <Row gap={10}>
                <MaterialCommunityIcons name="credit-card-outline" size={20} color={theme.c.textMuted} />
                <AppText size={14} weight="medium" color={theme.c.textMuted}>
                  الدفع الإلكتروني — قريبًا
                </AppText>
              </Row>
              <AppText size={12} color={theme.c.textMuted} style={{ textAlign: 'right' }}>
                البنية جاهزة لتفعيل CIB / بطاقة ائتمان في تحديث قادم.
              </AppText>
            </View>
          </Card>

          {/* Totals */}
          <Card style={{ gap: 10 }}>
            <AppText size={16} weight="bold">
              ملخص المبلغ
            </AppText>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={14} color={theme.c.textMuted}>المجموع الفرعي</AppText>
              <AppText size={14} weight="medium">{formatPrice(totals.subtotal)}</AppText>
            </Row>
            {totals.discount > 0 ? (
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText size={14} color={theme.c.success}>الخصم</AppText>
                <AppText size={14} weight="medium" color={theme.c.success}>
                  -{formatPrice(totals.discount)}
                </AppText>
              </Row>
            ) : null}
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={14} color={theme.c.textMuted}>رسوم التوصيل</AppText>
              <AppText size={14} weight="medium" color={totals.deliveryFee === 0 ? theme.c.success : theme.c.text}>
                {totals.deliveryFee === 0 ? 'مجاني 🎉' : formatPrice(totals.deliveryFee)}
              </AppText>
            </Row>
            <View style={{ height: 1, backgroundColor: theme.c.border }} />
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={16} weight="bold">الإجمالي</AppText>
              <AppText size={19} weight="bold" color={theme.c.primary}>
                {formatPrice(totals.total)}
              </AppText>
            </Row>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 22, backgroundColor: theme.c.surface, borderTopWidth: 1, borderTopColor: theme.c.border }}>
        <Button title="تأكيد الطلب" icon="check-decagram-outline" loading={placing} onPress={placeOrder} />
      </View>

      <WilayaPicker visible={wilayaOpen} value={wilaya} onSelect={setWilaya} onClose={() => setWilayaOpen(false)} />
      <LoadingOverlay visible={placing} label="جارٍ تأكيد الطلب…" />
    </Screen>
  );
}
