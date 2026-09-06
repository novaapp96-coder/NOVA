import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Field, Row, Screen, ScreenHeader } from '../../components/UI';
import { notificationRepository } from '../../repositories/notificationRepository';
import { messageOf } from '../../data/errors';
import { timeAgo } from '../../core/logic';
import type { AdminStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AdminStackParamList, 'AdminNotifications'>;

export default function AdminNotificationsScreen({ navigation }: Props) {
  const { theme, user, toast, notifications, refreshNotifications } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<'all' | 'me'>('all');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (title.trim().length < 3 || body.trim().length < 3) {
      toast('يرجى إدخال عنوان ونص الإشعار.', 'error');
      return;
    }
    setSending(true);
    try {
      await notificationRepository.push({
        userId: target === 'all' ? '*' : (user?.id ?? '*'),
        title: title.trim(),
        body: body.trim(),
        type: 'promo',
      });
      await refreshNotifications();
      setTitle('');
      setBody('');
      toast('تم إرسال الإشعار ✅', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setSending(false);
    }
  };

  const sent = notifications.filter((n) => n.type === 'promo' || n.type === 'system').slice(0, 12);

  return (
    <Screen>
      <ScreenHeader title="إدارة الإشعارات" subtitle="أرسلي إشعارات لعميلاتكِ" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14 }}>
            <Field label="عنوان الإشعار" placeholder="مثال: عرض خاص نهاية الأسبوع 🔥" value={title} onChangeText={setTitle} icon="title" />
            <Field label="نص الإشعار" placeholder="اكتبي نص الإشعار…" value={body} onChangeText={setBody} multiline />
            <Row gap={10}>
              <Button
                title="لكل العميلات"
                variant={target === 'all' ? 'primary' : 'outline'}
                small
                style={{ flex: 1 }}
                onPress={() => setTarget('all')}
              />
              <Button
                title="لي فقط"
                variant={target === 'me' ? 'primary' : 'outline'}
                small
                style={{ flex: 1 }}
                onPress={() => setTarget('me')}
              />
            </Row>
            <Button title="إرسال الإشعار" icon="send-outline" loading={sending} onPress={send} />
          </Card>

          <View style={{ gap: 10 }}>
            <AppText size={16} weight="bold">
              آخر الإشعارات المرسلة
            </AppText>
            {sent.map((n) => (
              <Card key={n.id} style={{ gap: 5, opacity: 0.9 }}>
                <AppText size={13.5} weight="bold" numberOfLines={1}>
                  {n.title}
                </AppText>
                <AppText size={12.5} color={theme.c.textMuted} numberOfLines={2}>
                  {n.body}
                </AppText>
                <AppText size={11} color={theme.c.textMuted}>
                  {n.userId === '*' ? 'كل العميلات' : 'موجّه'} • {timeAgo(n.createdAt)}
                </AppText>
              </Card>
            ))}
            {!sent.length ? (
              <AppText size={13} color={theme.c.textMuted}>
                لم تُرسل أي إشعارات بعد.
              </AppText>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
