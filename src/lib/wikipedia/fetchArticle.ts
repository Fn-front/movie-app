/**
 * Wikipedia API から記事のwikitextを取得する
 *
 * wikitext形式を使用する理由:
 * - explaintext（プレーンテキスト）ではテーブルが除去され、ノミネートリストが失われる
 * - wikitextにはテーブル構造と太字（受賞者）マークアップが保持される
 */

const WIKIPEDIA_API_BASE = 'https://ja.wikipedia.org/w/api.php';

const WIKIPEDIA_FETCH_OPTIONS: RequestInit = {
  headers: {
    'User-Agent': 'MovieApp/1.0 (https://github.com/Fn-front/movie-app)',
  },
};

/**
 * Wikipedia記事の「受賞とノミネート」セクションをwikitext形式で取得
 *
 * @param title - Wikipedia記事タイトル（例: "第97回アカデミー賞"）
 * @returns 記事のwikitext、取得失敗時はnull
 */
export async function fetchWikipediaArticle(
  title: string,
): Promise<string | null> {
  try {
    // セクション一覧を取得して「受賞とノミネート」のセクション番号を特定
    const sectionIndex = await findAwardSectionIndex(title);

    if (sectionIndex !== null) {
      const sectionText = await fetchWikitextSection(title, sectionIndex);
      if (sectionText) return sectionText;
    }

    // フォールバック: セクション特定できなかった場合、記事全体のwikitextを取得
    return await fetchFullWikitext(title);
  } catch (error) {
    console.error(`Failed to fetch Wikipedia article "${title}":`, error);
    return null;
  }
}

/**
 * 「受賞とノミネート」に該当するセクション番号を検索
 */
async function findAwardSectionIndex(title: string): Promise<number | null> {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'sections',
    format: 'json',
  });

  const response = await fetch(
    `${WIKIPEDIA_API_BASE}?${params.toString()}`,
    WIKIPEDIA_FETCH_OPTIONS,
  );
  if (!response.ok) return null;

  const data = await response.json();
  if (data.error) return null;

  const sections = data.parse?.sections;
  if (!Array.isArray(sections)) return null;

  const awardSection = sections.find(
    (s: { line: string }) =>
      s.line.includes('受賞') || s.line.includes('ノミネート'),
  );

  return awardSection ? Number(awardSection.index) : null;
}

/**
 * 指定セクションのwikitextを取得
 */
async function fetchWikitextSection(
  title: string,
  sectionIndex: number,
): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    section: String(sectionIndex),
    format: 'json',
  });

  const response = await fetch(
    `${WIKIPEDIA_API_BASE}?${params.toString()}`,
    WIKIPEDIA_FETCH_OPTIONS,
  );
  if (!response.ok) return null;

  const data = await response.json();
  const wikitext = data.parse?.wikitext?.['*'];

  if (!wikitext || wikitext.length === 0) return null;
  return wikitext;
}

/**
 * 記事全体のwikitextを取得（フォールバック用）
 */
async function fetchFullWikitext(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    format: 'json',
  });

  const response = await fetch(
    `${WIKIPEDIA_API_BASE}?${params.toString()}`,
    WIKIPEDIA_FETCH_OPTIONS,
  );
  if (!response.ok) {
    console.error(`Wikipedia API error: ${response.status}`);
    return null;
  }

  const data = await response.json();

  if (data.error) {
    console.warn(`Wikipedia article not found: "${title}"`);
    return null;
  }

  const wikitext = data.parse?.wikitext?.['*'];

  if (!wikitext || wikitext.length === 0) {
    console.warn(`Wikipedia article has no content: "${title}"`);
    return null;
  }

  return wikitext;
}
