import { updateProfileSchema, updateSettingsSchema } from './user';

describe('updateProfileSchema', () => {
  it('有効な表示名を受け付ける', () => {
    const result = updateProfileSchema.safeParse({ name: 'テストユーザー' });
    expect(result.success).toBe(true);
  });

  it('空文字を拒否する', () => {
    const result = updateProfileSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('空白のみを拒否する', () => {
    const result = updateProfileSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('101文字以上を拒否する', () => {
    const result = updateProfileSchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('100文字を受け付ける', () => {
    const result = updateProfileSchema.safeParse({ name: 'a'.repeat(100) });
    expect(result.success).toBe(true);
  });
});

describe('updateSettingsSchema', () => {
  it('有効なテーマを受け付ける', () => {
    const result = updateSettingsSchema.safeParse({ theme: 'dark' });
    expect(result.success).toBe(true);
  });

  it('無効なテーマを拒否する', () => {
    const result = updateSettingsSchema.safeParse({ theme: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('通知設定のみを受け付ける', () => {
    const result = updateSettingsSchema.safeParse({
      notificationEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('空オブジェクトを受け付ける', () => {
    const result = updateSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('updateSettingsSchema の streamingNoticeScope', () => {
  it("'any' を受け付ける", () => {
    const result = updateSettingsSchema.safeParse({
      streamingNoticeScope: 'any',
    });

    expect(result.success).toBe(true);
  });

  it("'flatrate' を受け付ける", () => {
    const result = updateSettingsSchema.safeParse({
      streamingNoticeScope: 'flatrate',
    });

    expect(result.success).toBe(true);
  });

  it('未知の値は失敗する', () => {
    const result = updateSettingsSchema.safeParse({
      streamingNoticeScope: 'rent-only',
    });

    expect(result.success).toBe(false);
  });

  it('省略できる（他の設定だけ更新できる）', () => {
    const result = updateSettingsSchema.safeParse({
      notificationEnabled: true,
    });

    expect(result.success).toBe(true);
  });
});

describe('updateSettingsSchema（Cookie同意）', () => {
  const AT = '2026-11-03T00:30:00.000Z';

  it('同意状態と日時をセットで受け付ける', () => {
    const result = updateSettingsSchema.safeParse({
      cookieConsent: 'granted',
      cookieConsentAt: AT,
    });

    expect(result.success).toBe(true);
  });

  it('日時が null でも受け付ける', () => {
    const result = updateSettingsSchema.safeParse({
      cookieConsent: 'denied',
      cookieConsentAt: null,
    });

    expect(result.success).toBe(true);
  });

  it('同意状態だけでは失敗する（証跡の改ざん防止）', () => {
    // 片方だけ送れると、状態を変えずに同意日時だけ任意の過去値へ
    // 書き換えられる
    const result = updateSettingsSchema.safeParse({
      cookieConsent: 'granted',
    });

    expect(result.success).toBe(false);
  });

  it('日時だけでは失敗する', () => {
    const result = updateSettingsSchema.safeParse({ cookieConsentAt: AT });

    expect(result.success).toBe(false);
  });

  it('未知の同意状態は失敗する', () => {
    const result = updateSettingsSchema.safeParse({
      cookieConsent: 'maybe',
      cookieConsentAt: AT,
    });

    expect(result.success).toBe(false);
  });

  it('ISO 8601 でない日時は失敗する', () => {
    const result = updateSettingsSchema.safeParse({
      cookieConsent: 'granted',
      cookieConsentAt: 'not-a-date',
    });

    expect(result.success).toBe(false);
  });

  it('PostgREST 形式（+00:00）を受け付ける', () => {
    // サーバーから降ろした値をそのまま送り返す経路がある
    const result = updateSettingsSchema.safeParse({
      cookieConsent: 'granted',
      cookieConsentAt: '2026-11-03T00:30:00+00:00',
    });

    expect(result.success).toBe(true);
  });

  it('版は受け付けず、parse 結果から除去する', () => {
    // 版をクライアント申告にすると、古い同意を現行版に見せかけて
    // 再同意を回避できてしまう。z.object は未知キーを黙って捨てる
    const result = updateSettingsSchema.safeParse({
      cookieConsent: 'granted',
      cookieConsentAt: AT,
      cookieConsentVersion: 99,
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('cookieConsentVersion');
  });

  it('同意を含めなければ他の設定だけ更新できる', () => {
    const result = updateSettingsSchema.safeParse({ theme: 'dark' });

    expect(result.success).toBe(true);
  });
});
