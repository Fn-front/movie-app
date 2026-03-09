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
