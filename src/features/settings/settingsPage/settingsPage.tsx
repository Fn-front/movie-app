/**
 * 設定ページコンポーネント
 */

'use client';

import { memo } from 'react';

import { Heading } from '@/components/ui/heading/heading';
import { DisplayNameForm } from '@/features/settings/displayNameForm/displayNameForm';
import { NotificationSettings } from '@/features/settings/notificationSettings/notificationSettings';
import { ThemeSettings } from '@/features/settings/themeSettings/themeSettings';

import styles from './settingsPage.module.scss';

/**
 * 設定ページ
 */
export const SettingsPage = memo(function SettingsPage() {
  return (
    <div className={styles.c_settings_page}>
      <Heading level={1}>設定</Heading>

      <div className={styles.c_settings_page__sections}>
        <section className={styles.c_settings_page__section}>
          <Heading level={2}>プロフィール</Heading>
          <DisplayNameForm />
        </section>

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
