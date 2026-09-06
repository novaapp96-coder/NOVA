import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Field, Row, Screen, ScreenHeader, SelectField, SmartImage } from '../../components/UI';
import { OptionSheet } from '../../components/Pickers';
import { adminRepository } from '../../repositories/adminRepository';
import { uid } from '../../core/security';
import { messageOf } from '../../data/errors';
import type { ProductVariant } from '../../core/types';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminProductEdit'>;

export default function AdminProductEditScreen({ navigation, route }: Props) {
  const productId = route.params?.productId;
  const { theme, user, products, categories, toast, refreshCatalog } = useApp();
  const existing = products.find((p) => p.id === productId) ?? null;

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [price, setPrice] = useState('');
  const [oldPrice, setOldPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [newImage, setNewImage] = useState('');
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantType, setVariantType] = useState<'size' | 'color'>('size');
  const [variantValue, setVariantValue] = useState('');
  const [variantStock, setVariantStock] = useState('');
  const [featured, setFeatured] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setCategoryId(existing.categoryId);
      setPrice(String(existing.price));
      setOldPrice(existing.oldPrice ? String(existing.oldPrice) : '');
      setStock(String(existing.stock));
      setDescription(existing.description);
      setImages(existing.images);
      setVariants(existing.variants);
      setFeatured(existing.featured);
      setIsNew(existing.isNew);
      setHidden(existing.hidden);
    }
  }, [existing]);

  const addImage = () => {
    if (!newImage.trim()) return;
    if (!/^https?:\/\//.test(newImage.trim())) {
      toast('يرجى إدخال رابط صورة صحيح يبدأ بـ https://', 'error');
      return;
    }
    setImages([...images, newImage.trim()]);
    setNewImage('');
  };

  const addVariant = () => {
    if (!variantValue.trim()) {
      toast('يرجى إدخال قيمة المتغيّر.', 'error');
      return;
    }
    const qty = Math.max(0, parseInt(variantStock || '0', 10) || 0);
    setVariants([
      ...variants,
      {
        id: uid(),
        type: variantType,
        value: variantValue.trim(),
        stock: qty,
        swatch: variantType === 'color' ? '#B39DDB' : undefined,
      },
    ]);
    setVariantValue('');
    setVariantStock('');
  };

  const save = async () => {
    if (!user) return;
    const priceNum = parseInt(price || '0', 10);
    const oldNum = oldPrice ? parseInt(oldPrice, 10) : undefined;
    const stockNum = parseInt(stock || '0', 10);
    try {
      setSaving(true);
      await adminRepository.saveProduct(
        user,
        {
          name,
          categoryId,
          price: priceNum,
          oldPrice: oldNum,
          description,
          images,
          stock: stockNum,
          variants,
          featured,
          isNew,
          hidden,
        },
        productId,
      );
      await refreshCatalog();
      toast('تم حفظ المنتج بنجاح ✅', 'success');
      navigation.goBack();
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const category = categories.find((c) => c.id === categoryId);

  return (
    <Screen>
      <ScreenHeader
        title={productId ? 'تعديل المنتج' : 'منتج جديد'}
        subtitle={existing?.name}
        onBack={() => navigation.goBack()}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14 }}>
            <Field label="اسم المنتج" value={name} onChangeText={setName} icon="tag-outline" />
            <SelectField label="التصنيف" placeholder="اختاري التصنيف" value={category?.name} onPress={() => setCategoryOpen(true)} />
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              <Field label="السعر (دج)" value={price} onChangeText={setPrice} keyboardType="number-pad" style={{ flex: 1 }} />
              <Field label="السعر القديم (اختياري)" value={oldPrice} onChangeText={setOldPrice} keyboardType="number-pad" style={{ flex: 1 }} />
            </Row>
            <Field label="المخزون" value={stock} onChangeText={setStock} keyboardType="number-pad" icon="package-variant" />
            <Field label="الوصف" value={description} onChangeText={setDescription} multiline />
          </Card>

          <Card style={{ gap: 12 }}>
            <AppText size={16} weight="bold">
              صور المنتج ({images.length})
            </AppText>
            <Row gap={10} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {images.map((uri, i) => (
                <View key={`${uri}-${i}`}>
                  <SmartImage uri={uri} radius={14} style={{ width: 72, height: 72 }} />
                  <Pressable
                    onPress={() => setImages(images.filter((_, idx) => idx !== i))}
                    style={{ position: 'absolute', top: -6, left: -6, backgroundColor: theme.c.danger, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <MaterialCommunityIcons name="close" size={15} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </Row>
            <Row gap={10} style={{ alignItems: 'flex-end' }}>
              <Field
                label="رابط صورة جديدة"
                placeholder="https://…"
                value={newImage}
                onChangeText={setNewImage}
                autoCapitalize="none"
                style={{ flex: 1 }}
              />
              <Button title="إضافة" small onPress={addImage} />
            </Row>
          </Card>

          <Card style={{ gap: 12 }}>
            <AppText size={16} weight="bold">
              المتغيّرات (مقاس/لون)
            </AppText>
            {variants.map((v) => (
              <Row key={v.id} style={{ justifyContent: 'space-between' }}>
                <Row gap={8}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: v.swatch ?? theme.c.border }} />
                  <AppText size={13.5} weight="medium">
                    {v.type === 'size' ? 'المقاس' : 'اللون'}: {v.value} (مخزون {v.stock})
                  </AppText>
                </Row>
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={19}
                  color={theme.c.danger}
                  onPress={() => setVariants(variants.filter((x) => x.id !== v.id))}
                />
              </Row>
            ))}
            <Row gap={8}>
              <Pressable
                onPress={() => setVariantType('size')}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: variantType === 'size' ? theme.c.primary : theme.c.surfaceAlt }}
              >
                <AppText size={12.5} weight="bold" color={variantType === 'size' ? '#fff' : theme.c.textMuted}>
                  مقاس
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => setVariantType('color')}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: variantType === 'color' ? theme.c.primary : theme.c.surfaceAlt }}
              >
                <AppText size={12.5} weight="bold" color={variantType === 'color' ? '#fff' : theme.c.textMuted}>
                  لون
                </AppText>
              </Pressable>
            </Row>
            <Row gap={10} style={{ alignItems: 'flex-end' }}>
              <Field label="القيمة" placeholder={variantType === 'size' ? 'M / 38 …' : 'وردي'} value={variantValue} onChangeText={setVariantValue} style={{ flex: 1 }} />
              <Field label="المخزون" value={variantStock} onChangeText={setVariantStock} keyboardType="number-pad" style={{ width: 90 }} />
              <Button title="+" small onPress={addVariant} />
            </Row>
          </Card>

          <Card style={{ gap: 12 }}>
            <AppText size={16} weight="bold">
              خيارات العرض
            </AppText>
            {[
              { label: 'منتج مميز (يظهر في الرئيسية)', value: featured, set: setFeatured },
              { label: 'جديد ✨', value: isNew, set: setIsNew },
              { label: 'مخفي عن المتجر', value: hidden, set: setHidden },
            ].map((opt) => (
              <Pressable
                key={opt.label}
                onPress={() => opt.set(!opt.value)}
                style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <AppText size={14}>{opt.label}</AppText>
                <MaterialCommunityIcons
                  name={opt.value ? 'toggle-switch' : 'toggle-switch-off-outline'}
                  size={34}
                  color={opt.value ? theme.c.primary : theme.c.textMuted}
                />
              </Pressable>
            ))}
          </Card>

          <Button title={productId ? 'حفظ التعديلات' : 'إضافة المنتج'} icon="content-save-outline" loading={saving} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={categoryOpen}
        title="اختيار التصنيف"
        options={categories.map((c) => ({ value: c.id, label: c.name, emoji: c.emoji }))}
        value={categoryId}
        onSelect={setCategoryId}
        onClose={() => setCategoryOpen(false)}
      />
    </Screen>
  );
}
