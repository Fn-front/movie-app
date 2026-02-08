import {
  truncate,
  capitalize,
  toTitleCase,
  stripHtml,
  toKebabCase,
  toCamelCase,
  toSnakeCase,
  normalizeWhitespace,
  generateRandomString,
  matches,
} from './string';

describe('truncate', () => {
  it('nullの場合nullを返す', () => {
    expect(truncate(null, 10)).toBeNull();
  });

  it('長さ以下の文字列はそのまま返す', () => {
    expect(truncate('Short', 10)).toBe('Short');
  });

  it('超過する文字列を切り詰めて省略記号を付ける', () => {
    expect(truncate('これは長いテキストです', 5)).toBe('これは長い...');
  });

  it('カスタム省略記号を使用する', () => {
    expect(truncate('これは長いテキストです', 5, '…')).toBe('これは長い…');
  });
});

describe('capitalize', () => {
  it('nullの場合nullを返す', () => {
    expect(capitalize(null)).toBeNull();
  });

  it('最初の文字を大文字にする', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('空文字の場合nullを返す', () => {
    expect(capitalize('')).toBeNull();
  });
});

describe('toTitleCase', () => {
  it('nullの場合nullを返す', () => {
    expect(toTitleCase(null)).toBeNull();
  });

  it('各単語の最初の文字を大文字にする', () => {
    expect(toTitleCase('hello world')).toBe('Hello World');
  });
});

describe('stripHtml', () => {
  it('nullの場合nullを返す', () => {
    expect(stripHtml(null)).toBeNull();
  });

  it('HTMLタグを除去する', () => {
    expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe(
      'Hello World',
    );
  });
});

describe('toKebabCase', () => {
  it('nullの場合nullを返す', () => {
    expect(toKebabCase(null)).toBeNull();
  });

  it('スペース区切りをケバブケースに変換する', () => {
    expect(toKebabCase('Hello World')).toBe('hello-world');
  });

  it('キャメルケースをケバブケースに変換する', () => {
    expect(toKebabCase('userName')).toBe('user-name');
  });
});

describe('toCamelCase', () => {
  it('nullの場合nullを返す', () => {
    expect(toCamelCase(null)).toBeNull();
  });

  it('ケバブケースをキャメルケースに変換する', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld');
  });

  it('スネークケースをキャメルケースに変換する', () => {
    expect(toCamelCase('user_name')).toBe('userName');
  });
});

describe('toSnakeCase', () => {
  it('nullの場合nullを返す', () => {
    expect(toSnakeCase(null)).toBeNull();
  });

  it('スペース区切りをスネークケースに変換する', () => {
    expect(toSnakeCase('Hello World')).toBe('hello_world');
  });

  it('キャメルケースをスネークケースに変換する', () => {
    expect(toSnakeCase('userName')).toBe('user_name');
  });
});

describe('normalizeWhitespace', () => {
  it('nullの場合nullを返す', () => {
    expect(normalizeWhitespace(null)).toBeNull();
  });

  it('余分な空白を除去して正規化する', () => {
    expect(normalizeWhitespace('  Hello   World  ')).toBe('Hello World');
  });
});

describe('generateRandomString', () => {
  it('指定した長さの文字列を返す', () => {
    const result = generateRandomString(16);
    expect(result).toHaveLength(16);
  });

  it('長さ0の場合空文字を返す', () => {
    expect(generateRandomString(0)).toBe('');
  });
});

describe('matches', () => {
  it('nullの場合falseを返す', () => {
    expect(matches(null, /test/)).toBe(false);
  });

  it('パターンにマッチする場合trueを返す', () => {
    expect(matches('hello123', /^[a-z]+\d+$/)).toBe(true);
  });

  it('パターンに不一致の場合falseを返す', () => {
    expect(matches('hello', /^\d+$/)).toBe(false);
  });
});
