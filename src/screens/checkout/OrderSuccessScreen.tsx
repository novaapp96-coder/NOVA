import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Row, Screen } from '../../components/UI';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderSuccess'>;

export default function OrderSuccessScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { theme } = useApp();
  const scale = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    scale.value = withSequence(
      withDelay(120, withSpring(1.12, { damping: 8 })),
      withSpring(1, { damping: 12 }),
    );
    fade.value = withDelay(320, withTiming(1, { duration: 320 }));
  }, [scale, fade]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const infoStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Screen>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 22 }}>
        <Animated.View style={[{ alignSelf: 'center' }, circleStyle]}>
          <View
            style={{
              width: 118,
              height: 118,
              borderRadius: 59,
              backgroundColor: theme.c.successSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: theme.c.success, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="check" size={52} color="#fff" />
            </View>
          </View>
        </Animated.View>

        <Animated.View style={[{ gap: 18 }, infoStyle]}>
          <View style={{ gap: 8 }}>
            <AppText size={24} weight="bold" align="center">
              تم استلام طلبكِ بنجاح 🎉
            </AppText>
            <AppText size={14.5} color={theme.c.textMuted} align="center" style={{ lineHeight: 23 }}>
              شكرًا لاختياركِ My Cart. سيتواصل فريقنا معكِ لتأكيد الطلب، وستصلكِ إشعارات عند كل تحديث.
            </AppText>
          </View>

          <Card style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={13.5} color={theme.c.textMuted}>
                رقم الطلب
              </AppText>
              <AppText size={16} weight="bold" color={theme.c.primary}>
                {orderId}
              </AppText>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={13.5} color={theme.c.textMuted}>
                طريقة الدفع
              </AppText>
              <AppText size={13.5} weight="medium">
                الدفع عند الاستلام
              </AppText>
            </Row>
          </Card>

          <View style={{ gap: 10 }}>
            <Button
              title="تتبع الطلب"
              icon="truck-fast-outline"
              onPress={() => navigation.replace('OrderDetails', { orderId })}
            />
            <Button
              title="متابعة التسوق"
              variant="outline"
              onPress={() => navigation.navigate('Main', { screen: 'Home' })}
            />
          </View>
        </Animated.View>
      </View>
    </Screen>
  );
}
