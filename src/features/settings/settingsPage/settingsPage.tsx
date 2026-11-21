/**
 * 設定ページコンポーネント
 */

'use client';

import { memo } from 'react';
import { useSession } from 'next-auth/react';

import { Heading } from '@/components/ui/heading/heading';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { WATCHLIST_STREAMING_SCOPE_LABELS } from '@/constants';
import { DisplayNameForm } from '@/features/settings/displayNameForm/displayNameForm';
import { ChangePasswordForm } from '@/features/settings/changePasswordForm/changePasswordForm';
import { TwoFactorSettings } from '@/features/settings/twoFactorSettings/twoFactorSettings';
import { EmailChangeForm } from '@/features/settings/emailChangeForm/emailChangeForm';
import { DeleteAccount } from '@/features/settings/deleteAccount/deleteAccount';
import { NotificationSettings } from '@/features/settings/notificationSettings/notificationSettings';
import { StreamingNoticeSettings } from '@/features/settings/streamingNoticeSettings/streamingNoticeSettings';
import { ThemeSettings } from '@/features/settings/themeSettings/themeSettings';
import { DismissedMoviesList } from '@/features/dismissedMovies/component/dismissedMoviesList/dismissedMoviesList';
import { CookieConsentToggle } from '@/features/cookieConsent/component/cookieConsentToggle/cookieConsentToggle';
import { useHasPassword } from '@/features/settings/hooks/useHasPassword';
import { useCookieConsent } from '@/hooks/useCookieConsent';

import styles from './settingsPage.module.scss';

/**
 * 設定ページ
 */
export const SettingsPage = memo(function SettingsPage() {
  const { consent } = useCookieConsent();
  const hasConsentDecision = consent === 'granted' || consent === 'denied';
  const { data: session, status } = useSession();
  const email = session?.user?.email ?? '';
  /**
   * パスワード未設定（ソーシャルログインのみ）のユーザーには
   * 「現在のパスワード」欄を出さない
   *
   * ⛔ **セッションだけを根拠にしない（#1388）。** JWT の追従は5分間隔の
   * スロットル付きで、サーバーは毎回 `users.password_hash` を見る。初回
   * パスワードを設定した直後は食い違い、退会・パスワード変更・メール
   * アドレス変更のどれも行き止まりになる。
   *
   * ここで1回取って4つの節へ配る。節ごとに取りにいくと同じ問い合わせが
   * 並ぶうえ、同じ画面の中で値が揃わない。
   */
  const hasPassword = useHasPassword(session?.user?.hasPassword ?? true);
  /**
   * セッションの**初回**読み込み中か
   *
   * ⛔ **`status === 'loading'` だけで判定しない**（#1364 の E2E で発覚）。
   * `useSession().update()` は再取得のあいだ `loading` に戻すため
   * （`node_modules/next-auth/react.js:339` の `setLoading(true)`）、
   * 下の分岐が `EmailChangeForm` を**アンマウント**する。
   *
   * アンマウントされるとフォームの state が消えるので、変更に成功しても
   * 「メールアドレスを変更しました。」が一度も出ない（実測）。利用者からは
   * 入力欄が空に戻っただけに見える。
   *
   * 既に `email` を持っているなら、再取得中は今の表示を保つ。
   */
  const isInitialSessionLoading = status === 'loading' && !email;

  return (
    <div className={styles.c_settings_page}>
      <Heading level={1}>設定</Heading>

      <div className={styles.c_settings_page__sections}>
        <section className={styles.c_settings_page__section}>
          <Heading level={2}>プロフィール</Heading>
          <DisplayNameForm />
        </section>

        {isInitialSessionLoading ? (
          <section className={styles.c_settings_page__section}>
            <Heading level={2}>パスワード変更</Heading>
            <Skeleton variant='rect' width='100%' height={48} />
          </section>
        ) : (
          email && (
            <>
              <section className={styles.c_settings_page__section}>
                <Heading level={2}>メールアドレス</Heading>
                <EmailChangeForm email={email} hasPassword={hasPassword} />
              </section>
              <section className={styles.c_settings_page__section}>
                <Heading level={2}>パスワード変更</Heading>
                <ChangePasswordForm email={email} hasPassword={hasPassword} />
              </section>
            </>
          )
        )}

        <section className={styles.c_settings_page__section}>
          <Heading level={2}>二段階認証</Heading>
          <TwoFactorSettings hasPassword={hasPassword} />
        </section>

        <section className={styles.c_settings_page__section}>
          <Heading level={2}>通知</Heading>
          <NotificationSettings />
        </section>

        <section className={styles.c_settings_page__section}>
          <Heading level={2}>
            {WATCHLIST_STREAMING_SCOPE_LABELS.HEADING}
          </Heading>
          <StreamingNoticeSettings />
        </section>

        <section className={styles.c_settings_page__section}>
          <Heading level={2}>外観</Heading>
          <ThemeSettings />
        </section>

        {/*
          未決定のときはトグルが何も返さないので、見出しだけの空セクションに
          ならないよう section ごと出し分ける（未決定の利用者にはバナーが出る）
        */}
        {hasConsentDecision && (
          <section className={styles.c_settings_page__section}>
            <Heading level={2}>Cookie</Heading>
            <CookieConsentToggle />
          </section>
        )}

        <section className={styles.c_settings_page__section}>
          <Heading level={2}>興味なし一覧</Heading>
          <DismissedMoviesList />
        </section>

        {/*
          ⚠️ 取り消せない操作なので**一番下**に置く。上のほうに置くと
          ほかの設定を触りにきた利用者の目に先に入る
        */}
        {!isInitialSessionLoading && (
          <section className={styles.c_settings_page__section}>
            <Heading level={2}>アカウントの削除</Heading>
            <DeleteAccount hasPassword={hasPassword} />
          </section>
        )}
      </div>
    </div>
  );
});

SettingsPage.displayName = 'SettingsPage';
