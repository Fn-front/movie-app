import { theaterSlugSchema } from './theaters';

describe('theaterSlugSchema', () => {
  it('有効なslugを受け入れる', () => {
    expect(theaterSlugSchema.safeParse('standard-medium').success).toBe(true);
    expect(theaterSlugSchema.safeParse('toho-roppongi-s7').success).toBe(true);
    expect(theaterSlugSchema.safeParse('a').success).toBe(true);
    expect(theaterSlugSchema.safeParse('abc123').success).toBe(true);
  });

  it('空文字を拒否する', () => {
    const result = theaterSlugSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('101文字以上を拒否する', () => {
    const longSlug = 'a'.repeat(101);
    const result = theaterSlugSchema.safeParse(longSlug);
    expect(result.success).toBe(false);
  });

  it('100文字ちょうどは受け入れる', () => {
    const slug100 = 'a'.repeat(100);
    expect(theaterSlugSchema.safeParse(slug100).success).toBe(true);
  });

  it('大文字を含むslugを拒否する', () => {
    const result = theaterSlugSchema.safeParse('Standard-Medium');
    expect(result.success).toBe(false);
  });

  it('スペースを含むslugを拒否する', () => {
    const result = theaterSlugSchema.safeParse('standard medium');
    expect(result.success).toBe(false);
  });

  it('特殊文字を含むslugを拒否する', () => {
    expect(theaterSlugSchema.safeParse('theater_1').success).toBe(false);
    expect(theaterSlugSchema.safeParse('theater.1').success).toBe(false);
    expect(theaterSlugSchema.safeParse('theater/1').success).toBe(false);
  });
});
