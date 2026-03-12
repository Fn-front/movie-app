/**
 * 設定ページコンポーネント
 */

'use client';

import { memo } from 'react';
import { useSession } from 'next-auth/react';

import { Heading } from '@/components/ui/heading/heading';
import { DisplayNameForm } from '@/features/settings/displayNameForm/displayNameForm';
import { ChangePasswordForm } from '@/features/settings/changePasswordForm/changePasswordForm';
import { NotificationSettings } from '@/features/settings/notificationSettings/notificationSettings';
import { ThemeSettings } from '@/features/settings/themeSettings/themeSettings';

import styles from './settingsPage.module.scss';

/**
 * 設定ページ
 */
export const SettingsPage = memo(function SettingsPage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? '';

  return (
    <div className={styles.c_settings_page}>
      <Heading level={1}>設定</Heading>

      <div className={styles.c_settings_page__sections}>
        <section className={styles.c_settings_page__section}>
          <Heading level={2}>プロフィール</Heading>
          <DisplayNameForm />
        </section>

        {email && (
          <section className={styles.c_settings_page__section}>
            <Heading level={2}>パスワード変更</Heading>
            <ChangePasswordForm email={email} />
          </section>
        )}

        <section className={styles.c_settings_page__section}>
          <Heading level={2}>通知</Heading>
          <NotificationSettings />
        </section>

        <section className={styles.c_settings_page__section}>
          <Heading level={2}>外観</Heading>
          <ThemeSettings />
        </section>
      </div>
    </div>
  );
});

SettingsPage.displayName = 'SettingsPage';
