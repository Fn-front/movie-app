/**
 * eiga.com ゴールデングローブ賞データ取得
 *
 * 以前は Wikipedia の wikitext を読んでいたが、eiga.com のほうが精度が高い。
 *
 * - 日本語Wikipediaは**記事そのものが欠けている**ことがある。第82回の主演女優賞
 *   （ドラマ部門）はニコール・キッドマン『ベイビーガール』が未記載で5件しか無い
 * - **誤リンクをそのまま引き継いでしまう。** 同じ部門のアンジェリーナ・ジョリーは
 *   2024年の『マリア』ではなく2017年のドキュメンタリー『私は、マリア・カラス』に
 *   リンクされている
 * - **記事の書式が年で変わる**（`{{Award category}}` と表ヘッダ）。eiga.com は
 *   10年前の第72回でも同一レイアウト
 */

import axios from 'axios';

import { EIGA_FETCH_TIMEOUT_MS } from '@/constants';
import type { OpenAiAwardItem } from '@/schema/awards';
import { getRequiredEnv } from '@/utils/env';

/**
 * eiga.com からの取得結果
 *
 * **「取得できなかった」と「取得できたが0件」を分ける。** 前者はサイトの一時障害や
 * URLの誤りで、再実行・設定確認が要る。後者はページ構造の変更で、パーサの修正が要る。
 * どちらも0件として畳むと、原因の違いが画面から判別できない（#918 / #956）。
 */
export type EigaFetchOutcome =
  | { type: 'ok'; items: OpenAiAwardItem[] }
  /** ページを取得できなかった（HTTPエラー・タイムアウト） */
  | { type: 'unavailable' }
  /** ページは取得できたが1件も抽出できなかった */
  | { type: 'empty' };

import { cleanHtmlText } from './htmlText';

/** eiga.com の賞ページにおけるゴールデングローブ賞のスラッグ */
const GOLDEN_GLOBE_SLUG = 'golden-globe';

/** 部門見出し。`<strong>` に日本語名、`<span>` に英語名が入る */
const CATEGORY_HEADING = /<h2>\s*<strong>([\s\S]*?)<\/strong>[\s\S]*?<\/h2>/g;

/** 表の1行。`class="prize"` が付いていれば受賞 */
const TABLE_ROW = /<tr(\s+class="prize")?\s*>([\s\S]*?)<\/tr>/g;

/** 行内のセル */
const TH_CELL = /<th[^>]*>([\s\S]*?)<\/th>/;
const TD_CELL = /<td[^>]*>([\s\S]*?)<\/td>/;

/** セル内の作品リンク・人物リンク */
const MOVIE_LINK = /<a[^>]+href="\/movie\/\d+\/"[^>]*>([\s\S]*?)<\/a>/;
const PERSON_LINK = /<a[^>]+href="\/person\/\d+\/"[^>]*>([\s\S]*?)<\/a>/;

/** 括弧とその中身（部門名の「（ドラマ）」等） */
const PARENTHETICAL = /[（(]([^）)]*)[）)]/;

/**
 * 括弧を除いた部門名 → 部門キー
 *
 * ドラマ / ミュージカル・コメディで分かれる部門は、括弧の中身で枝分かれする。
 * `null` は「括弧で分かれない部門」を表す。
 */
const CATEGORY_BY_BASE_NAME: Readonly<
  Record<string, { drama?: string; musicalComedy?: string; single?: string }>
> = {
  作品賞: { drama: 'best_drama', musicalComedy: 'best_musical_comedy' },
  主演男優賞: {
    drama: 'best_actor_drama',
    musicalComedy: 'best_actor_musical_comedy',
  },
  主演女優賞: {
    drama: 'best_actress_drama',
    musicalComedy: 'best_actress_musical_comedy',
  },
  助演男優賞: { single: 'best_supporting_actor' },
  助演女優賞: { single: 'best_supporting_actress' },
  監督賞: { single: 'best_director' },
};

/** 抽出された1件 */
export interface ExtractedGoldenGlobeEntry {
  categoryKey: string;
  title: string;
  isWinner: boolean;
  personName?: string;
}

/**
 * 部門見出しから部門キーを解決する
 *
 * ⚠️ **部門名の完全一致では引けない。** 括弧内の語順が年で入れ替わる。
 *      2025年: `最優秀作品賞（ミュージカル／コメディ）`
 *      2015年: `最優秀作品賞（コメディ／ミュージカル）`
 *    英語名（`Musical Or Comedy` ↔ `Comedy Or Musical`）も同様に入れ替わるため、
 *    括弧の中身に含まれる語で判定する。
 *
 * 「最優秀」の接頭辞も年によって付かない可能性があるため落としてから引く。
 */
export function resolveGoldenGlobeCategoryKey(heading: string): string | null {
  const label = cleanHtmlText(heading).replace(/\s+/g, '');
  const parenthetical = label.match(PARENTHETICAL)?.[1] ?? '';
  const baseName = label
    .replace(PARENTHETICAL, '')
    .replace(/^最優秀/, '')
    .trim();

  const mapping = CATEGORY_BY_BASE_NAME[baseName];
  if (!mapping) return null;

  if (mapping.single) return mapping.single;

  if (parenthetical.includes('ドラマ')) return mapping.drama ?? null;
  if (
    parenthetical.includes('ミュージカル') ||
    parenthetical.includes('コメディ')
  ) {
    return mapping.musicalComedy ?? null;
  }

  return null;
}

/**
 * 1行から作品名と人名を取り出す
 *
 * セルの使い方が部門で入れ替わる。
 *   作品賞系: `th` が作品、`td` は空
 *   演技賞・監督賞: `th` が人名、`td` が作品
 *
 * `td` に作品リンクがあればそれを作品とし、無ければ `th` を作品とみなす。
 * リンクが無い行（主題歌賞の曲名など）はタグを除いたテキストに倒す。
 */
export function parseGoldenGlobeRow(
  rowHtml: string,
): { title: string; personName?: string } | null {
  const thHtml = rowHtml.match(TH_CELL)?.[1] ?? '';
  const tdHtml = rowHtml.match(TD_CELL)?.[1] ?? '';

  const tdMovie = tdHtml.match(MOVIE_LINK)?.[1];
  const thMovie = thHtml.match(MOVIE_LINK)?.[1];
  const thPerson = thHtml.match(PERSON_LINK)?.[1];

  const rawTitle = tdMovie ?? thMovie ?? thHtml;
  const title = cleanHtmlText(rawTitle).replace(/\s+/g, ' ').trim();
  if (!title) return null;

  // td を作品に使った場合のみ th は人名。作品賞系は th が作品なので人名は無い
  const personSource = tdMovie ? (thPerson ?? thHtml) : undefined;
  const personName = personSource
    ? cleanHtmlText(personSource).replace(/\s+/g, ' ').trim()
    : undefined;

  return { title, ...(personName ? { personName } : {}) };
}

/**
 * ゴールデングローブ賞ページのHTMLから受賞・ノミネートを抽出する
 *
 * @param html - `https://<base>/golden-globe/<year>/` のHTML
 */
export function extractGoldenGlobeEntries(
  html: string,
): ExtractedGoldenGlobeEntry[] {
  const results: ExtractedGoldenGlobeEntry[] = [];
  const headings = [...html.matchAll(CATEGORY_HEADING)];

  headings.forEach((heading, index) => {
    const categoryKey = resolveGoldenGlobeCategoryKey(heading[1]);
    if (!categoryKey) return;

    const sectionStart = heading.index! + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? html.length;
    const section = html.slice(sectionStart, sectionEnd);

    for (const row of section.matchAll(TABLE_ROW)) {
      const parsed = parseGoldenGlobeRow(row[2]);
      if (!parsed) continue;

      results.push({
        categoryKey,
        title: parsed.title,
        isWinner: row[1] !== undefined,
        ...(parsed.personName ? { personName: parsed.personName } : {}),
      });
    }
  });

  return results;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    responseType: 'text',
    timeout: EIGA_FETCH_TIMEOUT_MS,
  });
  return response.data;
}

/**
 * eiga.com からゴールデングローブ賞の受賞・ノミネートを取得する
 *
 * `title_en` は邦題と同じ値を入れる。eiga.com は英題を持たないため。
 * TMDb 解決は邦題で当たるので実害は無い（`fetchEigaOscarAwards` と同じ扱い）。
 *
 * ⚠️ `tr.prize` は100%付くわけではない。第72回（2015年）の主演女優賞
 *    （コメディ／ミュージカル）は実際の受賞者がいるのにクラスが無かった。
 *    受賞0件の部門があっても取得失敗にはせず、件数を警告に出すだけにする。
 *    ノミネートとしては取り込めており、受賞バッジが付かないだけのため。
 *
 * @param ceremonyYear - 授賞式の年（2025 → 第82回）
 */
export async function fetchEigaGoldenGlobes(
  ceremonyYear: number,
): Promise<EigaFetchOutcome> {
  const baseUrl = getRequiredEnv('EIGA_AWARD_BASE_URL');
  const url = `${baseUrl}/${GOLDEN_GLOBE_SLUG}/${ceremonyYear}/`;

  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (error) {
    console.warn(`Failed to fetch ${url}:`, error);
    return { type: 'unavailable' };
  }

  const entries = extractGoldenGlobeEntries(html);
  warnCategoriesWithoutWinner(entries, ceremonyYear);

  if (entries.length === 0) {
    console.warn(
      `No entries extracted for golden globes ${ceremonyYear}. ページ構造が変わった可能性がある`,
    );
    return { type: 'empty' };
  }

  const items = entries.map((entry) => ({
    title_ja: entry.title,
    title_en: entry.title,
    category: entry.categoryKey,
    is_winner: entry.isWinner,
    // 授賞式の前年に公開された作品が対象。実際の公開年とのずれは
    // findBestMatch が当年・翌年の窓で吸収する
    year: ceremonyYear - 1,
    ...(entry.personName ? { person_name: entry.personName } : {}),
  }));

  return { type: 'ok', items };
}

/** 受賞が1件も取れなかった部門を警告に出す */
function warnCategoriesWithoutWinner(
  entries: ExtractedGoldenGlobeEntry[],
  ceremonyYear: number,
): void {
  const withWinner = new Set(
    entries.filter((e) => e.isWinner).map((e) => e.categoryKey),
  );
  const missing = [...new Set(entries.map((e) => e.categoryKey))].filter(
    (key) => !withWinner.has(key),
  );

  if (missing.length > 0) {
    console.warn(
      `No winner marked for golden_globes ${ceremonyYear}: ${missing.join(', ')}`,
    );
  }
}
