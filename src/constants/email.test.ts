/**
 * OTPメール文面のテスト
 *
 * 3用途で文面が同一だと、受信者が何のコードか判断できずソーシャル
 * エンジニアリングに弱くなるため、用途の明記と共有禁止の警告を検証する（#648）。
 */

import {
  buildOtpEmailSubject,
  buildOtpEmailText,
  buildPasswordInvalidatedEmailSubject,
  buildPasswordInvalidatedEmailText,
} from './email';
import { OTP_ACTION, OTP_CONFIG, type OtpAction } from './otp';

const ALL_ACTIONS: OtpAction[] = [
  OTP_ACTION.REGISTRATION,
  OTP_ACTION.PASSWORD_CHANGE,
];

describe('buildOtpEmailSubject', () => {
  it.each([
    [OTP_ACTION.REGISTRATION, 'メールアドレスの確認'],
    [OTP_ACTION.PASSWORD_CHANGE, 'パスワード変更'],
  ])('%s の件名に用途「%s」を含む', (action, label) => {
    expect(buildOtpEmailSubject(action)).toContain(label);
  });

  it('用途ごとに異なる件名になる', () => {
    const subjects = ALL_ACTIONS.map(buildOtpEmailSubject);

    expect(new Set(subjects).size).toBe(ALL_ACTIONS.length);
  });
});

describe('buildOtpEmailText', () => {
  it.each([
    [OTP_ACTION.REGISTRATION, 'メールアドレスの確認'],
    [OTP_ACTION.PASSWORD_CHANGE, 'パスワード変更'],
  ])('%s の本文に用途「%s」を明記する', (action, label) => {
    expect(buildOtpEmailText('123456', action)).toContain(
      `「${label}」のために発行されました`,
    );
  });

  it('用途ごとに異なる本文になる', () => {
    const bodies = ALL_ACTIONS.map((action) =>
      buildOtpEmailText('123456', action),
    );

    expect(new Set(bodies).size).toBe(ALL_ACTIONS.length);
  });

  describe.each(ALL_ACTIONS)('%s', (action) => {
    const text = buildOtpEmailText('123456', action);

    it('確認コードを含む', () => {
      expect(text).toContain('123456');
    });

    it('共有禁止の警告を含む', () => {
      expect(text).toContain('このコードを他人に教えないでください');
    });

    it('サービス側から尋ねない旨の警告を含む', () => {
      expect(text).toContain('確認コードをお尋ねすることはありません');
    });

    it('心当たりがない場合の案内を含む', () => {
      expect(text).toContain('心当たりがない場合');
    });

    it('有効期限を定数から出力する', () => {
      expect(text).toContain(`${OTP_CONFIG.EXPIRY_MINUTES}分間有効`);
    });
  });
});

/**
 * パスワード失効の通知（#1302 / #1325）
 *
 * 未検証のまま放置されたアカウントが `registration` の確認コードで認証済みへ
 * 昇格するとき、出自の分からない `password_hash` を失効させる。伝えないと、
 * 利用者は次のパスワードログインが弾かれる理由を知るすべがない。
 */
describe('パスワード失効の通知メール', () => {
  const resetUrl = 'https://example.com/auth/forgot-password';
  const text = buildPasswordInvalidatedEmailText(resetUrl);

  it('件名でパスワードを無効にしたことが分かる', () => {
    expect(buildPasswordInvalidatedEmailSubject()).toContain(
      'パスワードを無効にしました',
    );
  });

  it('無効にした事実を本文に書く', () => {
    expect(text).toContain('パスワードを無効にしました');
  });

  it('無効にした理由を本文に書く', () => {
    // 理由が無いと、利用者には「勝手に消された」としか読めない
    expect(text).toContain('第三者が設定したもの');
  });

  it('再設定先のURLを本文に含む', () => {
    expect(text).toContain(resetUrl);
  });

  /**
   * ⛔ **設定ページへ誘導しない**（#1361）
   *
   * 受け取った時点で `password_hash` は NULL でセッションも無い。
   * かつて案内していた「メールでログイン」は削除済みなので、
   * **ログインする手段が1つも無い状態で設定ページのリンクだけ渡す**ことになる。
   * 効くのはパスワード再設定（未検証でも通る）だけ。
   */
  it('削除済みの「メールでログイン」を案内しない', () => {
    expect(text).not.toContain('メールでログイン');
  });

  it('いまログインできないことを伝える', () => {
    // ここが抜けると、利用者は設定ページを探しに行って行き止まりに入る
    expect(text).toContain('ログインできない状態');
    expect(text).toContain('再設定');
  });

  it('サービス側から尋ねない旨の警告を含む', () => {
    expect(text).toContain('パスワードをお尋ねすることはありません');
  });

  it('心当たりがない場合の案内を含む', () => {
    // 身に覚えがなければ、確認コードが届く受信箱を第三者に見られている
    expect(text).toContain('心当たりがない場合');
  });
});
