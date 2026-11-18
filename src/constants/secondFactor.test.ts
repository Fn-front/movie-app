import { OTP_ACTION } from './otp';
import {
  FAIL_CLOSED_ACTIONS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from './rateLimit';
import { SECOND_FACTOR_METHOD, TWO_FACTOR_OTP_ACTION } from './secondFactor';

describe('第2要素の定数', () => {
  it('方式は totp と email_otp の2つ', () => {
    expect(Object.values(SECOND_FACTOR_METHOD)).toEqual(['totp', 'email_otp']);
  });

  /**
   * ⚠️ 次の2件は設計の前提そのもの。
   *
   * `src/schema/otp.ts` は公開ルートの zod enum を `OTP_ACTION` から導出して
   * いた。そこに `two_factor` を足すと `/api/auth/otp/send` と
   * `/api/auth/otp/verify` が受理し、`send` の action 分岐は宛先固定を
   * `password_change` のときしか行わないため、**未認証のまま任意のアドレスへ
   * 自サービス名義の確認コードを送れる**ようになる（#641 の穴の再発）。
   *
   * 導出は許可リストに置き換えたが（`PUBLIC_OTP_ACTIONS`）、`OTP_ACTION` を
   * 「公開ルートが受け付ける用途」の意味に保つこと自体を壊さないよう固定する。
   */
  it('two_factor は OTP_ACTION に含まれない', () => {
    expect(Object.values(OTP_ACTION)).not.toContain(TWO_FACTOR_OTP_ACTION);
  });

  it('OTP_ACTION は公開ルートが受け付ける3つだけ', () => {
    expect(Object.values(OTP_ACTION).sort()).toEqual([
      'login',
      'password_change',
      'registration',
    ]);
  });

  it('TWO_FACTOR_SEND は fail-closed（DB不調時に通さない）', () => {
    expect(FAIL_CLOSED_ACTIONS.has(RATE_LIMIT_ACTION.TWO_FACTOR_SEND)).toBe(
      true,
    );
  });

  /**
   * ⚠️ `consume_rate_limit` がカウンタをリセットするのは
   * `last_attempt_at <= now() - windowMinutes`、つまり「その窓のあいだ一度も
   * アクセスが無い」ときだけ。`maxAttempts` はレートではなく
   * **アイドルを挟むまでの通算回数**（`rateLimit.ts` の #934 の説明）。
   *
   * 窓を1440分（24時間）にすると、24時間まるごと送信が無い日を挟まない限り
   * カウンタが単調増加し、1日2回ログインする利用者は10日ほどで到達して
   * **24時間ログイン不能**になる。濫用ではなく通常利用で詰む。
   */
  it('送信上限の窓は1時間以内（長いと通常利用でロックアウトする）', () => {
    expect(RATE_LIMIT_CONFIG.TWO_FACTOR_SEND.windowMinutes).toBeLessThanOrEqual(
      60,
    );
  });
});
