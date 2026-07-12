/**
 * Trusted Types ポリシー（段階3）のテスト
 *
 * jsdom には `window.trustedTypes` が無いため、対応環境の挙動は
 * `createPolicy` をモックした factory を注入して検証する。非対応環境は
 * `window.trustedTypes` が undefined のまま（既定）で検証する。
 *
 * モジュール内でポリシーをキャッシュするため、各テストで
 * `jest.resetModules()` + 動的 import して状態をリセットする。
 */

/** 元の window.trustedTypes を退避し、各テスト後に復元する。 */
const originalTrustedTypes = (window as unknown as { trustedTypes?: unknown })
  .trustedTypes;

afterEach(() => {
  if (originalTrustedTypes === undefined) {
    delete (window as unknown as { trustedTypes?: unknown }).trustedTypes;
  } else {
    (window as unknown as { trustedTypes?: unknown }).trustedTypes =
      originalTrustedTypes;
  }
  jest.resetModules();
});

/**
 * createPolicy を記録するモック factory を window に注入する。
 * ポリシーは createHTML / createScript ともに恒等関数（値を検証しやすくする）。
 */
function installTrustedTypesMock(): { createPolicy: jest.Mock } {
  const createPolicy = jest.fn(
    (
      name: string,
      options: {
        createHTML?: (s: string) => string;
        createScript?: (s: string) => string;
      },
    ) => ({
      name,
      createHTML: (input: string) => options.createHTML?.(input) ?? input,
      createScript: (input: string) => options.createScript?.(input) ?? input,
    }),
  );
  (window as unknown as { trustedTypes?: unknown }).trustedTypes = {
    createPolicy,
  };
  return { createPolicy };
}

function removeTrustedTypes(): void {
  delete (window as unknown as { trustedTypes?: unknown }).trustedTypes;
}

describe('ポリシー名の単一ソース整合性', () => {
  it('公開する名前が CSP 許可リスト（TRUSTED_TYPES_POLICIES）に含まれる', async () => {
    const mod = await import('./trustedTypes');
    const { TRUSTED_TYPES_POLICIES } = await import('./cspDirectives.mjs');
    expect(TRUSTED_TYPES_POLICIES).toContain(mod.SANITIZE_HTML_POLICY_NAME);
    expect(TRUSTED_TYPES_POLICIES).toContain(mod.THEME_INIT_POLICY_NAME);
  });
});

describe('isTrustedTypesSupported', () => {
  it('window.trustedTypes.createPolicy があれば true', async () => {
    installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    expect(mod.isTrustedTypesSupported()).toBe(true);
  });

  it('window.trustedTypes が無ければ false', async () => {
    removeTrustedTypes();
    const mod = await import('./trustedTypes');
    expect(mod.isTrustedTypesSupported()).toBe(false);
  });
});

describe('getSanitizeHtmlPolicy', () => {
  it('対応環境では sanitize-html ポリシーを生成する', async () => {
    const { createPolicy } = installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    const policy = mod.getSanitizeHtmlPolicy();
    expect(policy).not.toBeNull();
    expect(createPolicy).toHaveBeenCalledWith(
      'sanitize-html',
      expect.objectContaining({ createHTML: expect.any(Function) }),
    );
  });

  it('同一ポリシーをキャッシュして再生成しない', async () => {
    const { createPolicy } = installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    mod.getSanitizeHtmlPolicy();
    mod.getSanitizeHtmlPolicy();
    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it('非対応環境では null を返す', async () => {
    removeTrustedTypes();
    const mod = await import('./trustedTypes');
    expect(mod.getSanitizeHtmlPolicy()).toBeNull();
  });

  it('createHTML は DOMPurify でサニタイズする（危険なタグを除去）', async () => {
    installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    const policy = mod.getSanitizeHtmlPolicy();
    const result = policy!.createHTML(
      '<img src=x onerror=alert(1)><b>ok</b>',
    ) as unknown as string;
    expect(result).toContain('<b>ok</b>');
    expect(result).not.toContain('onerror');
  });
});

describe('sanitizeHtml', () => {
  it('対応環境ではポリシー経由でサニタイズした値を返す', async () => {
    installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    const result = mod.sanitizeHtml(
      '<script>alert(1)</script><p>hi</p>',
    ) as unknown as string;
    expect(result).toContain('<p>hi</p>');
    expect(result).not.toContain('<script>');
  });

  it('非対応環境でも DOMPurify でサニタイズした文字列を返す', async () => {
    removeTrustedTypes();
    const mod = await import('./trustedTypes');
    const result = mod.sanitizeHtml(
      '<a href="javascript:alert(1)">x</a><span>safe</span>',
    ) as unknown as string;
    expect(result).toContain('<span>safe</span>');
    expect(result).not.toContain('javascript:');
  });
});

describe('getThemeInitPolicy', () => {
  it('対応環境では theme-init ポリシーを生成する', async () => {
    const { createPolicy } = installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    const policy = mod.getThemeInitPolicy();
    expect(policy).not.toBeNull();
    expect(createPolicy).toHaveBeenCalledWith(
      'theme-init',
      expect.objectContaining({ createScript: expect.any(Function) }),
    );
  });

  it('createScript は入力をそのまま返す（固定スクリプト用）', async () => {
    installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    const policy = mod.getThemeInitPolicy();
    const script = '(function(){})()';
    expect(policy!.createScript(script) as unknown as string).toBe(script);
  });

  it('キャッシュして再生成しない', async () => {
    const { createPolicy } = installTrustedTypesMock();
    const mod = await import('./trustedTypes');
    mod.getThemeInitPolicy();
    mod.getThemeInitPolicy();
    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it('非対応環境では null を返す', async () => {
    removeTrustedTypes();
    const mod = await import('./trustedTypes');
    expect(mod.getThemeInitPolicy()).toBeNull();
  });
});
