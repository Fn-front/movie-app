import {
  buildChangePasswordSchema,
  registerSchema,
  registerApiSchema,
  loginSchema,
  changePasswordSchema,
  changePasswordApiSchema,
  passwordResetConfirmApiSchema,
} from './auth';
import { VALIDATION } from '@/constants';
import { VALIDATION_MESSAGES } from '@/constants/auth';
import { getByteLength } from '@/utils/string';

describe('registerSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1234',
      confirmPassword: 'Password1234',
      name: 'テスト',
    });
    expect(result.success).toBe(true);
  });

  it('名前なしでもパースが成功する', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1234',
      confirmPassword: 'Password1234',
      name: '',
    });
    expect(result.success).toBe(true);
  });

  it('メールアドレスが空の場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: '',
      password: 'Password1234',
      confirmPassword: 'Password1234',
    });
    expect(result.success).toBe(false);
  });

  it('メールアドレスの形式が不正な場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'invalid-email',
      password: 'Password1234',
      confirmPassword: 'Password1234',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードが12文字未満の場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードに大文字がない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password1234',
      confirmPassword: 'password1234',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードに小文字がない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'PASSWORD1234',
      confirmPassword: 'PASSWORD1234',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードに数字がない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'PasswordAbcd',
      confirmPassword: 'PasswordAbcd',
    });
    expect(result.success).toBe(false);
  });

  it('パスワードが一致しない場合エラーになる', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1234',
      confirmPassword: 'Password5678',
    });
    expect(result.success).toBe(false);
  });
});

describe('メールアドレスの正規化', () => {
  it('registerSchema: 大文字を小文字に正規化する', () => {
    const result = registerSchema.safeParse({
      email: 'TeSt@ExAmPle.COM',
      password: 'Password1234',
      confirmPassword: 'Password1234',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('registerApiSchema: 前後の空白を落として小文字に正規化する', () => {
    const result = registerApiSchema.safeParse({
      email: '  TeSt@ExAmPle.COM  ',
      password: 'Password1234',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('loginSchema: 大文字を小文字に正規化する', () => {
    const result = loginSchema.safeParse({
      email: 'TeSt@ExAmPle.COM',
      password: 'Password1234',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('大小文字違いの表記はすべて同じ値に収束する（登録上限を分割できない）', () => {
    const variants = ['a@b.com', 'A@B.com', 'a@B.COM', 'A@B.COM'];
    const parsed = variants.map((email) => {
      const result = registerApiSchema.safeParse({
        email,
        password: 'Password1234',
      });
      return result.success ? result.data.email : null;
    });
    expect(new Set(parsed)).toEqual(new Set(['a@b.com']));
  });

  it('ドット違いは別アドレスのまま残す（プロバイダ固有の正規化はしない）', () => {
    const a = registerApiSchema.safeParse({
      email: 'v.ictim@gmail.com',
      password: 'Password1234',
    });
    const b = registerApiSchema.safeParse({
      email: 'victim@gmail.com',
      password: 'Password1234',
    });
    expect(a.success && b.success).toBe(true);
    if (a.success && b.success) {
      expect(a.data.email).not.toBe(b.data.email);
    }
  });
});

describe('loginSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1234',
    });
    expect(result.success).toBe(true);
  });

  it('メールアドレスが空の場合エラーになる', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'Password1234',
    });
    expect(result.success).toBe(false);
  });

  it('メールアドレスの形式が不正な場合エラーになる', () => {
    const result = loginSchema.safeParse({
      email: 'invalid-email',
      password: 'Password1234',
    });
    expect(result.success).toBe(false);
  });

  describe('アカウント名でのログイン', () => {
    // admin が発行するアカウントはメールを持たず、ユーザー名でログインする
    it.each([
      ['K7M2-QXPT-9WFN', '区切りあり'],
      ['K7M2QXPT9WFN', '区切りなし'],
      ['k7m2-qxpt-9wfn', '小文字'],
    ])('%s（%s）を受け付ける', (email) => {
      expect(
        loginSchema.safeParse({ email, password: 'Password1234' }).success,
      ).toBe(true);
    });

    // メールと違いユーザー名は大文字で構成される。一律に小文字化すると
    // 照合できなくなるため、スキーマでは畳まない（authorize が正規化する）
    it('アカウント名は小文字化しない', () => {
      const result = loginSchema.safeParse({
        email: 'K7M2-QXPT-9WFN',
        password: 'Password1234',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('K7M2-QXPT-9WFN');
      }
    });

    // 形を検証しないと「@ を打ち忘れたメール」が存在しないアカウント名として
    // 処理され、利用者は形式エラーではなく認証失敗を見ることになる
    it.each([
      ['userexample.com', '@ の打ち忘れ'],
      ['K7M2-QXPT', '短すぎる'],
      ['K7M2-QXPT-9WFN-EXTRA', '長すぎる'],
      ['IIII-OOOO-LLLL', '紛らわしい文字を含む'],
    ])('%s（%s）は弾く', (email) => {
      expect(
        loginSchema.safeParse({ email, password: 'Password1234' }).success,
      ).toBe(false);
    });
  });

  it('パスワードが空の場合エラーになる', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('registerApiSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = registerApiSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1234',
      name: 'テスト',
    });
    expect(result.success).toBe(true);
  });

  it('confirmPasswordフィールドがなくても成功する', () => {
    const result = registerApiSchema.safeParse({
      email: 'test@example.com',
      password: 'Password1234',
    });
    expect(result.success).toBe(true);
  });
});

describe('changePasswordSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword1',
      newPassword: 'NewPassword1',
      confirmNewPassword: 'NewPassword1',
    });
    expect(result.success).toBe(true);
  });

  it('新しいパスワードが12文字未満の場合エラーになる', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword1',
      newPassword: 'NewPassword',
      confirmNewPassword: 'NewPassword',
    });
    expect(result.success).toBe(false);
  });

  it('新しいパスワードに大文字がない場合エラーになる', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword1',
      newPassword: 'newpassword1',
      confirmNewPassword: 'newpassword1',
    });
    expect(result.success).toBe(false);
  });

  it('新しいパスワードに小文字がない場合エラーになる', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword1',
      newPassword: 'NEWPASSWORD1',
      confirmNewPassword: 'NEWPASSWORD1',
    });
    expect(result.success).toBe(false);
  });

  it('新しいパスワードに数字がない場合エラーになる', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword1',
      newPassword: 'NewPasswordAbc',
      confirmNewPassword: 'NewPasswordAbc',
    });
    expect(result.success).toBe(false);
  });

  it('新しいパスワードが一致しない場合エラーになる', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword1',
      newPassword: 'NewPassword1',
      confirmNewPassword: 'NewPassword2',
    });
    expect(result.success).toBe(false);
  });

  it('確認パスワードが空の場合エラーになる', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'CurrentPassword1',
      newPassword: 'NewPassword1',
      confirmNewPassword: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('changePasswordApiSchema', () => {
  it('有効な入力でパースが成功する', () => {
    const result = changePasswordApiSchema.safeParse({
      newPassword: 'NewPassword1',
      verificationToken: 'verification-token',
    });
    expect(result.success).toBe(true);
  });

  it('newPasswordがポリシーに違反する場合エラーになる', () => {
    const result = changePasswordApiSchema.safeParse({
      newPassword: 'short',
      verificationToken: 'verification-token',
    });
    expect(result.success).toBe(false);
  });

  it('verificationTokenが無い場合エラーになる（OTP検証の証明が必須）', () => {
    const result = changePasswordApiSchema.safeParse({
      newPassword: 'NewPassword1',
    });
    expect(result.success).toBe(false);
  });

  it('verificationTokenが空文字の場合エラーになる', () => {
    const result = changePasswordApiSchema.safeParse({
      newPassword: 'NewPassword1',
      verificationToken: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('buildChangePasswordSchema', () => {
  const base = {
    newPassword: 'NewPassword1',
    confirmNewPassword: 'NewPassword1',
  };

  describe('現在のパスワードを要求する場合（パスワード設定済みユーザー）', () => {
    const schema = buildChangePasswordSchema(true);

    it('currentPassword があればパースに成功する', () => {
      expect(
        schema.safeParse({ ...base, currentPassword: 'CurrentPassword1' })
          .success,
      ).toBe(true);
    });

    it('currentPassword が無いとエラーになる', () => {
      expect(schema.safeParse(base).success).toBe(false);
    });

    it('currentPassword が空文字だとエラーになる', () => {
      expect(schema.safeParse({ ...base, currentPassword: '' }).success).toBe(
        false,
      );
    });
  });

  describe('現在のパスワードを要求しない場合（ソーシャルログインのみ）', () => {
    const schema = buildChangePasswordSchema(false);

    it('currentPassword が無くてもパースに成功する', () => {
      expect(schema.safeParse(base).success).toBe(true);
    });

    it('新旧パスワードの不一致は従来どおり検出する', () => {
      expect(
        schema.safeParse({ ...base, confirmNewPassword: 'Different1' }).success,
      ).toBe(false);
    });
  });
});

describe('パスワードのバイト長上限（#652）', () => {
  /** 先頭の 'Aa1' でポリシー（大文字・小文字・数字）を満たし、残りで長さを作る */
  const buildPassword = (filler: string, repeat: number) =>
    `Aa1${filler.repeat(repeat)}`;

  /** ASCII 72バイトちょうど（3 + 69） */
  const EXACTLY_MAX = buildPassword('x', 69);
  /** ASCII 73バイト */
  const OVER_MAX = buildPassword('x', 70);
  /** 日本語（1文字3バイト）で72バイトちょうど（3 + 3×23） */
  const EXACTLY_MAX_JA = buildPassword('あ', 23);
  /** 日本語で75バイト。文字数は26文字しかないが上限を超える */
  const OVER_MAX_JA = buildPassword('あ', 24);

  /** パスワード単体の検証結果を取り出す */
  const parsePassword = (password: string) =>
    registerApiSchema.safeParse({ email: 'test@example.com', password });

  it('前提: 各入力のバイト長が意図どおり', () => {
    expect(getByteLength(EXACTLY_MAX)).toBe(VALIDATION.PASSWORD_MAX_BYTES);
    expect(getByteLength(OVER_MAX)).toBe(VALIDATION.PASSWORD_MAX_BYTES + 1);
    expect(getByteLength(EXACTLY_MAX_JA)).toBe(VALIDATION.PASSWORD_MAX_BYTES);
    expect(getByteLength(OVER_MAX_JA)).toBe(VALIDATION.PASSWORD_MAX_BYTES + 3);
  });

  it('72バイトちょうどは通る', () => {
    expect(parsePassword(EXACTLY_MAX).success).toBe(true);
  });

  it('73バイトは拒否され、バイト数の理由が返る', () => {
    const result = parsePassword(OVER_MAX);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        VALIDATION_MESSAGES.PASSWORD_MAX_BYTES(VALIDATION.PASSWORD_MAX_BYTES),
      );
    }
  });

  it('日本語を含む場合も72バイトちょうどまでは通る', () => {
    expect(parsePassword(EXACTLY_MAX_JA).success).toBe(true);
  });

  it('日本語を含む場合、文字数が上限未満でもバイト数で拒否される', () => {
    // 26文字しかないが75バイト。文字数で判定していたら通ってしまう
    expect(OVER_MAX_JA.length).toBeLessThan(VALIDATION.PASSWORD_MAX_BYTES);
    expect(parsePassword(OVER_MAX_JA).success).toBe(false);
  });

  it('パスワード変更・パスワード再設定にも同じ上限が効く', () => {
    expect(
      changePasswordApiSchema.safeParse({
        newPassword: OVER_MAX,
        verificationToken: 'token',
      }).success,
    ).toBe(false);

    expect(
      passwordResetConfirmApiSchema.safeParse({
        token: 'token',
        password: OVER_MAX,
      }).success,
    ).toBe(false);
  });
});

describe('changePasswordApiSchema — currentPassword（#643）', () => {
  it('currentPassword が無くてもスキーマ上は通る（ルート側で条件付き必須）', () => {
    expect(
      changePasswordApiSchema.safeParse({
        newPassword: 'NewPassword1',
        verificationToken: 'token',
      }).success,
    ).toBe(true);
  });

  it('currentPassword を含められる', () => {
    expect(
      changePasswordApiSchema.safeParse({
        newPassword: 'NewPassword1',
        verificationToken: 'token',
        currentPassword: 'CurrentPassword1',
      }).success,
    ).toBe(true);
  });
});
