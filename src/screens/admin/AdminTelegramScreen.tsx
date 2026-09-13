import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../state/AppProvider';
import { AppText, Card, Row, Screen, ScreenHeader } from '../../components/UI';
import { adminRepository } from '../../repositories/adminRepository';
import type { TelegramStatus } from '../../repositories/adminRepository';
import { isAdmin } from '../../core/logic';
import { messageOf } from '../../data/errors';
import type { AdminStackParamList } from '../../navigation/types';

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `قبل ${s} ثانية`;
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return `قبل ${Math.floor(h / 24)} يوم`;
}

export default function AdminTelegramScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const { theme, user, toast } = useApp();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin(user)) return;
    try {
      setStatus(await adminRepository.getTelegramStatus(user));
    } catch (e) {
      toast(messageOf(e), 'error');
    } finally {
      setLoaded(true);
    }
  }, [user, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh so the screen reflects the bot heartbeat quickly.
  React.useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const dot = (ok: boolean) => (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: ok ? theme.c.success : theme.c.danger,
      }}
    />
  );

  return (
    <Screen>
      <ScreenHeader
        title="تيليجرام"
        subtitle="حالة البوت والوكيل الذكي"
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={theme.c.primary}
            colors={[theme.c.primary]}
          />
        }
      >
        {!loaded ? (
          <Card>
            <AppText size={13} color={theme.c.textMuted}>
              جاري التحميل…
            </AppText>
          </Card>
        ) : !status ? (
          <Card style={{ gap: 8 }}>
            <AppText size={15} weight="bold">لا توجد بيانات حالة بعد</AppText>
            <AppText size={13} color={theme.c.textMuted}>
              لم يبلغ البوت عن نفسه بعد. شغّل الخادم (node telegram-bot.js) وتأكد من تنفيذ
              migration 003_telegram_status.sql في Supabase.
            </AppText>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              <Row>
                {dot(status.botRunning)}
                <AppText size={14} weight="bold">
                  {`البوت ${status.botRunning ? 'يعمل ✅' : 'متوقف ❌'}`}
                </AppText>
              </Row>
              <Row>
                <AppText size={13} color={theme.c.textMuted}>الوضع:</AppText>
                <AppText size={13}>{status.mode}</AppText>
              </Row>
              {status.botUsername ? (
                <Row>
                  <AppText size={13} color={theme.c.textMuted}>الحساب:</AppText>
                  <AppText size={13}>{`@${status.botUsername}`}</AppText>
                </Row>
              ) : null}
              {status.botVersion ? (
                <Row>
                  <AppText size={13} color={theme.c.textMuted}>الإصدار:</AppText>
                  <AppText size={13}>{status.botVersion}</AppText>
                </Row>
              ) : null}
              <Row>
                <AppText size={13} color={theme.c.textMuted}>آخر نبضة:</AppText>
                <AppText size={13}>{timeAgo(status.lastUpdateAt || status.updatedAt)}</AppText>
              </Row>
            </Card>

            <Card style={{ gap: 10 }}>
              <Row>
                {dot(status.geminiConfigured)}
                <AppText size={14} weight="bold">
                  {`الوكيل الذكي (Gemini) ${status.geminiConfigured ? 'مُفعّل' : 'غير مُفعّل'}`}
                </AppText>
              </Row>
              <AppText size={12.5} color={theme.c.textMuted}>
                {status.geminiConfigured
                  ? 'مساعد NOVA يجيب العملاء عبر تيليجرام باستخدام بيانات المتجر الحقيقية.'
                  : 'أضف GEMINI_API_KEY في ملف .env الخاص بالبوت لتفعيل المساعد الذكي.'}
              </AppText>
            </Card>

            {status.lastError ? (
              <Card style={{ gap: 8, borderColor: theme.c.danger }}>
                <AppText size={14} weight="bold" color={theme.c.danger}>
                  آخر خطأ مسجَّل
                </AppText>
                <AppText size={12.5} color={theme.c.textMuted}>
                  {status.lastError}
                </AppText>
              </Card>
            ) : null}

            <Card>
              <AppText size={12.5} color={theme.c.textMuted}>
                ℹ️ لا تُعرض أي مفاتيح أو أسرار في هذه الصفحة — الحالة تُنقل عبر جدول
                telegram_status فقط.
              </AppText>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
