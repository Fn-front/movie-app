/**
 * Cookie同意の撤回UI
 *
 * 設定画面（/settings）とプライバシーポリシー（/privacy）で共有する。
 * /settings は認証必須なので、未認証の利用者にとっては /privacy が
 * 唯一の撤回手段になる。
 */

'use client';

import { memo, useCallback } from 'react';

import { RadioGroup } from '@/components/ui/radioGroup/radioGroup';
import { useCookieConsent } from '@/hooks/useCookieConsent';

import styles from './cookieConsentToggle.module.scss';

const CONSENT_OPTIONS = [
  { label: '同意する', value: 'granted' },
  { label: '同意しない', value: 'denied' },
];

/**
 * Cookie同意の切り替え
 *
 * 表示条件は「保存済みの状態が granted か denied のとき」だけ。
 * GA ID の有無には依存させない。運用側が計測を止めたときに、同意済みの
 * 利用者の撤回手段だけが消えるのを防ぐため（そのときは gtag が存在しないので、
 * 撤回操作は Cookie 削除と localStorage の更新だけになる）。
 *
 * 未決定（unset）のときは何も描画しない。2択のラジオで未決定を表すと
 * aria-checked が利用者のしていない選択を報告することになる。未決定の
 * 利用者にはバナーの方が出る。
 *
 * Skeleton は出さない。同期状態は useConsentServerSync の内部にあり、
 * ここから知る手段が無い。localStorage の値だけで即描画する。
 */
export const CookieConsentToggle = memo(function CookieConsentToggle() {
  const { consent, grant, deny } = useCookieConsent();

  const handleChange = useCallback(
    (value: string) => {
      if (value === 'granted') {
        grant();
        return;
      }
      deny();
    },
    [grant, deny],
  );

  if (consent !== 'granted' && consent !== 'denied') return null;

  return (
    <div className={styles.c_cookie_consent_toggle}>
      <p className={styles.c_cookie_consent_toggle__description}>
        アクセス解析（Google アナリティクス）のための Cookie
        の利用に同意するかどうかを選べます。いつでも変更できます。
      </p>
      <RadioGroup
        options={CONSENT_OPTIONS}
        value={consent}
        onValueChange={handleChange}
        aria-label='アクセス解析Cookieの利用'
      />
    </div>
  );
});

CookieConsentToggle.displayName = 'CookieConsentToggle';
