/**
 * 受賞作品同期サービス
 * CRONルートから分離したビジネスロジック
 *
 * 処理フロー:
 * 1. 当年・現在月に該当する賞を AWARD_DEFINITIONS から特定
 * 2. アカデミー賞: eiga.com から正規表現で抽出 → TMDb で映画情報解決
 *    その他の賞: Wikipedia + OpenAI で構造化 → TMDb で映画情報解決
 * 3. award_movies テーブルに UPSERT し、旧世代を削除する
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AWARD_DEFINITIONS,
  AWARD_MOVIES_CONFLICT_TARGET,
  AWARDS_EXCLUDED,
  AWARDS_MAX_RETRIES,
  AWARDS_YEAR_MATCH_TOLERANCE,
  type AwardName,
} from '@/constants/awards';
import type { OpenAiAwardItem } from '@/schema/awards';
import { fetchEigaOscarAwards } from '@/lib/eiga/fetchEigaOscarAwards';
import {
  buildWikipediaTitle,
  extractMovieTitlesFromWikitext,
  extractPersonNamesFromWikitext,
  fetchAwardsFromOpenAI,
  resolveAwardsWithTMDb,
  type OpenAiFetchOutcome,
} from '@/lib/openai/generateAwardMovies';
import {
  fetchWikipediaArticle,
  type SectionLookup,
} from '@/lib/wikipedia/fetchArticle';
import {
  fetchEigaGoldenGlobes,
  type EigaFetchOutcome,
} from '@/lib/eiga/fetchEigaGoldenGlobes';
import { fetchCannesFromWikitext } from '@/lib/wikipedia/parseCannesAwards';

import { deleteStaleAwardRows } from './deleteStaleAwardRows';

/**
 * スキップした賞と、その理由
 *
 * 賞名だけだと「なぜ入らなかったのか」が Vercel のログを見ないと分からない。
 * 原因の違う失敗を畳むと設定ミスを長期間見逃す（#916 / #918）
 */
export interface SkippedAward {
  award_name: string;
  /** 取得できなかった理由。書き込み失敗は `write_failed`、例外は `error` */
  reason: AwardFetchFailure['type'] | 'write_failed' | 'error';
  /** 記事名やエラーメッセージなど、理由を特定するための補足 */
  detail?: string;
}

/** 同期処理のサマリー */
export interface SyncAwardMoviesSummary {
  year: number;
  month: number | null;
  synced_awards: string[];
  skipped_awards: SkippedAward[];
  total_upserted: number;
  /**
   * 旧世代の削除に失敗した賞
   *
   * UPSERT は成功しておりデータは新しいので `synced_awards` にも入る。
   * 残留行が残っている可能性だけをここに残す。無人の cron では
   * `console.error` を誰も見ないため、レスポンスに出さないと気づけない
   */
  delete_failed_awards: string[];
}

/** Discriminated Union: CRON成功結果 */
interface CronSuccess {
  type: 'success';
  data: SyncAwardMoviesSummary;
}

/** Discriminated Union: CRONエラー結果 */
interface CronError {
  type: 'error';
  error: string;
}

/** CRONスキップ結果 */
interface CronSkipped {
  type: 'skipped';
  data: { year: number; month: number | null; reason: string };
}

export type SyncAwardMoviesCronResult = CronSuccess | CronError | CronSkipped;

/** CRON同期対象外の賞 */
const EXCLUDED_AWARDS: ReadonlySet<string> = new Set(AWARDS_EXCLUDED);

/**
 * 人名の表記ゆれを吸収する
 *
 * OpenAI の出力は非決定的で、半角中黒（U+FF65）や全角英数が混ざる。
 * NFKC で寄せてから突き合わせないと、実在する人名を捏造と誤判定して落とす
 */
function normalizePersonName(raw: string): string {
  return raw.normalize('NFKC').trim();
}

/** award_movies への UPSERT 用の1行 */
export interface AwardMovieRow {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  vote_count: number;
  genre_ids: number[] | null;
  award_name: string;
  award_year: number;
  category: string;
  is_winner: boolean;
  display_order: number;
  person_name: string | null;
  generated_at: string;
}

/** syncSingleAward / fetchAndResolveAward の入力 */
export interface SyncSingleAwardParams {
  awardName: AwardName;
  awardDef: (typeof AWARD_DEFINITIONS)[AwardName];
  year: number;
  generatedAt: string;
}

/**
 * 取得できなかった理由
 *
 * **1つに畳まない。** 原因が違えば対処も違う。記事名の誤り（`no_article`）は
 * 記事名を直す、一時障害（`article_unavailable`）は再実行する、記事の構成が
 * 変わった（`no_section`）はパーサを直す。畳むと設定ミスを長期間見逃す
 * （カンヌの記事名が実在せず同期が一度も成功していなかった #916）。
 */
export type AwardFetchFailure =
  /** Wikipedia に記事が存在しない。記事名の誤り・改名・未作成 */
  | { type: 'no_article'; wikipediaTitle: string }
  /** Wikipedia の取得に失敗した（HTTPエラー・ネットワーク断）。再実行で直りうる */
  | { type: 'article_unavailable'; wikipediaTitle: string }
  /** 記事はあるが「受賞」「ノミネート」のセクションが無く、抽出も0件だった */
  | { type: 'no_section'; wikipediaTitle: string }
  /** 取得元に到達できなかった（eiga.com のHTTPエラー、OpenAI の呼び出し失敗） */
  | { type: 'source_unavailable'; source: 'eiga' | 'openai' }
  /** ページ・記事は取れたが1件も抽出できなかった。構造が変わった可能性 */
  | { type: 'source_changed'; source: 'eiga' }
  /** OpenAI のAPIキーが未設定 */
  | { type: 'openai_not_configured' }
  /** 抽出はできたが、全件がハルシネーション検証で落ちた */
  | { type: 'all_hallucinated' }
  /** 取得元から0件（上記のどれにも当てはまらない） */
  | { type: 'no_items' }
  /** 抽出はできたが TMDb で1件も特定できなかった */
  | { type: 'no_tmdb_match' };

/**
 * 取得元の結果
 *
 * 0件のときに「なぜ0件なのか」を一緒に返す。`failure` が無い0件は
 * 「取得元には繋がったが該当が無かった」という意味になる
 */
interface AwardItemsResult {
  items: OpenAiAwardItem[];
  failure?: AwardFetchFailure;
}

/** 1賞ぶんの同期結果 */
export type SyncSingleAwardResult =
  | {
      type: 'synced';
      upsertedCount: number;
      /** 旧世代の削除に失敗したときだけ入る。成功扱いは変えない */
      deleteError?: string;
    }
  | AwardFetchFailure
  | { type: 'write_failed'; error: string };

/**
 * 同じユニークキー
 * （tmdb_movie_id × award_name × award_year × category × person_name）の行を除く
 *
 * `resolveAwardsWithTMDb` は重複を返しうる。cron の UPSERT なら onConflict が
 * 吸収するが、手動同期は一意制約違反が多行まとめて1文のロールバックに直結する
 * ため、両経路でこの除去を共有する。
 *
 * **人名までキーに含める。** 演技賞では同じ作品から複数人がノミネートされる
 * （第82回ゴールデングローブ賞 助演女優賞の『エミリア・ペレス』が2人）。
 * 人名を無視すると先に来た1人だけが残り、受賞者が後ろにいると受賞が消える
 */
export function dedupeAwardRows(rows: AwardMovieRow[]): AwardMovieRow[] {
  const seen = new Set<string>();

  return rows.filter((r) => {
    const key = `${r.tmdb_movie_id}:${r.award_name}:${r.award_year}:${r.category}:${r.person_name ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 1賞ぶんの受賞作品を取得し、UPSERT 用の行に整形する
 *
 * **書き込みは行わない。** cron と手動同期では書き込み後の後処理（ジョブの
 * 終端状態の記録など）が違うため、書き込み方法は呼び出し元に委ねる。
 * UPSERT → 旧世代削除という順序は両経路で同じ。
 *
 * 「取得0件」と「TMDb解決0件」を区別して返す。呼び出し元は取得0件のときに
 * 既存データへ一切触れないガードを掛けるため、潰してはいけない。
 */
export async function fetchAndResolveAward(
  params: SyncSingleAwardParams,
): Promise<
  | {
      type: 'rows';
      rows: AwardMovieRow[];
      /**
       * 旧世代を消してよい部門
       *
       * 今回行が取れた部門のうち、**取りこぼしが1件も無かったもの**だけ。
       * 取りこぼした部門を含めると、残っている既存行まで消してしまう
       */
      deletableCategories: string[];
    }
  | AwardFetchFailure
> {
  const { awardName, awardDef, year, generatedAt } = params;

  let fetched: AwardItemsResult;

  if (awardName === 'academy_awards') {
    // アカデミー賞: eiga.com から正規表現で抽出（ハルシネーションなし）
    const eiga = await fetchEigaOscarAwards(year);
    if (eiga.type === 'ok') {
      fetched = { items: eiga.items };
    } else {
      // eiga.com取得失敗時はWikipedia+OpenAIにフォールバック
      console.warn(
        `eiga.com returned 0 items for ${year}, falling back to Wikipedia+OpenAI`,
      );
      fetched = await fetchAwardItemsViaWikipedia(awardName, awardDef, year);
    }
  } else if (awardName === 'golden_globes') {
    // ゴールデングローブ賞: eiga.com から正規表現で抽出（OpenAIを使わない）
    fetched = toEigaResult(await fetchEigaGoldenGlobes(year));
  } else if (awardName === 'cannes') {
    // カンヌ: wikitext を直接パースする（OpenAIを使わない）。
    // eiga.com のカンヌは作品リンクが3割欠落し2012〜2016が旧レイアウトのため使わない
    fetched = await fetchAwardItemsFromWikitext(awardName, awardDef, year);
  } else {
    // その他の賞: Wikipedia + OpenAI で構造化
    fetched = await fetchAwardItemsViaWikipedia(awardName, awardDef, year);
  }

  const allAiItems = fetched.items;

  if (allAiItems.length === 0) {
    // 取得元が理由を持っていればそれを返す。無ければ単に0件
    return fetched.failure ?? { type: 'no_items' };
  }

  // 取りこぼしが出た部門を受け取る。旧世代削除の対象から外すために使う
  const unresolvedCategories = new Set<string>();
  const resolved = await resolveAwardsWithTMDb(
    allAiItems,
    awardDef,
    unresolvedCategories,
  );

  if (resolved.length === 0) {
    console.warn(`No TMDb results for ${awardName} ${year}`);
    return { type: 'no_tmdb_match' };
  }

  // 部門ラベルは AWARD_DEFINITIONS（アプリ定数）を単一ソースとし DB には保存しない
  // （読み取り側の /api/awards も AWARD_DEFINITIONS からラベルを取得している）。
  const rows: AwardMovieRow[] = resolved.map((r) => ({
    tmdb_movie_id: r.tmdb_movie_id,
    title: r.title,
    poster_path: r.poster_path,
    release_date: r.release_date,
    vote_average: r.vote_average,
    vote_count: r.vote_count,
    genre_ids: r.genre_ids,
    award_name: awardName,
    award_year: year,
    category: r.category,
    is_winner: r.is_winner,
    display_order: r.display_order,
    person_name: r.person_name ?? null,
    generated_at: generatedAt,
  }));

  const deduped = dedupeAwardRows(rows);

  /**
   * 旧世代を消してよい部門
   *
   * 今回行が取れた部門から、取りこぼしが出た部門を引く。
   *
   * - **部門がまるごと欠けた場合**: そもそもこの集合に入らない
   *   （`fetchEigaOscarAwards` は取得に失敗したページを飛ばして残りを返す）
   * - **部門内で件数だけ減った場合**: `unresolvedCategories` で除外する。
   *   TMDb のリトライ対象は 429/503/504 のみで、ECONNRESET や 500 は
   *   作品ごとの catch で握られその作品だけ落ちる。ここを除外しないと、
   *   10件あるはずが2件しか解決できなかったときに残り8件を消してしまう
   *   （アカデミー賞の cron は年1回なので次の自動実行は1年後）
   */
  const deletableCategories = [
    ...new Set(deduped.map((r) => r.category)),
  ].filter((category) => !unresolvedCategories.has(category));

  return { type: 'rows', rows: deduped, deletableCategories };
}

/**
 * 1賞ぶんを取得して UPSERT し、旧世代を消す（cron 用）
 *
 * 例外は**握り潰さずに投げる**。cron 側のループが従来どおり catch して
 * 「エラーでも他の賞は続行」を維持する。ここで握り潰すと、手動同期側が
 * 失敗理由を error_message に書けなくなる。
 */
export async function syncSingleAward(
  supabase: SupabaseClient,
  params: SyncSingleAwardParams,
): Promise<SyncSingleAwardResult> {
  const resolved = await fetchAndResolveAward(params);

  if (resolved.type !== 'rows') {
    return resolved;
  }

  const { error } = await supabase.from('award_movies').upsert(resolved.rows, {
    onConflict: AWARD_MOVIES_CONFLICT_TARGET,
  });

  // UPSERT が失敗したらここで終わる。DELETE へ進むと既存データを失う
  if (error) {
    console.error(`Failed to upsert ${params.awardName}:`, error);
    return { type: 'write_failed', error: error.message };
  }

  const deleteError = await deleteStaleAwardRows(supabase, {
    awardName: params.awardName,
    year: params.year,
    generatedAt: params.generatedAt,
    categories: resolved.deletableCategories,
  });

  if (deleteError) {
    // UPSERT は成功しているのでデータは新しい。残留が消えなかっただけなので
    // 成功扱いにする。ただし結果には残す（アカデミー賞の cron は年1回なので、
    // 「次回の同期で消える」は1年後を意味する）
    console.error(
      `[syncSingleAward] 旧世代の削除に失敗しました award=${params.awardName} year=${params.year}`,
      deleteError,
    );
    return {
      type: 'synced',
      upsertedCount: resolved.rows.length,
      deleteError: deleteError.message,
    };
  }

  return { type: 'synced', upsertedCount: resolved.rows.length };
}

/** スキップ結果を理由付きのサマリー項目へ変換する */
function toSkippedAward(
  awardName: string,
  result: Exclude<SyncSingleAwardResult, { type: 'synced' }>,
): SkippedAward {
  if (result.type === 'write_failed') {
    return {
      award_name: awardName,
      reason: 'write_failed',
      detail: result.error,
    };
  }

  if (
    result.type === 'no_article' ||
    result.type === 'article_unavailable' ||
    result.type === 'no_section'
  ) {
    return {
      award_name: awardName,
      reason: result.type,
      detail: result.wikipediaTitle,
    };
  }

  return { award_name: awardName, reason: result.type };
}

/**
 * 現在月に該当する賞を取得
 */
export function getAwardsForMonth(
  month: number,
): [AwardName, (typeof AWARD_DEFINITIONS)[AwardName]][] {
  return (
    Object.entries(AWARD_DEFINITIONS) as [
      AwardName,
      (typeof AWARD_DEFINITIONS)[AwardName],
    ][]
  ).filter(([name, def]) => def.month === month && !EXCLUDED_AWARDS.has(name));
}

/**
 * 受賞作品同期CRONのメイン処理
 *
 * API呼び出し回数の目安:
 * - 1月: ゴールデングローブ賞 9部門（OpenAI最大27回）
 * - 3月: アカデミー賞（eiga.com 5ページ）
 * - 5月: カンヌ映画祭 8部門（OpenAI最大24回）
 * - targetYear指定時: アカデミー賞のみ（eiga.com 5ページ）
 * maxDuration=300秒の範囲内で処理完了する想定
 */
export async function executeSyncAwardMoviesCron(
  supabase: SupabaseClient,
  targetYear?: number,
): Promise<SyncAwardMoviesCronResult> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const generatedAt = now.toISOString();

  // targetYear指定時はアカデミー賞のみ同期、未指定時は現在月に該当する賞のみ
  const isManualSync = targetYear !== undefined;
  const syncYear = targetYear ?? currentYear;
  const targetAwards: [AwardName, (typeof AWARD_DEFINITIONS)[AwardName]][] =
    isManualSync
      ? [['academy_awards', AWARD_DEFINITIONS.academy_awards]]
      : getAwardsForMonth(currentMonth);

  if (targetAwards.length === 0) {
    return {
      type: 'skipped',
      data: {
        year: syncYear,
        month: isManualSync ? null : currentMonth,
        reason: isManualSync
          ? '同期対象の賞がありません'
          : `${currentMonth}月に該当する賞はありません`,
      },
    };
  }

  const syncedAwards: string[] = [];
  const skippedAwards: SkippedAward[] = [];
  const deleteFailedAwards: string[] = [];
  let totalUpserted = 0;

  for (const [awardName, awardDef] of targetAwards) {
    try {
      const result = await syncSingleAward(supabase, {
        awardName,
        awardDef,
        year: syncYear,
        generatedAt,
      });

      if (result.type === 'synced') {
        totalUpserted += result.upsertedCount;
        syncedAwards.push(awardName);
        // データは新しいので synced のまま。残留が残った事実だけを別に残す
        if (result.deleteError) deleteFailedAwards.push(awardName);
        continue;
      }

      // 理由ごと残す。無人の cron ではここが唯一の手がかりになる
      skippedAwards.push(toSkippedAward(awardName, result));
    } catch (error) {
      console.error(`Error processing ${awardName}:`, error);
      skippedAwards.push({
        award_name: awardName,
        reason: 'error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    type: 'success',
    data: {
      year: syncYear,
      month: isManualSync ? null : currentMonth,
      synced_awards: syncedAwards,
      skipped_awards: skippedAwards,
      delete_failed_awards: deleteFailedAwards,
      total_upserted: totalUpserted,
    },
  };
}

/**
 * 賞ごとの wikitext パーサ
 *
 * 現在はカンヌのみ。ゴールデングローブ賞は eiga.com のほうが精度が高く
 * （Wikipedia は記事自体にノミネートの欠落と誤リンクがある）、
 * 逆にカンヌは eiga.com だと作品リンクが3割欠落するため分かれている。
 */
const WIKITEXT_PARSERS: Readonly<
  Record<string, (wikitext: string, ceremonyYear: number) => OpenAiAwardItem[]>
> = {
  cannes: fetchCannesFromWikitext,
};

/**
 * 受賞作品データを wikitext から取得する
 *
 * **OpenAI を使わない。** 記事を直接読むため決定的で、同じ年を同期し直しても
 * 件数が変わらない。人名も取れる。
 *
 * 取得0件でも OpenAI 経路にフォールバックしない。記事の書式が変わったときに
 * 静かに非決定的な経路へ戻るより、0件として表に出したい（取得0件のときは
 * 呼び出し元が既存データに触らない）。
 */
async function fetchAwardItemsFromWikitext(
  awardName: string,
  awardDef: (typeof AWARD_DEFINITIONS)[AwardName],
  ceremonyYear: number,
): Promise<AwardItemsResult> {
  const parse = WIKITEXT_PARSERS[awardName];
  if (!parse) {
    console.warn(`No wikitext parser for ${awardName}`);
    return { items: [] };
  }

  const wikipediaTitle = buildWikipediaTitle(ceremonyYear, awardDef);
  const article = await fetchWikipediaArticle(wikipediaTitle);

  if (article.type !== 'ok') {
    return { items: [], failure: toArticleFailure(article, wikipediaTitle) };
  }

  const items = parse(article.wikitext, ceremonyYear);

  if (items.length === 0) {
    console.warn(
      `No entries parsed from "${wikipediaTitle}". 記事の書式が変わった可能性がある`,
    );
    return { items, failure: toEmptyFailure(article, wikipediaTitle) };
  }

  return { items };
}

/** eiga.com の結果を取得結果へ移す */
function toEigaResult(outcome: EigaFetchOutcome): AwardItemsResult {
  if (outcome.type === 'ok') return { items: outcome.items };

  return {
    items: [],
    failure:
      outcome.type === 'unavailable'
        ? { type: 'source_unavailable', source: 'eiga' }
        : { type: 'source_changed', source: 'eiga' },
  };
}

/**
 * 記事は取れたが抽出0件だったときの理由を決める
 *
 * `no_section` を名乗れるのは、セクション一覧を**読めたうえで**該当が
 * 無かった（`absent`）ときだけ。一覧自体を読めなかった（`unknown`）ときに
 * 「記事の構成が変わった」と出すと、実際には変わっていないパーサの調査へ
 * admin を誘導してしまう
 */
function toEmptyFailure(
  article: { sectionLookup: SectionLookup },
  wikipediaTitle: string,
): AwardFetchFailure {
  return article.sectionLookup === 'absent'
    ? { type: 'no_section', wikipediaTitle }
    : { type: 'no_items' };
}

/** 記事取得の失敗を同期側の理由へ移す */
function toArticleFailure(
  article: { type: 'not_found' | 'fetch_failed' },
  wikipediaTitle: string,
): AwardFetchFailure {
  // 「記事が無い」のログは fetchWikipediaArticle が既に出している。
  // ここでは取得失敗だけを、賞ではなく記事名で記録する
  if (article.type === 'not_found') {
    return { type: 'no_article', wikipediaTitle };
  }

  console.warn(`Wikipedia article unavailable: "${wikipediaTitle}"`);
  return { type: 'article_unavailable', wikipediaTitle };
}

/**
 * Wikipedia + OpenAI で受賞作品データを取得
 *
 * 現時点でこの経路を通る賞は無い（アカデミー賞は eiga.com、ゴールデン
 * グローブ賞とカンヌは wikitext パーサを持つ）。アカデミー賞が eiga.com の
 * 取得に失敗したときのフォールバックとしてのみ使う。
 */
async function fetchAwardItemsViaWikipedia(
  awardName: string,
  awardDef: (typeof AWARD_DEFINITIONS)[AwardName],
  currentYear: number,
): Promise<AwardItemsResult> {
  const allAiItems: OpenAiAwardItem[] = [];
  const maxRetries = AWARDS_MAX_RETRIES;

  const wikipediaTitle = buildWikipediaTitle(currentYear, awardDef);
  const article = await fetchWikipediaArticle(wikipediaTitle);

  if (article.type !== 'ok') {
    return { items: [], failure: toArticleFailure(article, wikipediaTitle) };
  }

  const articleText = article.wikitext;
  const validTitles = extractMovieTitlesFromWikitext(articleText);
  // 人名は表記が揺れるため正規化した集合で持つ（半角中黒・全角英数など）
  const validPersonNames = new Set(
    [...extractPersonNamesFromWikitext(articleText)].map(normalizePersonName),
  );

  // 全部門ぶんを畳んだ理由。0件で終わったときだけ使う
  let notConfigured = false;
  let openAiUnavailable = false;
  let extractedButAllDropped = false;

  for (const category of awardDef.categories) {
    let outcome: OpenAiFetchOutcome = { type: 'unavailable' };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      outcome = await fetchAwardsFromOpenAI(
        currentYear,
        awardDef.label,
        category,
        articleText,
      );
      // APIキー未設定はリトライしても変わらない
      if (outcome.type === 'not_configured') break;
      if (outcome.type === 'ok' && outcome.items.length > 0) break;
      console.warn(
        `No AI results for ${awardName}/${category.key} ${currentYear} (attempt ${attempt}/${maxRetries})`,
      );
    }

    if (outcome.type === 'not_configured') {
      notConfigured = true;
      break;
    }
    if (outcome.type === 'unavailable') openAiUnavailable = true;

    const categoryItems = outcome.type === 'ok' ? outcome.items : [];

    if (categoryItems.length > 0) {
      const verified = categoryItems
        .filter((item) => {
          if (validTitles.has(item.title_ja)) return true;
          console.warn(
            `Hallucination detected: "${item.title_ja}" not found in wikitext, skipping`,
          );
          return false;
        })
        // 人名も wikitext と突き合わせる。この経路だけが捏造しうる
        // （eiga.com / wikitext パーサは正規表現なので捏造の余地が無い）。
        // 作品自体は残し、裏が取れない氏名だけを落とす
        .map((item) => {
          const personName = item.person_name?.trim();
          if (!personName) return item;
          if (validPersonNames.has(normalizePersonName(personName)))
            return item;

          console.warn(
            `Hallucination detected: person "${personName}" not found in wikitext, dropping the name`,
          );
          return { ...item, person_name: undefined };
        });
      const corrected = verified.map((item) => {
        if (Math.abs(item.year - currentYear) > AWARDS_YEAR_MATCH_TOLERANCE) {
          console.warn(
            `Year corrected: "${item.title_ja}" year=${item.year} → ${currentYear - 1}`,
          );
          return { ...item, year: currentYear - 1 };
        }
        return item;
      });
      // 抽出はできたのに検証で全部落ちた＝捏造しか返っていない
      if (corrected.length === 0) extractedButAllDropped = true;
      allAiItems.push(...corrected);
    }
  }

  if (allAiItems.length === 0) {
    return {
      items: allAiItems,
      failure: toOpenAiFailure(
        { notConfigured, openAiUnavailable, extractedButAllDropped },
        article,
        wikipediaTitle,
      ),
    };
  }

  return { items: allAiItems };
}

/**
 * OpenAI 経路で0件に終わったときの理由を決める
 *
 * 設定の問題・API の不調・捏造だけが返った、を切り分ける。
 * どれでもなければ記事側の理由（セクションが無い等）に落とす
 */
function toOpenAiFailure(
  flags: {
    notConfigured: boolean;
    openAiUnavailable: boolean;
    extractedButAllDropped: boolean;
  },
  article: { sectionLookup: SectionLookup },
  wikipediaTitle: string,
): AwardFetchFailure {
  if (flags.notConfigured) return { type: 'openai_not_configured' };
  if (flags.extractedButAllDropped) return { type: 'all_hallucinated' };
  if (flags.openAiUnavailable) {
    return { type: 'source_unavailable', source: 'openai' };
  }
  return toEmptyFailure(article, wikipediaTitle);
}
