/**
 * Wikipedia API から記事のwikitextを取得する
 *
 * wikitext形式を使用する理由:
 * - explaintext（プレーンテキスト）ではテーブルが除去され、ノミネートリストが失われる
 * - wikitextにはテーブル構造と太字（受賞者）マークアップが保持される
 */

import { getRequiredEnv } from '@/utils/env';

const WIKIPEDIA_FETCH_OPTIONS: RequestInit = {
  headers: {
    'User-Agent': 'MovieApp/1.0 (https://github.com/Fn-front/movie-app)',
  },
};

/**
 * 記事取得の結果
 *
 * **失敗を1つに畳まない。** 記事名の誤り（`not_found`）と一時的な障害
 * （`fetch_failed`）は対処が違う。前者は記事名を直す、後者は再実行する。
 * `null` を返していたときは画面に「取得できませんでした」としか出せず、
 * カンヌの記事名が実在しないまま長期間気づけなかった（#916）。
 */
export type WikipediaArticleResult =
  | {
      type: 'ok';
      wikitext: string;
      /**
       * 「受賞」「ノミネート」を含むセクションが見つかったか
       *
       * false のときは記事全体にフォールバックしている。抽出が0件だった場合、
       * 呼び出し元は「記事の構成が変わった」と判断できる
       */
      sectionFound: boolean;
    }
  | { type: 'not_found' }
  | { type: 'fetch_failed' };

/**
 * Wikipedia記事の「受賞とノミネート」セクションをwikitext形式で取得
 *
 * @param title - Wikipedia記事タイトル（例: "第97回アカデミー賞"）
 */
export async function fetchWikipediaArticle(
  title: string,
): Promise<WikipediaArticleResult> {
  try {
    // セクション一覧を取得して「受賞とノミネート」のセクション番号を特定
    const sectionIndex = await findAwardSectionIndex(title);

    if (sectionIndex !== null) {
      const sectionText = await fetchWikitextSection(title, sectionIndex);
      if (sectionText) {
        return { type: 'ok', wikitext: sectionText, sectionFound: true };
      }
    }

    // フォールバック: セクション特定できなかった場合、記事全体のwikitextを取得
    return await fetchFullWikitext(title, sectionIndex !== null);
  } catch (error) {
    console.error(`Failed to fetch Wikipedia article "${title}":`, error);
    return { type: 'fetch_failed' };
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
    `${getRequiredEnv('WIKIPEDIA_API_BASE_URL')}?${params.toString()}`,
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
    `${getRequiredEnv('WIKIPEDIA_API_BASE_URL')}?${params.toString()}`,
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
async function fetchFullWikitext(
  title: string,
  sectionFound: boolean,
): Promise<WikipediaArticleResult> {
  const params = new URLSearchParams({
    action: 'parse',
    page: title,
    prop: 'wikitext',
    format: 'json',
  });

  const response = await fetch(
    `${getRequiredEnv('WIKIPEDIA_API_BASE_URL')}?${params.toString()}`,
    WIKIPEDIA_FETCH_OPTIONS,
  );
  if (!response.ok) {
    // HTTP エラーは一時的なことが多い。記事名の誤りと混ぜない
    console.error(`Wikipedia API error: ${response.status}`);
    return { type: 'fetch_failed' };
  }

  const data = await response.json();

  if (data.error) {
    console.warn(`Wikipedia article not found: "${title}"`);
    return { type: 'not_found' };
  }

  const wikitext = data.parse?.wikitext?.['*'];

  if (!wikitext || wikitext.length === 0) {
    console.warn(`Wikipedia article has no content: "${title}"`);
    return { type: 'not_found' };
  }

  return { type: 'ok', wikitext, sectionFound };
}
