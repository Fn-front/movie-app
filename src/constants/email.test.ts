/**
 * OTPメール文面のテスト
 *
 * 3用途で文面が同一だと、受信者が何のコードか判断できずソーシャル
 * エンジニアリングに弱くなるため、用途の明記と共有禁止の警告を検証する（#648）。
 */

import { buildOtpEmailSubject, buildOtpEmailText } from './email';
import { OTP_ACTION, OTP_CONFIG, type OtpAction } from './otp';

const ALL_ACTIONS: OtpAction[] = [
  OTP_ACTION.REGISTRATION,
  OTP_ACTION.LOGIN,
  OTP_ACTION.PASSWORD_CHANGE,
];

describe('buildOtpEmailSubject', () => {
  it.each([
    [OTP_ACTION.REGISTRATION, 'メールアドレスの確認'],
    [OTP_ACTION.LOGIN, 'ログイン'],
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
    [OTP_ACTION.LOGIN, 'ログイン'],
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
