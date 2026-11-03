/**
 * GA4 境界のテスト
 *
 * buildConsentBootstrapScript は生成した文字列を実際に評価して、
 * 「版が古い granted では denied が積まれる」「push された要素が
 * Arguments である」という挙動まで確認する。文字列への部分一致だけだと、
 * 出力は版によらず同一なので版の判定を検証できない。
 */

import { STORAGE_KEYS } from '@/constants/common';
import { COOKIE_CONSENT_VERSION } from '@/constants/user';
import {
  buildConsentBootstrapScript,
  buildDomainCandidates,
  buildGtagInitScript,
  deleteGaCookies,
  getGaMeasurementId,
  sendConsentUpdate,
  sendPageView,
} from './analytics';

const ORIGINAL_GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/** 生成されたブートストラップスクリプトを jsdom で評価する */
function runBootstrap(version = COOKIE_CONSENT_VERSION): unknown[] {
  delete window.dataLayer;
  delete window.gtag;
  window.eval(buildConsentBootstrapScript(version));
  return window.dataLayer ?? [];
}

describe('analytics', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.dataLayer;
    delete window.gtag;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GA_ID = ORIGINAL_GA_ID;
  });

  describe('getGaMeasurementId', () => {
    it('未設定なら null', () => {
      delete process.env.NEXT_PUBLIC_GA_ID;
      expect(getGaMeasurementId()).toBeNull();
    });

    it('空文字・空白のみなら null', () => {
      process.env.NEXT_PUBLIC_GA_ID = '';
      expect(getGaMeasurementId()).toBeNull();

      process.env.NEXT_PUBLIC_GA_ID = '   ';
      expect(getGaMeasurementId()).toBeNull();
    });

    it('正しい形式を通す', () => {
      process.env.NEXT_PUBLIC_GA_ID = 'G-PSW1MY7HB4';
      expect(getGaMeasurementId()).toBe('G-PSW1MY7HB4');
    });

    it('前後の空白を落とす（Vercel への貼り付け事故を防ぐ）', () => {
      process.env.NEXT_PUBLIC_GA_ID = '  G-PSW1MY7HB4\n';
      expect(getGaMeasurementId()).toBe('G-PSW1MY7HB4');
    });

    it.each([
      ['小文字を含む', 'G-psw1my7hb4'],
      ['GT- 形式', 'GT-PSW1MY7HB4'],
      ['接頭辞なし', 'PSW1MY7HB4'],
      ['短すぎる', 'G-AB1'],
      ['引用符の混入', "G-ABC123'};alert(1);//"],
    ])('%s は無効として null を返す', (_label, value) => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_GA_ID = value;
      expect(getGaMeasurementId()).toBeNull();
    });

    it('無効なときは理由を warn する（本番以外）', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_GA_ID = 'invalid';
      getGaMeasurementId();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid'));
    });
  });

  describe('buildConsentBootstrapScript', () => {
    it('ストレージキーと版を補間する（定数との同期漏れを防ぐ）', () => {
      const script = buildConsentBootstrapScript(7);
      expect(script).toContain(STORAGE_KEYS.COOKIE_CONSENT);
      expect(script).toContain(STORAGE_KEYS.COOKIE_CONSENT_VERSION);
      expect(script).toContain('"7"');
    });

    it('引数を省略すると現行版を使う', () => {
      expect(buildConsentBootstrapScript()).toContain(
        `"${COOKIE_CONSENT_VERSION}"`,
      );
    });

    it('window.gtag をグローバルに定義する', () => {
      // IIFE の中で function gtag(){} と書くと関数スコープに閉じ、
      // consent update が丸ごと不発になる
      runBootstrap();
      expect(typeof window.gtag).toBe('function');
      expect(Array.isArray(window.dataLayer)).toBe(true);
    });

    it('push される要素が Arguments オブジェクトである', () => {
      // Array を積むと gtag.js がコマンドとして認識しない
      const dataLayer = runBootstrap();
      expect(Object.prototype.toString.call(dataLayer[0])).toBe(
        '[object Arguments]',
      );
    });

    it('未決定なら analytics_storage は denied', () => {
      const dataLayer = runBootstrap();
      const args = Array.from(dataLayer[0] as IArguments);
      expect(args[0]).toBe('consent');
      expect(args[1]).toBe('default');
      expect(args[2]).toEqual({
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      });
    });

    it('現行版の granted なら analytics_storage は granted', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'granted');
      window.localStorage.setItem(
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        String(COOKIE_CONSENT_VERSION),
      );

      const dataLayer = runBootstrap();
      const args = Array.from(dataLayer[0] as IArguments);
      expect(args[2]).toMatchObject({ analytics_storage: 'granted' });
    });

    it('版が古い granted では granted を出さない', () => {
      // これが効かないと、版を上げた直後の再訪問で _ga が書かれる
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'granted');
      window.localStorage.setItem(
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        String(COOKIE_CONSENT_VERSION - 1),
      );

      const dataLayer = runBootstrap();
      const args = Array.from(dataLayer[0] as IArguments);
      expect(args[2]).toMatchObject({ analytics_storage: 'denied' });
    });

    it('版が未保存の granted でも granted を出さない', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'granted');

      const dataLayer = runBootstrap();
      const args = Array.from(dataLayer[0] as IArguments);
      expect(args[2]).toMatchObject({ analytics_storage: 'denied' });
    });

    it('denied なら granted を出さない', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'denied');
      window.localStorage.setItem(
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        String(COOKIE_CONSENT_VERSION),
      );

      const dataLayer = runBootstrap();
      const args = Array.from(dataLayer[0] as IArguments);
      expect(args[2]).toMatchObject({ analytics_storage: 'denied' });
    });

    it('localStorage が読めなくても落ちず denied になる', () => {
      jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const dataLayer = runBootstrap();
      const args = Array.from(dataLayer[0] as IArguments);
      expect(args[2]).toMatchObject({ analytics_storage: 'denied' });
    });

    it('広告系の3パラメータは常に denied', () => {
      window.localStorage.setItem(STORAGE_KEYS.COOKIE_CONSENT, 'granted');
      window.localStorage.setItem(
        STORAGE_KEYS.COOKIE_CONSENT_VERSION,
        String(COOKIE_CONSENT_VERSION),
      );

      const dataLayer = runBootstrap();
      const args = Array.from(dataLayer[0] as IArguments);
      expect(args[2]).toMatchObject({
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    });
  });

  describe('buildGtagInitScript', () => {
    it('自動 page_view を切る', () => {
      const script = buildGtagInitScript('G-PSW1MY7HB4');
      expect(script).toContain('send_page_view:false');
      expect(script).toContain('"G-PSW1MY7HB4"');
    });

    it('dataLayer と gtag を再定義しない（consent default を消さない）', () => {
      const script = buildGtagInitScript('G-PSW1MY7HB4');
      expect(script).not.toContain('window.dataLayer=');
      expect(script).not.toContain('window.gtag=');
    });

    it('ブートストラップの直後に評価しても consent default が残る', () => {
      const dataLayer = runBootstrap();
      window.eval(buildGtagInitScript('G-PSW1MY7HB4'));

      expect(Array.from(dataLayer[0] as IArguments)[1]).toBe('default');
      expect(dataLayer).toHaveLength(3);
    });
  });

  describe('sendConsentUpdate', () => {
    it('granted / denied を送る', () => {
      const gtag = jest.fn();
      window.gtag = gtag;

      sendConsentUpdate(true);
      expect(gtag).toHaveBeenCalledWith('consent', 'update', {
        analytics_storage: 'granted',
      });

      sendConsentUpdate(false);
      expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
        analytics_storage: 'denied',
      });
    });

    it('gtag が未定義でも落ちない（GA ID 無効時の撤回）', () => {
      expect(() => sendConsentUpdate(false)).not.toThrow();
    });
  });

  describe('sendPageView', () => {
    it('パス・URL・タイトルを明示して送る', () => {
      const gtag = jest.fn();
      window.gtag = gtag;

      sendPageView({
        pagePath: '/movies/now-showing',
        pageLocation: 'https://example.com/movies/now-showing?page=2',
        pageTitle: '公開中 | Movie App',
      });

      expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
        page_path: '/movies/now-showing',
        page_location: 'https://example.com/movies/now-showing?page=2',
        page_title: '公開中 | Movie App',
      });
    });

    it('gtag が未定義でも落ちない', () => {
      expect(() =>
        sendPageView({ pagePath: '/', pageLocation: '/', pageTitle: '' }),
      ).not.toThrow();
    });
  });

  describe('buildDomainCandidates', () => {
    it('サブドメイン配信では eTLD+1 まで遡る候補を出す', () => {
      // GA の cookie_domain は既定 auto で、www.example.com で配信していても
      // Cookie は .example.com に置かれる。現在のホスト名だけでは消えない
      expect(buildDomainCandidates('www.example.com')).toEqual([
        'www.example.com',
        'example.com',
        'com',
      ]);
    });

    it('localhost は自身のみ', () => {
      expect(buildDomainCandidates('localhost')).toEqual(['localhost']);
    });

    it('深いサブドメインも最も具体的なものから並べる', () => {
      expect(buildDomainCandidates('a.b.example.co.jp')).toEqual([
        'a.b.example.co.jp',
        'b.example.co.jp',
        'example.co.jp',
        'co.jp',
        'jp',
      ]);
    });
  });

  describe('deleteGaCookies', () => {
    /** jsdom の document.cookie は domain 属性を検証しないので、書き込みを記録して確認する */
    function captureCookieWrites(): string[] {
      const writes: string[] = [];
      const descriptor = Object.getOwnPropertyDescriptor(
        Document.prototype,
        'cookie',
      );
      jest
        .spyOn(document, 'cookie', 'set')
        .mockImplementation((value: string) => {
          writes.push(value);
          descriptor?.set?.call(document, value);
        });
      return writes;
    }

    beforeEach(() => {
      for (const name of ['_ga', '_ga_ABC1234567', 'other']) {
        document.cookie = `${name}=; path=/; max-age=0`;
      }
    });

    it('_ga で始まる Cookie だけを対象にする', () => {
      document.cookie = '_ga=GA1.1.123';
      document.cookie = '_ga_ABC1234567=GS1.1.456';
      document.cookie = 'other=keep';

      const writes = captureCookieWrites();
      deleteGaCookies();

      expect(writes.some((w) => w.startsWith('_ga='))).toBe(true);
      expect(writes.some((w) => w.startsWith('_ga_ABC1234567='))).toBe(true);
      expect(writes.some((w) => w.startsWith('other='))).toBe(false);
    });

    it('domain 属性なし・ホスト名・ドット付きの3通りで消す', () => {
      document.cookie = '_ga=GA1.1.123';

      const writes = captureCookieWrites();
      deleteGaCookies();

      const forGa = writes.filter((w) => w.startsWith('_ga='));
      // localhost では domain 属性なしの host-only Cookie になる
      expect(forGa).toContain('_ga=; path=/; max-age=0');
      expect(forGa).toContain('_ga=; path=/; max-age=0; domain=localhost');
      expect(forGa).toContain('_ga=; path=/; max-age=0; domain=.localhost');
    });

    it('対象が無ければ何も書かない', () => {
      const writes = captureCookieWrites();
      deleteGaCookies();
      expect(writes).toHaveLength(0);
    });

    it('消し残ったら warn する（本番以外）', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      document.cookie = '_ga=GA1.1.123';

      // 書き込みを握りつぶして「消せない」状況を作る
      jest.spyOn(document, 'cookie', 'set').mockImplementation(() => {});
      deleteGaCookies();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('_ga'));
    });
  });
});
