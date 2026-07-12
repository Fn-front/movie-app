/**
 * @jest-environment node
 */

/**
 * Wikipedia記事取得ロジック テスト
 */

import { fetchWikipediaArticle } from './fetchArticle';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Helper ---

function createJsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  };
}

function createSectionsResponse(sections: { line: string; index: string }[]) {
  return createJsonResponse({ parse: { sections } });
}

function createWikitextResponse(wikitext: string) {
  return createJsonResponse({ parse: { wikitext: { '*': wikitext } } });
}

// --- Tests ---

describe('fetchWikipediaArticle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WIKIPEDIA_API_BASE_URL = 'https://example.test/w/api.php';
  });

  afterEach(() => {
    delete process.env.WIKIPEDIA_API_BASE_URL;
  });

  it('受賞セクションが見つかった場合、セクションのwikitextを返す', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createSectionsResponse([
          { line: '概要', index: '1' },
          { line: '受賞とノミネート', index: '2' },
        ]),
      )
      .mockResolvedValueOnce(
        createWikitextResponse('== 受賞とノミネート ==\nテスト本文'),
      );

    const result = await fetchWikipediaArticle('第97回アカデミー賞');

    expect(result).toBe('== 受賞とノミネート ==\nテスト本文');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('ノミネートを含むセクション名でもマッチする', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createSectionsResponse([
          { line: '概要', index: '1' },
          { line: 'ノミネート一覧', index: '3' },
        ]),
      )
      .mockResolvedValueOnce(createWikitextResponse('ノミネートデータ'));

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBe('ノミネートデータ');
  });

  it('受賞セクションが見つからない場合、記事全体のwikitextを返す', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createSectionsResponse([
          { line: '概要', index: '1' },
          { line: '関連項目', index: '2' },
        ]),
      )
      .mockResolvedValueOnce(createWikitextResponse('記事全体のテキスト'));

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBe('記事全体のテキスト');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('セクション取得でHTTPエラーの場合、記事全体にフォールバックする', async () => {
    mockFetch
      .mockResolvedValueOnce(createJsonResponse({}, false))
      .mockResolvedValueOnce(createWikitextResponse('フォールバックテキスト'));

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBe('フォールバックテキスト');
  });

  it('セクションAPIがエラーを返した場合、記事全体にフォールバックする', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createJsonResponse({ error: { code: 'missingtitle' } }),
      )
      .mockResolvedValueOnce(createWikitextResponse('フォールバックテキスト'));

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBe('フォールバックテキスト');
  });

  it('セクションwikitext取得が空の場合、記事全体にフォールバックする', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createSectionsResponse([{ line: '受賞', index: '2' }]),
      )
      .mockResolvedValueOnce(
        createJsonResponse({ parse: { wikitext: { '*': '' } } }),
      )
      .mockResolvedValueOnce(createWikitextResponse('全体テキスト'));

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBe('全体テキスト');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('記事全体のwikitextも取得できない場合、nullを返す', async () => {
    mockFetch
      .mockResolvedValueOnce(createSectionsResponse([]))
      .mockResolvedValueOnce(createJsonResponse({}, false));

    const result = await fetchWikipediaArticle('存在しない記事');

    expect(result).toBeNull();
  });

  it('記事全体がWikipediaエラーの場合、nullを返す', async () => {
    mockFetch
      .mockResolvedValueOnce(createSectionsResponse([]))
      .mockResolvedValueOnce(
        createJsonResponse({ error: { code: 'missingtitle' } }),
      );

    const result = await fetchWikipediaArticle('存在しない記事');

    expect(result).toBeNull();
  });

  it('記事全体のwikitextが空の場合、nullを返す', async () => {
    mockFetch
      .mockResolvedValueOnce(createSectionsResponse([]))
      .mockResolvedValueOnce(
        createJsonResponse({ parse: { wikitext: { '*': '' } } }),
      );

    const result = await fetchWikipediaArticle('空の記事');

    expect(result).toBeNull();
  });

  it('fetchが例外をスローした場合、nullを返す', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBeNull();
  });

  it('User-Agentヘッダーが設定される', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createSectionsResponse([{ line: '受賞', index: '1' }]),
      )
      .mockResolvedValueOnce(createWikitextResponse('テスト'));

    await fetchWikipediaArticle('テスト記事');

    const firstCallOptions = mockFetch.mock.calls[0][1];
    expect(firstCallOptions.headers['User-Agent']).toContain('MovieApp');
  });

  it('WIKIPEDIA_API_BASE_URL 未設定時はfetchせずnullを返す', async () => {
    delete process.env.WIKIPEDIA_API_BASE_URL;

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sectionsがnullの場合、記事全体にフォールバックする', async () => {
    mockFetch
      .mockResolvedValueOnce(createJsonResponse({ parse: { sections: null } }))
      .mockResolvedValueOnce(createWikitextResponse('全体テキスト'));

    const result = await fetchWikipediaArticle('テスト記事');

    expect(result).toBe('全体テキスト');
  });
});
