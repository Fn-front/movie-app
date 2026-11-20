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
 * パスワード失効の通知（#1302）
 *
 * 未検証のまま放置されたアカウントが「メールでログイン」で認証済みへ昇格する
 * とき、出自の分からない `password_hash` を失効させる。伝えないと、利用者は
 * 次のパスワードログインが弾かれる理由を知るすべがない。
 */
describe('パスワード失効の通知メール', () => {
  const settingsUrl = 'https://example.com/settings';
  const text = buildPasswordInvalidatedEmailText(settingsUrl);

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
    expect(text).toContain(settingsUrl);
  });

  it('失効中もメールでログインできる旨を書く', () => {
    // ここが抜けると、パスワードを失った利用者が締め出されたと誤解する
    expect(text).toContain('メールでログイン');
  });

  it('サービス側から尋ねない旨の警告を含む', () => {
    expect(text).toContain('パスワードをお尋ねすることはありません');
  });

  it('心当たりがない場合の案内を含む', () => {
    // 身に覚えがなければ、確認コードが届く受信箱を第三者に見られている
    expect(text).toContain('心当たりがない場合');
  });
});
