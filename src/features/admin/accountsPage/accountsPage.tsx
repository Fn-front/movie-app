/**
 * 管理者発行アカウントの管理ページ
 *
 * 宛先メールアドレスはDBに保存しない。送信後はフォームから消し、
 * 画面にも履歴として残さない。
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { Heading } from '@/components/ui/heading/heading';
import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { EmptyState } from '@/components/ui/emptyState/emptyState';
import { formatDate } from '@/utils/date';

import { useAdminAccounts } from './hooks/useAdminAccounts';

import styles from './accountsPage.module.scss';

/** アカウント発行フォーム */
const CreateForm = memo(function CreateForm({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean;
  onSubmit: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await onSubmit(email);
      // 宛先は保存しない方針なので、送信後は画面からも消す
      setEmail('');
    },
    [email, onSubmit],
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(event.target.value);
    },
    [],
  );

  return (
    <form className={styles.c_admin_accounts__form} onSubmit={handleSubmit}>
      <Input
        label='送信先メールアドレス'
        type='email'
        value={email}
        onChange={handleChange}
        placeholder='example@example.com'
        fullWidth
        required
      />
      <p className={styles.c_admin_accounts__hint}>
        アカウント名とパスワード設定リンクを送ります。
        メールアドレスは保存されません。
      </p>
      <Button type='submit' disabled={isSubmitting || !email}>
        {isSubmitting ? '発行中...' : 'アカウントを発行'}
      </Button>
    </form>
  );
});

/** 1件分の行（再発行フォームを内包する） */
const AccountRow = memo(function AccountRow({
  id,
  username,
  createdAt,
  lastLoginAt,
  hasPassword,
  isSubmitting,
  onReissue,
}: {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  hasPassword: boolean;
  isSubmitting: boolean;
  onReissue: (id: string, email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    setEmail('');
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEmail(event.target.value);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await onReissue(id, email);
      setEmail('');
      setIsOpen(false);
    },
    [email, id, onReissue],
  );

  return (
    <li className={styles.c_admin_accounts__item}>
      <div className={styles.c_admin_accounts__item_head}>
        <span className={styles.c_admin_accounts__username}>{username}</span>
        {!hasPassword && (
          <span className={styles.c_admin_accounts__badge}>
            パスワード未設定
          </span>
        )}
      </div>

      <dl className={styles.c_admin_accounts__meta}>
        <div>
          <dt>発行日</dt>
          <dd>{formatDate(createdAt) ?? '—'}</dd>
        </div>
        <div>
          <dt>最終ログイン</dt>
          <dd>{(lastLoginAt && formatDate(lastLoginAt)) || '—'}</dd>
        </div>
      </dl>

      <Button variant='secondary' onClick={handleToggle} size='sm'>
        {isOpen ? 'キャンセル' : '設定リンクを再送'}
      </Button>

      {isOpen && (
        <form
          className={styles.c_admin_accounts__reissue}
          onSubmit={handleSubmit}
        >
          {/*
            既にデータが入っているアカウントを渡すことになるため、
            どのアカウントを再送するのかを確定前に明示する
          */}
          <p className={styles.c_admin_accounts__confirm}>
            <strong>{username}</strong> の設定リンクを再送します。
            このリンクを受け取った人が、このアカウントのパスワードを設定できます。
          </p>
          <Input
            label='送信先メールアドレス'
            type='email'
            value={email}
            onChange={handleChange}
            fullWidth
            required
          />
          <Button type='submit' disabled={isSubmitting || !email} size='sm'>
            {isSubmitting ? '送信中...' : '再送する'}
          </Button>
        </form>
      )}
    </li>
  );
});

/**
 * 管理者発行アカウントの管理ページ
 */
export const AdminAccountsPage = memo(function AdminAccountsPage() {
  const {
    accounts,
    isLoading,
    isSubmitting,
    error,
    notice,
    issuedUsername,
    createAccount,
    reissueLink,
    dismissNotice,
  } = useAdminAccounts();

  return (
    <div className={styles.c_admin_accounts}>
      <Heading level={1}>アカウント管理</Heading>

      {error && (
        <p className={styles.c_admin_accounts__error} role='alert'>
          {error}
        </p>
      )}

      {notice && (
        <div className={styles.c_admin_accounts__notice} role='status'>
          <p>{notice}</p>
          {issuedUsername && (
            <p>
              アカウント名: <strong>{issuedUsername}</strong>
            </p>
          )}
          <Button variant='secondary' size='sm' onClick={dismissNotice}>
            閉じる
          </Button>
        </div>
      )}

      <section className={styles.c_admin_accounts__section}>
        <Heading level={2}>新規発行</Heading>
        <CreateForm isSubmitting={isSubmitting} onSubmit={createAccount} />
      </section>

      <section className={styles.c_admin_accounts__section}>
        <Heading level={2}>発行済みアカウント</Heading>

        {isLoading ? (
          <Skeleton variant='rect' width='100%' height={120} />
        ) : accounts.length === 0 ? (
          <EmptyState
            title='発行済みのアカウントはありません'
            headingLevel={3}
          />
        ) : (
          <ul className={styles.c_admin_accounts__list}>
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                id={account.id}
                username={account.username}
                createdAt={account.createdAt}
                lastLoginAt={account.lastLoginAt}
                hasPassword={account.hasPassword}
                isSubmitting={isSubmitting}
                onReissue={reissueLink}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
});
