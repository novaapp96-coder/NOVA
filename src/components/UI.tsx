import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../state/AppProvider';
import { formatPrice } from '../core/logic';

/* ------------------------------- Typography -------------------------------- */

export function AppText({
  children,
  size = 14,
  weight = 'regular',
  color,
  style,
  numberOfLines,
  align,
  onPress,
}: {
  children: React.ReactNode;
  size?: number;
  weight?: 'regular' | 'medium' | 'bold';
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: 'right' | 'center' | 'left';
  onPress?: () => void;
}) {
  const { theme } = useApp();
  return (
    <Text
      numberOfLines={numberOfLines}
      onPress={onPress}
      style={[
        theme.text(size, weight, color ?? theme.c.text),
        align ? { textAlign: align } : null,
        style as never,
      ]}
    >
      {children}
    </Text>
  );
}

/* --------------------------------- Layout ---------------------------------- */

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { theme } = useApp();
  return (
    <View
      style={[
        {
          backgroundColor: theme.c.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.c.border,
          padding: padded ? 16 : 0,
        },
        theme.shadow(8),
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Row({
  children,
  style,
  gap = 8,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) {
  return <View style={[{ flexDirection: 'row-reverse', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useApp();
  return <View style={[{ flex: 1, backgroundColor: theme.c.bg }, style]}>{children}</View>;
}

/* --------------------------------- Header ---------------------------------- */

export function ScreenHeader({
  title,
  onBack,
  right,
  subtitle,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  subtitle?: string;
}) {
  const { theme } = useApp();
  return (
    <View
      style={[
        {
          flexDirection: 'row-reverse',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 12,
          backgroundColor: theme.c.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.c.border,
        },
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.c.primarySoft : theme.c.surfaceAlt,
          })}
        >
          <MaterialCommunityIcons name="chevron-right" size={26} color={theme.c.primary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText size={18} weight="bold" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText size={12} color={theme.c.textMuted} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/* --------------------------------- Buttons --------------------------------- */

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
  small = false,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'accent';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const { theme } = useApp();
  const bg =
    variant === 'primary'
      ? theme.c.primary
      : variant === 'danger'
      ? theme.c.danger
      : variant === 'accent'
      ? theme.c.accent
      : variant === 'outline'
      ? 'transparent'
      : theme.c.surfaceAlt;
  const fg = variant === 'outline' || variant === 'ghost' ? theme.c.primary : theme.c.onPrimary;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: theme.radius.pill,
          paddingVertical: small ? 9 : 14,
          paddingHorizontal: small ? 14 : 20,
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: theme.c.primary,
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
        },
        variant === 'primary' || variant === 'accent' ? theme.shadow(8) : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon as never} size={small ? 16 : 19} color={fg} /> : null}
          <Text style={[theme.text(small ? 13 : 15, 'bold', fg)]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  bg,
  size = 20,
  badge,
}: {
  icon: string;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  badge?: number;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg ?? theme.c.surfaceAlt,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon as never} size={size} color={color ?? theme.c.primary} />
      {badge && badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 17,
            height: 17,
            borderRadius: 9,
            paddingHorizontal: 3,
            backgroundColor: theme.c.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[theme.text(10, 'bold', '#fff'), { textAlign: 'center' }]}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/* --------------------------------- Inputs ---------------------------------- */

export function Field({
  label,
  error,
  style,
  ...props
}: TextInputProps & {
  label: string;
  error?: string | null;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  const { theme } = useApp();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      <AppText size={13} weight="medium" color={theme.c.textMuted}>
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row-reverse',
          alignItems: 'center',
          backgroundColor: theme.c.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: error ? theme.c.danger : focused ? theme.c.primary : theme.c.border,
          paddingHorizontal: 14,
        }}
      >
        <TextInput
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor={theme.c.textMuted}
          style={[
            theme.text(props.multiline ? 14 : 15, 'regular'),
            {
              flex: 1,
              paddingVertical: props.multiline ? 12 : 13,
              textAlignVertical: props.multiline ? 'top' : 'center',
              minHeight: props.multiline ? 90 : undefined,
            },
            style as never,
          ]}
        />
        {props.icon ? (
          <MaterialCommunityIcons name={props.icon as never} size={19} color={theme.c.textMuted} />
        ) : null}
      </View>
      {error ? (
        <AppText size={12} color={theme.c.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/* --------------------------------- Chips ----------------------------------- */

export function Chip({
  label,
  active = false,
  onPress,
  emoji,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  emoji?: string;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: theme.radius.pill,
        backgroundColor: active ? theme.c.primary : theme.c.surface,
        borderWidth: 1,
        borderColor: active ? theme.c.primary : theme.c.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {emoji ? <AppText size={14}>{emoji}</AppText> : null}
      <AppText size={13} weight="medium" color={active ? theme.c.onPrimary : theme.c.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

/* --------------------------------- Rating ---------------------------------- */

export function RatingStars({ rating, size = 14, count }: { rating: number; size?: number; count?: number }) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={(i <= Math.round(rating) ? 'star' : 'star-outline') as never}
          size={size}
          color={theme.c.star}
        />
      ))}
      <AppText size={12} color={theme.c.textMuted} style={{ marginRight: 4 }}>
        {rating > 0 ? rating.toFixed(1) : '—'}
        {count !== undefined ? ` (${count})` : ''}
      </AppText>
    </View>
  );
}

/* --------------------------------- Price ----------------------------------- */

export function Price({
  value,
  old,
  size = 16,
}: {
  value: number;
  old?: number;
  size?: number;
}) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
      <AppText size={size} weight="bold" color={theme.c.primary}>
        {formatPrice(value)}
      </AppText>
      {old && old > value ? (
        <AppText size={size - 3} color={theme.c.textMuted} style={{ textDecorationLine: 'line-through' }}>
          {formatPrice(old)}
        </AppText>
      ) : null}
    </View>
  );
}

/* ------------------------------- Empty state -------------------------------- */

export function EmptyState({
  emoji,
  title,
  message,
  actionTitle,
  onAction,
}: {
  emoji: string;
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  const { theme } = useApp();
  return (
    <Animated.View entering={FadeIn.duration(280)} style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 32, gap: 10 }}>
      <View
        style={{
          width: 92,
          height: 92,
          borderRadius: 46,
          backgroundColor: theme.c.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppText size={40}>{emoji}</AppText>
      </View>
      <AppText size={17} weight="bold" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText size={14} color={theme.c.textMuted} align="center">
          {message}
        </AppText>
      ) : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} style={{ marginTop: 10, paddingHorizontal: 28 }} />
      ) : null}
    </Animated.View>
  );
}

/* -------------------------------- Skeleton --------------------------------- */

export function Skeleton({ w = '100%', h = 16, r = 10, style }: { w?: number | string; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const { theme } = useApp();
  const pulse = useSharedValue(0.45);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[
        { width: w as never, height: h, borderRadius: r, backgroundColor: theme.dark ? theme.c.border : '#E9E3F5' },
        animated,
        style,
      ]}
    />
  );
}

/* ------------------------------ Smart image -------------------------------- */

export function SmartImage({
  uri,
  style,
  emoji = '🛍️',
  radius = 0,
}: {
  uri?: string;
  style?: StyleProp<ViewStyle>;
  emoji?: string;
  radius?: number;
}) {
  const { theme } = useApp();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  if (!uri || failed) {
    return (
      <View
        style={[
          { backgroundColor: theme.c.primarySoft, alignItems: 'center', justifyContent: 'center', borderRadius: radius },
          style as never,
        ]}
      >
        <AppText size={30}>{emoji}</AppText>
      </View>
    );
  }
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: theme.c.surfaceAlt }, style as never]}>
      <Image
        source={{ uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        transition={220}
        onError={() => setFailed(true)}
        onLoad={() => setReady(true)}
        cachePolicy="memory-disk"
      />
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <AppText size={26}>{emoji}</AppText>
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------- Quantity stepper ------------------------------ */

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  compact = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  compact?: boolean;
}) {
  const { theme } = useApp();
  const btn = (icon: string, disabled: boolean, onPress: () => void) => (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        width: compact ? 28 : 34,
        height: compact ? 28 : 34,
        borderRadius: compact ? 14 : 17,
        backgroundColor: disabled ? theme.c.surfaceAlt : theme.c.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <MaterialCommunityIcons name={icon as never} size={compact ? 15 : 18} color={disabled ? theme.c.textMuted : theme.c.primary} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
      {btn('plus', value >= max, () => onChange(Math.min(max, value + 1)))}
      <AppText size={15} weight="bold" style={{ minWidth: 22, textAlign: 'center' }}>
        {value}
      </AppText>
      {btn('minus', value <= min, () => onChange(Math.max(min, value - 1)))}
    </View>
  );
}

/* ------------------------------ Status badge -------------------------------- */

export const STATUS_META: Record<string, { label: string; icon: string; fg: string; bg: string }> = {
  received: { label: 'تم الاستلام', icon: 'clipboard-check-outline', fg: '#7C5CFC', bg: '#EFEAFF' },
  confirmed: { label: 'تم التأكيد', icon: 'check-decagram-outline', fg: '#2F6FED', bg: '#E4EDFF' },
  preparing: { label: 'قيد التجهيز', icon: 'package-variant-closed', fg: '#E8930C', bg: '#FDF1DC' },
  out_for_delivery: { label: 'خرج للتوصيل', icon: 'truck-delivery-outline', fg: '#D9603A', bg: '#FDEAE2' },
  delivered: { label: 'تم التسليم', icon: 'check-circle-outline', fg: '#1FA971', bg: '#E3F7EE' },
  cancelled: { label: 'تم الإلغاء', icon: 'close-circle-outline', fg: '#E2446B', bg: '#FCE7ED' },
};

export function StatusBadge({ status, small = false }: { status: string; small?: boolean }) {
  const meta = STATUS_META[status] ?? STATUS_META.received;
  return (
    <View
      style={{
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 5,
        backgroundColor: meta.bg,
        paddingHorizontal: small ? 8 : 11,
        paddingVertical: small ? 4 : 6,
        borderRadius: 999,
      }}
    >
      <MaterialCommunityIcons name={meta.icon as never} size={small ? 13 : 15} color={meta.fg} />
      <Text style={{ fontSize: small ? 11 : 12.5, color: meta.fg, fontFamily: 'Tajawal_700Bold' }}>{meta.label}</Text>
    </View>
  );
}

/* --------------------------- Section header --------------------------------- */

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 5, height: 20, borderRadius: 3, backgroundColor: theme.c.accent }} />
        <AppText size={17} weight="bold">
          {title}
        </AppText>
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText size={13} weight="medium" color={theme.c.primary}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ------------------------------- Alert overlay ------------------------------ */

export function Toasts() {
  const { toasts, theme } = useApp();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 96, left: 16, right: 16, gap: 8 }}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={FadeInDown.springify().damping(16)}
          style={{
            backgroundColor: t.type === 'error' ? theme.c.danger : t.type === 'success' ? theme.c.success : theme.c.text,
            borderRadius: theme.radius.md,
            paddingHorizontal: 16,
            paddingVertical: 12,
            ...theme.shadow(10),
          }}
        >
          <AppText size={13.5} weight="medium" color="#fff">
            {t.message}
          </AppText>
        </Animated.View>
      ))}
    </View>
  );
}

export function ConfirmDialog() {
  const { confirmRequest, resolveConfirm, theme } = useApp();
  if (!confirmRequest) return null;
  return (
    <View
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.c.overlay,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}
    >
      <Animated.View entering={FadeIn.duration(180)} style={{ width: '100%', maxWidth: 340 }}>
        <Card style={{ gap: 10 }}>
          <AppText size={17} weight="bold" align="center">
            {confirmRequest.title}
          </AppText>
          {confirmRequest.message ? (
            <AppText size={14} color={theme.c.textMuted} align="center">
              {confirmRequest.message}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row-reverse', gap: 10, marginTop: 10 }}>
            <Button
              title={confirmRequest.cancelText ?? 'تراجع'}
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => resolveConfirm(false)}
            />
            <Button
              title={confirmRequest.confirmText ?? 'تأكيد'}
              variant={confirmRequest.destructive ? 'danger' : 'primary'}
              style={{ flex: 1 }}
              onPress={() => resolveConfirm(true)}
            />
          </View>
        </Card>
      </Animated.View>
    </View>
  );
}

export function LoadingOverlay({ visible, label = 'يرجى الانتظار…' }: { visible: boolean; label?: string }) {
  const { theme } = useApp();
  if (!visible) return null;
  return (
    <View
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.c.overlay,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <View style={{ backgroundColor: theme.c.surface, borderRadius: 22, padding: 22, alignItems: 'center', gap: 10 }}>
        <ActivityIndicator color={theme.c.primary} size="large" />
        <AppText size={13.5} weight="medium">
          {label}
        </AppText>
      </View>
    </View>
  );
}

/* -------------------------------- Selector --------------------------------- */

export function SelectField({
  label,
  value,
  placeholder,
  onPress,
  error,
  icon = 'chevron-down',
}: {
  label: string;
  value?: string;
  placeholder: string;
  onPress: () => void;
  error?: string | null;
  icon?: string;
}) {
  const { theme } = useApp();
  return (
    <View style={{ gap: 6 }}>
      <AppText size={13} weight="medium" color={theme.c.textMuted}>
        {label}
      </AppText>
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: 'row-reverse',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.c.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: error ? theme.c.danger : theme.c.border,
          paddingHorizontal: 14,
          paddingVertical: 13.5,
        }}
      >
        <AppText size={15} color={value ? theme.c.text : theme.c.textMuted} numberOfLines={1}>
          {value || placeholder}
        </AppText>
        <MaterialCommunityIcons name={icon as never} size={19} color={theme.c.textMuted} />
      </Pressable>
      {error ? <AppText size={12} color={theme.c.danger}>{error}</AppText> : null}
    </View>
  );
}
