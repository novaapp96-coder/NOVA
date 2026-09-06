import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../../state/AppProvider';
import { AppText, Button, Card, Field, Row, Screen, ScreenHeader } from '../../components/UI';
import { SUPPORT_TOPICS } from '../../core/constants';
import { notificationRepository } from '../../repositories/notificationRepository';
import { messageOf } from '../../data/errors';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Support'>;

export default function SupportScreen({ navigation }: Props) {
  const { theme, settings, user, toast, refreshNotifications } = useApp();
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const phone = settings.supportPhone; // ADMIN-EDITABLE from Admin → Settings

  const call = async () => {
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      toast(`يمكنكِ الاتصال بنا على: ${phone}`, 'info');
    }
  };

  const whatsapp = async () => {
    const digits = phone.replace(/^0/, '213');
    try {
      await Linking.openURL(`https://wa.me/${digits}`);
    } catch {
      toast(`واتساب: ${phone}`, 'info');
    }
  };

  const send = async () => {
    if (subject.trim().length < 3 || message.trim().length < 5) {
      toast('يرجى إدخال موضوع ورسالة واضحتين.', 'error');
      return;
    }
    setSending(true);
    try {
      await notificationRepository.push({
        userId: user?.id ?? '*',
        title: `رسالة دعم: ${subject.trim()}`,
        body: `${message.trim()}${user ? ` — ${user.name} (${user.phone})` : ''}`,
        type: 'system',
      });
      await refreshNotifications();
      setSubject('');
      setMessage('');
      toast('تم إرسال رسالتكِ، سنجيبكِ في أقرب وقت 💜', 'success');
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="تحتاجين مساعدة؟" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 10, backgroundColor: theme.c.primarySoft, borderColor: theme.c.primarySoft }}>
          <Row gap={10}>
            <MaterialCommunityIcons name="headset" size={26} color={theme.c.primary} />
            <AppText size={17} weight="bold" color={theme.c.primary} style={{ flex: 1 }}>
              نحن هنا لمساعدتكِ
            </AppText>
          </Row>
          <AppText size={14} color={theme.c.text} style={{ lineHeight: 23 }}>
            هل لديكِ استفسار أو مشكلة في طلبك؟ نحن هنا لمساعدتك.
          </AppText>
        </Card>

        <Card style={{ gap: 12 }}>
          <AppText size={16} weight="bold">
            تواصلي معنا
          </AppText>
          <View style={{ backgroundColor: theme.c.surfaceAlt, borderRadius: theme.radius.md, padding: 14 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText size={13} color={theme.c.textMuted}>
                رقم التواصل
              </AppText>
              <AppText size={16} weight="bold" color={theme.c.primary} style={{ letterSpacing: 1 }}>
                {phone}
              </AppText>
            </Row>
          </View>
          <Row gap={10}>
            <Button title="اتصال" icon="phone-outline" style={{ flex: 1 }} onPress={call} />
            <Button title="واتساب" icon="whatsapp" variant="outline" style={{ flex: 1 }} onPress={whatsapp} />
          </Row>
          <AppText size={12} color={theme.c.textMuted} align="center">
            الاتصال ليس الطريقة الوحيدة — يمكنكِ إرسال رسالة من النموذج أدناه وسيصلكِ الرد عبر الإشعارات.
          </AppText>
        </Card>

        <Card style={{ gap: 12 }}>
          <AppText size={16} weight="bold">
            أرسلي رسالة
          </AppText>
          <Field label="الموضوع" placeholder="مثال: استفسار عن طلبي MC-2026-0001" value={subject} onChangeText={setSubject} icon="tag-outline" />
          <Field
            label="الرسالة"
            placeholder="اكتبي تفاصيل استفساركِ هنا…"
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <Button title="إرسال الرسالة" icon="send-outline" loading={sending} onPress={send} />
        </Card>

        <View style={{ gap: 10 }}>
          <AppText size={16} weight="bold">
            الأسئلة الشائعة
          </AppText>
          {SUPPORT_TOPICS.map((t) => {
            const open = openTopic === t.id;
            return (
              <Pressable key={t.id} onPress={() => setOpenTopic(open ? null : t.id)}>
                <Card style={{ gap: 8 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <AppText size={14.5} weight="bold" style={{ flex: 1 }}>
                      {t.title}
                    </AppText>
                    <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={22} color={theme.c.textMuted} />
                  </Row>
                  {open ? (
                    <AppText size={13.5} color={theme.c.textMuted} style={{ lineHeight: 22 }}>
                      {t.body}
                    </AppText>
                  ) : null}
                </Card>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}
