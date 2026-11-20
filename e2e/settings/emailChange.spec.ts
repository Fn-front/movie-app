/**
 * メールアドレス変更 E2Eテスト（#1364）
 *
 * ⛔ **この経路は単体テストでは原理的に守れない。**
 *
 * - route のテストは `requireSecondFactor` をモックする
 * - UI のテストは `useEmailChange` をモックする
 *
 * つまり「画面が第2要素を送っているか」という境界だけ誰も見ていない。
 * 実際に #1359 の2回目レビューで、**画面に入力欄が無く空文字で送って必ず
 * 400**という状態が見つかった。しかもその時点で確認コードは焼けており、
 * 5回のタイプミスで60分ロックになる。ここで通しの経路を固定する。
 *
 * ⚠️ **本番DBでは回さない**（`.claude/rules/testing.md`）。
 * `E2E_USE_LOCAL_SUPABASE=true` のローカル Supabase で実行する。
 * 実在の利用者のログイン識別子を書き換える操作そのものだから。
 *
 * ⚠️ 共有の `TEST_USER` は使わない（#750）。アドレスを書き換えるため、
 * 同じユーザーを使う他の spec を並列実行時に壊す。
 *
 * ユーザーストーリー網羅:
 * - 正常系: 新アドレスへ変更でき、**新しいアドレスでログインできる**
 * - 二段階認証あり（TOTP）: 第2要素の欄が出て、入れると通る
 * - 二段階認証あり（メールOTP）: 「コードを送る」で受け取って通る
 * - 二段階認証あり: 第2要素を入れないと送信できない（コードを焼かせない）
 * - 入力バリデーション: パスワード不一致 / 現在と同じ / 形式不正
 * - 重複: 既に使われているアドレス / 再送クールダウン（60秒）
 * - 期限切れ / 試行回数上限 / 送信の上限（5回/60分）
 * - セキュリティ: 画面を介さず第2要素を省いても、サーバーが拒む
 * - 状態保持: 変更後のパスワード変更が**新しいアドレス**へコードを送る
 * - 対象外: パスワード未設定 / ソーシャル連携あり
 */

import { test, expect, type Page } from '@playwright/test';

import {
  expireOtpCode,
  getLatestOtpCode,
  maxOutOtpAttempts,
} from '../helpers/api';
import {
  cleanupLoginIpRateLimits,
  cleanupRateLimitsForUser,
  createVerifiedUser,
  deleteUserByEmail,
  linkSocialAccount,
  updateUserColumns,
} from '../helpers/dedicatedUser';
import { runScopedEmail } from '../helpers/runScope';
import { seedConfirmedSecondFactor, totpCodeFromSecret } from '../helpers/totp';

/** 本 spec 専用のユーザー（#793 の run スコープ付き） */
const USER = {
  email: runScopedEmail('e2e-email-change'),
  password: 'EmailChangeE2e1',
} as const;

/**
 * 変更先のアドレス
 *
 * ⚠️ run スコープの規約（`-<E2E_RUN_ID>@example.com`）に従わせる。
 * 外すと、途中で落ちたときに `deleteRunScopedUsers` が回収できない。
 */
const NEW_EMAIL = runScopedEmail('e2e-email-change-new');

/** 重複を確かめるための別ユーザー */
const OTHER = {
  email: runScopedEmail('e2e-email-change-other'),
  password: 'EmailChangeOther1',
} as const;

/** 作成したユーザーのID（レート制限は利用者IDで数える） */
let userId = '';

/**
 * エラー／通知の文言
 *
 * ⚠️ `role='alert'` で引かない。Next.js のルートアナウンサー
 * （`#__next-route-announcer__`）も同じロールを持つため、文言で引く。
 */
const MESSAGE = {
  CODE_SENT: '新しいメールアドレスに確認コードを送りました。',
  CHANGED: 'メールアドレスを変更しました。',
  PASSWORD_INCORRECT: '現在のパスワードが正しくありません。',
  SAME_AS_CURRENT: '現在のメールアドレスと同じです。',
  ALREADY_USED: 'このメールアドレスは使用できません。',
  INVALID_FORMAT: '入力内容に誤りがあります。',
  INVALID_CODE: '確認コードが間違っています。',
  SOCIAL_LINKED:
    'ソーシャルログインと連携しているアカウントのメールアドレスは変更できません。',
  PASSWORD_REQUIRED:
    'ソーシャルログインのみのアカウントではメールアドレスを変更できません。',
  SECOND_FACTOR_SENT: '確認コードをメールに送信しました。',
  RESEND_TOO_SOON: 'しばらく待ってから再送信してください。',
  RATE_LIMIT_EXCEEDED: 'しばらく時間をおいてから再度お試しください。',
  SECOND_FACTOR_REQUIRED: '認証コードが正しくありません。',
} as const;

/** ログインして設定画面を開く */
async function loginAndOpenSettings(
  page: Page,
  email: string = USER.email,
  password: string = USER.password,
): Promise<void> {
  await page.goto('/auth/signin');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await page.waitForURL('/');
  await page.goto('/settings');
}

/**
 * メールアドレス変更の入力欄がある領域
 *
 * ⚠️ 同じ設定画面のパスワード変更にも『現在のパスワード』があるため、
 * 見出しで囲って絞る。素の `getByLabel` は strict mode 違反になる。
 */
function emailSection(page: Page) {
  return page.locator('section').filter({
    has: page.getByRole('heading', { name: 'メールアドレス', exact: true }),
  });
}

/**
 * 確認コードの送信を要求する
 *
 * @param page - Playwright のページ
 * @param newEmail - 変更先のアドレス
 * @param password - 現在のパスワード
 */
async function requestCode(
  page: Page,
  newEmail: string,
  password: string = USER.password,
): Promise<void> {
  const section = emailSection(page);

  await section.getByLabel('新しいメールアドレス').fill(newEmail);
  await section.getByLabel('現在のパスワード').fill(password);
  await section.getByRole('button', { name: '確認コードを送る' }).click();
}

/**
 * 確認コードの送信を要求し、**コード入力画面へ進むまで待つ**
 *
 * ⚠️ 待たずに `otp_codes` を引くと、送信が終わる前に読んで必ず null になる
 * （実測で落ちた）。拒否される入力を試すテストは `requestCode` のままにする。
 */
async function requestCodeAndWait(
  page: Page,
  newEmail: string,
  password: string = USER.password,
): Promise<void> {
  await requestCode(page, newEmail, password);
  await expect(page.getByText(MESSAGE.CODE_SENT)).toBeVisible();
}

/**
 * 新しいアドレスに届いた確認コードを取り出す
 *
 * ⚠️ 宛先は**新しいアドレス**。旧アドレスで引くと必ず null になる。
 */
async function latestChangeCode(newEmail: string): Promise<string> {
  const code = await getLatestOtpCode(newEmail, 'email_change');

  expect(code, `${newEmail} 宛の確認コードが見つからない`).not.toBeNull();

  return code!;
}

/**
 * 本 spec は同じ専用ユーザーのログイン識別子を書き換えるため、
 * テスト同士が干渉する。ファイル内は直列で回す。
 *
 * ログインに bcrypt とDB往復が入り、既定の30秒では足りないことがある。
 */
test.describe.configure({ mode: 'serial', timeout: 90000 });

test.describe('メールアドレス変更', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  /**
   * 毎回ユーザーを作り直す
   *
   * ⚠️ アドレスが変わるテストがあるので、状態を持ち越さない。
   * 作り直すと利用者IDも変わるため、**利用者IDで数えるレート制限
   * （`email_change_request` は5回/60分）も自動的に0から始まる**。
   */
  test.beforeEach(async () => {
    await deleteUserByEmail(NEW_EMAIL);
    userId = await createVerifiedUser(USER);
    await cleanupLoginIpRateLimits();
  });

  test.afterEach(async () => {
    await cleanupRateLimitsForUser(userId);
    await deleteUserByEmail(USER.email);
    await deleteUserByEmail(NEW_EMAIL);
  });

  test.afterAll(async () => {
    await deleteUserByEmail(OTHER.email);
  });

  test('新しいアドレスへ変更でき、そのアドレスでログインできる', async ({
    page,
  }) => {
    await loginAndOpenSettings(page);

    await requestCodeAndWait(page, NEW_EMAIL);

    const section = emailSection(page);
    await section
      .getByRole('textbox', { name: '確認コード', exact: true })
      .fill(await latestChangeCode(NEW_EMAIL));
    await section.getByRole('button', { name: 'メールアドレスを変更' }).click();

    await expect(page.getByText(MESSAGE.CHANGED)).toBeVisible();

    // ⚠️ セッションを更新していないと、画面は旧アドレスを出し続ける
    await expect(
      page.getByText(`現在のメールアドレス: ${NEW_EMAIL}`),
    ).toBeVisible();

    // ⛔ ここが本題。アドレスは**ログイン識別子そのもの**
    await page.context().clearCookies();
    await loginAndOpenSettings(page, NEW_EMAIL);
    await expect(
      page.getByText(`現在のメールアドレス: ${NEW_EMAIL}`),
    ).toBeVisible();
  });

  /**
   * ⛔ **変更後にパスワードを変更できるか**（セッションの追従の本丸）。
   *
   * ⚠️ **送信先だけ見ても何も固定できない**（#1364 のレビュー）。
   * `/api/auth/otp/send` は `password_change` のとき**ボディを捨てて
   * `users.email` から引き直す**ので、セッションが古くても新アドレスへ届く。
   *
   * 壊れるのは**検証側**。`/api/auth/otp/verify` は**ボディの** email で
   * 引くため、画面が旧アドレスを持っていると必ず 400 になる
   * （`auth.ts` のコメントが説明している状態そのもの）。だからコードを
   * 実際に入れて、次のステップまで進むことを見る。
   */
  test('変更後のパスワード変更が最後まで通る', async ({ page }) => {
    await loginAndOpenSettings(page);
    await requestCodeAndWait(page, NEW_EMAIL);

    const section = emailSection(page);
    await section
      .getByRole('textbox', { name: '確認コード', exact: true })
      .fill(await latestChangeCode(NEW_EMAIL));
    await section.getByRole('button', { name: 'メールアドレスを変更' }).click();
    await expect(page.getByText(MESSAGE.CHANGED)).toBeVisible();

    await page.goto('/settings/change-password');
    await page.getByRole('button', { name: '確認コードを送信' }).click();
    await expect(
      page.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeVisible();

    // 送信先は新アドレス（ここは `users.email` から引くので古くても通る）
    const code = await getLatestOtpCode(NEW_EMAIL, 'password_change');
    expect(code).not.toBeNull();
    expect(await getLatestOtpCode(USER.email, 'password_change')).toBeNull();

    // ⛔ ここが本題。検証はボディの email で引くので、画面が旧アドレスを
    //   持っていると 400 になって次のステップへ進めない
    await page
      .getByRole('textbox', { name: '確認コード', exact: true })
      .fill(code!);
    await page.getByRole('button', { name: '確認コードを検証' }).click();

    await expect(page.getByRole('button', { name: '変更する' })).toBeVisible();
  });

  test.describe('二段階認証あり', () => {
    /**
     * ⚠️ 第2要素は**ログインの後**に仕込む。先に仕込むとログイン自体が
     * 認証コード画面へ進み、この spec の対象ではない経路を通ることになる
     * （ログインの通し確認は `e2e/auth/twoFactor.spec.ts` が見ている）。
     *
     * 画面は確認コードの送信に成功した時点で `/api/user/totp` を引き直すので、
     * ここで仕込めば入力欄の出し分けに間に合う。
     */
    test('TOTP: 第2要素を入れると変更できる', async ({ page }) => {
      await loginAndOpenSettings(page);
      const secret = await seedConfirmedSecondFactor(USER.email, 'totp');
      await requestCodeAndWait(page, NEW_EMAIL);

      const section = emailSection(page);
      const secondFactorField = section.getByLabel('二段階認証のコード');

      // ⛔ **入力欄が出ること自体が本題。** 無いまま送ると、確認コードだけ
      //   焼けて 400 になる（#1359 の2回目レビューで見つかった状態）
      await expect(secondFactorField).toBeVisible();

      await section
        .getByRole('textbox', { name: '確認コード', exact: true })
        .fill(await latestChangeCode(NEW_EMAIL));
      await secondFactorField.fill(totpCodeFromSecret(secret!));
      await section
        .getByRole('button', { name: 'メールアドレスを変更' })
        .click();

      await expect(page.getByText(MESSAGE.CHANGED)).toBeVisible();
    });

    /**
     * ⚠️ メールOTP の利用者は手元でコードを作れない。この導線が無いと、
     * 二段階認証を有効にした時点でアドレスを変更できなくなる。
     */
    test('メールOTP: コードを送ってもらって変更できる', async ({ page }) => {
      await loginAndOpenSettings(page);
      await seedConfirmedSecondFactor(USER.email, 'email_otp');
      await requestCodeAndWait(page, NEW_EMAIL);

      const section = emailSection(page);
      await expect(section.getByLabel('二段階認証のコード')).toBeVisible();

      await section
        .getByRole('button', { name: '二段階認証のコードを送る' })
        .click();
      await expect(page.getByText(MESSAGE.SECOND_FACTOR_SENT)).toBeVisible();

      // ⚠️ 第2要素は**現在の（＝旧）アドレス**へ届く。新アドレスではない
      const secondFactorCode = await getLatestOtpCode(USER.email, 'two_factor');
      expect(secondFactorCode).not.toBeNull();

      await section
        .getByRole('textbox', { name: '確認コード', exact: true })
        .fill(await latestChangeCode(NEW_EMAIL));
      await section.getByLabel('二段階認証のコード').fill(secondFactorCode!);
      await section
        .getByRole('button', { name: 'メールアドレスを変更' })
        .click();

      await expect(page.getByText(MESSAGE.CHANGED)).toBeVisible();
    });

    /**
     * ⛔ **第2要素が空のまま送れてはいけない。** 送れると使い捨ての確認コードが
     * 焼けるだけで 400 になり、やり直すには再送（60秒待ち＋枠を1つ消費）が要る。
     */
    test('第2要素を入れないと送信できない', async ({ page }) => {
      await loginAndOpenSettings(page);
      await seedConfirmedSecondFactor(USER.email, 'totp');
      await requestCodeAndWait(page, NEW_EMAIL);

      const section = emailSection(page);

      // ⚠️ **先に欄が出るのを待つ。** 送信ボタンは「方式の判定前」でも
      //   disabled なので、待たないと**別の理由で通る**（#1364 のレビュー）
      await expect(section.getByLabel('二段階認証のコード')).toBeVisible();

      await section
        .getByRole('textbox', { name: '確認コード', exact: true })
        .fill(await latestChangeCode(NEW_EMAIL));

      await expect(
        section.getByRole('button', { name: 'メールアドレスを変更' }),
      ).toBeDisabled();
    });
  });

  test.describe('入力の検証', () => {
    test('パスワードが違えばコードを送らない', async ({ page }) => {
      await loginAndOpenSettings(page);

      await requestCode(page, NEW_EMAIL, 'WrongPassword1');

      await expect(page.getByText(MESSAGE.PASSWORD_INCORRECT)).toBeVisible();
      expect(await getLatestOtpCode(NEW_EMAIL, 'email_change')).toBeNull();
    });

    test('現在と同じアドレスは拒否する', async ({ page }) => {
      await loginAndOpenSettings(page);

      await requestCode(page, USER.email);

      await expect(page.getByText(MESSAGE.SAME_AS_CURRENT)).toBeVisible();
      expect(await getLatestOtpCode(USER.email, 'email_change')).toBeNull();
    });

    test('形式が不正なアドレスは拒否する', async ({ page }) => {
      await loginAndOpenSettings(page);

      await requestCode(page, 'not-an-email');

      await expect(page.getByText(MESSAGE.INVALID_FORMAT)).toBeVisible();
      expect(await getLatestOtpCode('not-an-email', 'email_change')).toBeNull();
    });

    /**
     * ⚠️ **検証まで遅らせない。** 他人が使っているアドレスへ確認コードを
     * 送ってしまうと、自サービス名義の迷惑メールになる。
     */
    test('既に使われているアドレスへはコードを送らない', async ({ page }) => {
      await createVerifiedUser(OTHER);
      await loginAndOpenSettings(page);

      await requestCode(page, OTHER.email);

      await expect(page.getByText(MESSAGE.ALREADY_USED)).toBeVisible();
      expect(await getLatestOtpCode(OTHER.email, 'email_change')).toBeNull();
    });
  });

  test.describe('送信の制限', () => {
    /**
     * ⚠️ 二度押しでメールボックスへ連投しない。60秒の再送間隔は
     * `otp_codes` の直前の行だけが根拠（`sendEmailChangeCode`）。
     */
    test('60秒の内側で送り直すと断られる', async ({ page }) => {
      await loginAndOpenSettings(page);
      await requestCodeAndWait(page, NEW_EMAIL);

      // 入力画面へ戻って同じ宛先でもう一度送る
      await emailSection(page)
        .getByRole('button', { name: 'やり直す' })
        .click();
      await requestCode(page, NEW_EMAIL);

      await expect(page.getByText(MESSAGE.RESEND_TOO_SOON)).toBeVisible();
    });

    /**
     * ⚠️ 送信枠は**検証より前**に消費する（`.claude/rules/api-route.md` の原則）。
     * 弾かれるパスでも枠が減るのは承知のうえ —— 枠を消費しない経路があると、
     * 認証済みアカウント1つで全登録アドレスを無制限に列挙できる（#1359）。
     */
    test('送信を繰り返すと上限で断られる', async ({ page }) => {
      await loginAndOpenSettings(page);

      // 5回目までは理由つきで弾かれ、6回目で枠が尽きる
      for (let i = 0; i < 5; i++) {
        await requestCode(page, USER.email);
        await expect(page.getByText(MESSAGE.SAME_AS_CURRENT)).toBeVisible();
      }

      await requestCode(page, USER.email);

      await expect(page.getByText(MESSAGE.RATE_LIMIT_EXCEEDED)).toBeVisible();
    });
  });

  test.describe('確認コードの失効', () => {
    test('期限切れのコードでは変更できない', async ({ page }) => {
      await loginAndOpenSettings(page);
      await requestCodeAndWait(page, NEW_EMAIL);

      const code = await latestChangeCode(NEW_EMAIL);
      await expireOtpCode(NEW_EMAIL, 'email_change');

      const section = emailSection(page);
      await section
        .getByRole('textbox', { name: '確認コード', exact: true })
        .fill(code);
      await section
        .getByRole('button', { name: 'メールアドレスを変更' })
        .click();

      await expect(page.getByText(MESSAGE.INVALID_CODE)).toBeVisible();
    });

    /**
     * ⚠️ 試行回数の上限は**コード1本あたり**（`otp_codes.attempts`、上限5）。
     * 到達後は**正しいコードでも通さない**。通すと総当たりが止まらない。
     */
    test('試行回数の上限に達したら正しいコードでも通さない', async ({
      page,
    }) => {
      await loginAndOpenSettings(page);
      await requestCodeAndWait(page, NEW_EMAIL);

      const code = await latestChangeCode(NEW_EMAIL);
      await maxOutOtpAttempts(NEW_EMAIL, 'email_change');

      const section = emailSection(page);
      await section
        .getByRole('textbox', { name: '確認コード', exact: true })
        .fill(code);
      await section
        .getByRole('button', { name: 'メールアドレスを変更' })
        .click();

      await expect(page.getByText(MESSAGE.INVALID_CODE)).toBeVisible();
    });
  });

  test.describe('対象外のアカウント', () => {
    /**
     * ⚠️ アプリ側の `users.email` だけ変えると provider 側のアドレスと
     * 食い違い、次回のソーシャルログインで何が起きるか読めない。
     */
    test('パスワード未設定なら変更させない', async ({ page }) => {
      await loginAndOpenSettings(page);

      // ログイン後に剥がす。先に消すとパスワードでログインできない
      await updateUserColumns(userId, { password_hash: null });

      // ⚠️ **画面では確かめられない。** `hasPassword` はセッションの
      //   トークンに載っており、DB の再確認は5分間隔
      //   （`SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS`）。リロードしても
      //   当分は「パスワードあり」のままになる。
      //
      //   画面の出し分けは `emailChangeForm` の単体テストが見ている。
      //   ここで固定したいのは**サーバーが拒否すること**なので API を直接叩く。
      //   `page.request` はブラウザのコンテキストの Cookie を引き継ぐ
      const response = await page.request.post(
        '/api/user/email-change/request',
        { data: { newEmail: NEW_EMAIL, currentPassword: USER.password } },
      );

      expect(response.status()).toBe(400);
      expect((await response.json())?.error?.message).toBe(
        MESSAGE.PASSWORD_REQUIRED,
      );
      expect(await getLatestOtpCode(NEW_EMAIL, 'email_change')).toBeNull();
    });

    /**
     * ⛔ **画面を介さず第2要素を省いても、サーバーが拒む**（#1364 のレビュー）。
     *
     * route のテストは `requireSecondFactor` をモックし、コンポーネントの
     * テストは `useEmailChange` をモックするので、**400 の経路は誰も
     * 通していない**。画面の `disabled` を外されたら何が起きるかを固定する。
     */
    test('第2要素を省いたリクエストはサーバーが拒む', async ({ page }) => {
      await loginAndOpenSettings(page);
      await seedConfirmedSecondFactor(USER.email, 'totp');
      await requestCodeAndWait(page, NEW_EMAIL);

      const code = await latestChangeCode(NEW_EMAIL);
      const response = await page.request.post(
        '/api/user/email-change/confirm',
        { data: { newEmail: NEW_EMAIL, code } },
      );

      expect(response.status()).toBe(400);
      expect((await response.json())?.error?.message).toBe(
        MESSAGE.SECOND_FACTOR_REQUIRED,
      );

      // ⚠️ 第2要素は**確認コードを消費する前**に見る。弾かれた時点で
      //    使い捨てのコードが焼けていないこと（#1363 の2回目レビュー）
      expect(await getLatestOtpCode(NEW_EMAIL, 'email_change')).toBe(code);
    });

    /**
     * ⛔ **パスワードと連携の両方を持つ利用者も対象外**（#1359 の2回目レビュー）。
     *
     * `auth.ts` の `signIn` は既存ユーザーを **`users.email` で**引くため、
     * アドレスを変えたあとに同じ provider でログインすると該当行が見つからず、
     * **新しい `users` 行が作られて連携がそちらへ付け替わる**。
     * 利用者から見ると「データが消えた」になる。
     */
    test('ソーシャル連携があるなら変更させない', async ({ page }) => {
      await loginAndOpenSettings(page);
      await linkSocialAccount(userId);

      await requestCode(page, NEW_EMAIL);

      await expect(page.getByText(MESSAGE.SOCIAL_LINKED)).toBeVisible();
      expect(await getLatestOtpCode(NEW_EMAIL, 'email_change')).toBeNull();
    });
  });
});
