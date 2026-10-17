/**
 * OpenAI APIを使用したレコメンド生成ロジック
 */

import {
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_YEAR_MATCH_TOLERANCE,
  OPENAI_CONFIG,
  TMDB_GENRE_MAP,
} from '@/constants';
import { hasExcludedKeyword, searchMovies } from '@/lib/tmdb/tmdb';
import type { Movie } from '@/lib/types';
import {
  openAiRecommendationsResponseSchema,
  type OpenAiRecommendationItem,
} from '@/schema/recommendations';

import { createOpenAIClient, getOpenAIModel } from './client';

/** お気に入り映画の情報 */
export interface FavoriteMovie {
  title: string;
  rating: number | null;
}

/** 除外対象の映画情報 */
export interface ExcludedMovie {
  tmdb_movie_id: number;
  title: string;
}

/** 興味なし映画の情報 */
export interface DismissedMovie {
  tmdb_movie_id: number;
  title: string;
  genre_ids: number[] | null;
}

/** TMDb検索結果から取得したレコメンド映画情報 */
export interface ResolvedRecommendation {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  vote_count: number;
  genre_ids: number[] | null;
  reason: string;
  display_order: number;
}

/**
 * システムプロンプトを生成する
 * @param count - 推薦する映画の件数
 */
function buildSystemPrompt(count: number): string {
  return `あなたは映画レコメンドAIです。
ユーザーのお気に入り映画と評価（1〜10点）を分析し、そのユーザーが好みそうな映画を${count}件推薦してください。

ルール:
- お気に入り・鑑賞予定・興味なしの各リストに載っている映画は推薦しないこと。ただし同名の別作品（リメイク・シリーズの別エピソード）は別の映画として扱ってよい
- アダルト作品（成人向け・ポルノ・ピンク映画等）は絶対に推薦しないこと
- 実在する映画のみ推薦すること
- ジャンル、監督、テーマ、雰囲気などの傾向を分析して推薦すること
- 評価が高い映画の傾向をより重視すること
- 「興味なし」リストがある場合、それらの映画のジャンルやテーマの傾向を避けること
- 推薦理由は日本語で1〜2文で簡潔に書くこと

タイトルの返し方:
- title_ja には日本公開時の邦題を、title_en には原題を入れること
- 邦題が存在しない作品は title_ja にも原題を入れること
- yearは映画の公開年。記憶が曖昧な場合も必ず最も確からしい年を1つ返すこと

レスポンスは以下のJSON形式で返してください:
{
  "recommendations": [
    {
      "title_ja": "邦題",
      "title_en": "原題",
      "year": 2024,
      "reason": "推薦理由"
    }
  ]
}`;
}

/**
 * お気に入り映画リストからユーザープロンプトを組み立てる
 */
export function buildUserPrompt(
  favorites: FavoriteMovie[],
  watchlistTitles: string[],
  dismissedMovies: DismissedMovie[] = [],
): string {
  const favoriteLines = favorites
    .map((f) => {
      const rating = f.rating !== null ? ` - 評価: ${f.rating}/10` : '';
      return `- ${f.title}${rating}`;
    })
    .join('\n');

  let prompt = `## お気に入り映画\n${favoriteLines}`;

  if (dismissedMovies.length > 0) {
    const dismissedLines = dismissedMovies
      .map((d) => {
        const genreNames = (d.genre_ids || [])
          .map((id) => TMDB_GENRE_MAP[id])
          .filter(Boolean);
        const genreSuffix =
          genreNames.length > 0 ? `（${genreNames.join('、')}）` : '';
        return `- ${d.title}${genreSuffix}`;
      })
      .join('\n');
    prompt += `\n\n## 興味なしリスト（これらの映画やその傾向は避けてください）\n${dismissedLines}`;
  }

  if (watchlistTitles.length > 0) {
    const watchlistLines = watchlistTitles.map((t) => `- ${t}`).join('\n');
    // お気に入り・興味なしは専用セクションで既に渡しているため、ここでは
    // どこにも載っていないウォッチリストだけを追加する。
    // 以前は3つを連結した「除外リスト」を渡しており、同じタイトルが
    // プロンプトに二重に並んで指示追従性を落としていた。
    prompt += `\n\n## 鑑賞予定リスト（これらも推薦しないでください）\n${watchlistLines}`;
  }

  return prompt;
}

/**
 * OpenAI APIを呼び出してレコメンドを生成
 *
 * @param favorites - お気に入り映画リスト
 * @param watchlistTitles - ウォッチリストの映画タイトル（プロンプトでの重複回避用）
 * @param count - 推薦する件数（デフォルト: RECOMMENDATIONS_MAX_COUNT）
 * @param dismissedMovies - 興味なし映画リスト（傾向分析用）
 * @param signal - 中断シグナル。クライアント離脱時にOpenAI呼び出しを打ち切る
 * @returns パース済みのレコメンド項目配列、失敗時はnull
 */
export async function fetchRecommendationsFromOpenAI(
  favorites: FavoriteMovie[],
  watchlistTitles: string[],
  count: number = RECOMMENDATIONS_MAX_COUNT,
  dismissedMovies: DismissedMovie[] = [],
  signal?: AbortSignal,
): Promise<OpenAiRecommendationItem[] | null> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return null;
  }

  const userPrompt = buildUserPrompt(
    favorites,
    watchlistTitles,
    dismissedMovies,
  );

  try {
    const response = await client.responses.create(
      {
        model: getOpenAIModel(),
        instructions: buildSystemPrompt(count),
        input: userPrompt,
        text: {
          format: {
            type: 'json_schema',
            name: 'recommendations_response',
            schema: {
              type: 'object',
              properties: {
                recommendations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title_ja: { type: 'string' },
                      title_en: { type: 'string' },
                      year: { type: 'number' },
                      reason: { type: 'string' },
                    },
                    required: ['title_ja', 'title_en', 'year', 'reason'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['recommendations'],
              additionalProperties: false,
            },
            strict: true,
          },
        },
        temperature: OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE,
      },
      { signal },
    );

    const textOutput = response.output.find((o) => o.type === 'message');
    if (!textOutput || textOutput.type !== 'message') {
      console.error('OpenAI returned no message output');
      return null;
    }

    const textContent = textOutput.content.find(
      (c) => c.type === 'output_text',
    );
    if (!textContent || textContent.type !== 'output_text') {
      console.error('OpenAI returned no text content');
      return null;
    }

    const parsed = JSON.parse(textContent.text);
    const result = openAiRecommendationsResponseSchema.safeParse(parsed);

    if (!result.success) {
      console.error('OpenAI response validation failed:', result.error);
      return null;
    }

    return result.data.recommendations;
  } catch (error) {
    console.error('OpenAI API call failed:', error);
    return null;
  }
}

/**
 * 公開日文字列（YYYY-MM-DD）から公開年を取り出す
 * @returns 年（数値）。空文字・不正値の場合は null
 */
function getReleaseYear(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) {
    return null;
  }
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

/**
 * TMDb検索結果から、AIが指定した公開年と一致する候補だけを残す
 *
 * 検索はタイトルのみで行う（TMDb APIのyearは厳密フィルタのため、1年ずれると
 * 0件になる）ため、結果はTMDbの関連度順に並ぶ。その並びを保ったまま、AIが返した
 * 公開年と許容範囲内で一致するものに絞り込む。
 *
 * 公開年が一致しない候補は棄却する。以前は関連度順の先頭にフォールバックしており、
 * 「アクション・ヒーロー(2021)」の検索結果から「ラスト・アクション・ヒーロー(1993)」を
 * 採用するような同名別作品の誤解決を招いていた。
 *
 * @param results - TMDb検索結果
 * @param year - AIが返した公開年
 * @returns 公開年が一致する映画の配列（関連度順）
 */
function filterByReleaseYear(results: Movie[], year: number): Movie[] {
  return results.filter((movie) => {
    const releaseYear = getReleaseYear(movie.release_date);
    return (
      releaseYear !== null &&
      Math.abs(releaseYear - year) <= RECOMMENDATIONS_YEAR_MATCH_TOLERANCE
    );
  });
}

/**
 * タイトル比較用に表記揺れを吸収する
 *
 * 中黒・空白・記号の有無だけが違う同一作品（「ナイト・クローラー」と
 * 「ナイトクローラー」など）を同じ文字列として扱う。
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s・:：\-－−—.,!！?？'"]/g, '');
}

/**
 * 検索語と邦題・原題が厳密に一致する候補を探す
 *
 * 公開年の一致だけでは、検索語を含む別作品を拾ってしまう。
 * 例: 「The Purge」で検索すると同じ2013年の「The Purge: The Morning After」が
 * 関連度順で先に来て、本来の「パージ」を追い越す。
 *
 * @param results - 公開年で絞り込み済みのTMDb検索結果
 * @param query - 検索に使ったタイトル
 * @returns タイトルが厳密に一致する映画。なければ undefined
 */
function findExactTitleMatch(
  results: Movie[],
  query: string,
): Movie | undefined {
  const normalizedQuery = normalizeTitle(query);
  return results.find(
    (movie) =>
      normalizeTitle(movie.title) === normalizedQuery ||
      normalizeTitle(movie.original_title ?? '') === normalizedQuery,
  );
}

/**
 * OpenAIのレコメンド結果をTMDb検索で解決し、映画情報を取得する
 *
 * @param items - OpenAIが返したレコメンド項目
 * @param excludedIds - 除外するtmdb_movie_idの集合
 * @param limit - 解決する最大件数（デフォルト: RECOMMENDATIONS_MAX_COUNT）
 * @param signal - 中断シグナル。クライアント離脱時にTMDb検索を打ち切る
 * @returns 解決済みのレコメンド映画情報配列
 */
export async function resolveRecommendationsWithTMDb(
  items: OpenAiRecommendationItem[],
  excludedIds: Set<number>,
  limit: number = RECOMMENDATIONS_MAX_COUNT,
  signal?: AbortSignal,
): Promise<ResolvedRecommendation[]> {
  const resolved: ResolvedRecommendation[] = [];

  for (const item of items) {
    // 中断済みなら以降のTMDb検索を行わない
    if (signal?.aborted) {
      break;
    }

    try {
      /**
       * 公開年が一致する候補を関連度順で取得する
       *
       * yearなしで検索する（TMDb APIのyearは厳密フィルタのため、1年ずれると
       * 0件になる）。adult作品を除外するのは、searchMoviesでも除外済みだが、
       * レコメンドはDBに保存され全ユーザーに表示されるための二重防御。
       */
      const searchSafely = async (query: string) => {
        const searchResult = await searchMovies({ query }, { signal });
        const safeResults = searchResult.results.filter(
          (movie) => !movie.adult,
        );
        return filterByReleaseYear(safeResults, item.year);
      };

      // 邦題・原題の順に検索し、タイトルが厳密に一致する候補を最優先で採用する。
      // AIが返す邦題は表記揺れ（「ナイト・クローラー」と「ナイトクローラー」など）
      // でTMDbに一致しないことがあるため、原題を第2の手掛かりとして使う。
      const queries =
        item.title_en === item.title_ja
          ? [item.title_ja]
          : [item.title_ja, item.title_en];

      let movie: Movie | undefined;
      // 厳密一致が1件も無かった場合に使う、関連度最上位かつ公開年が一致する候補
      let relevanceFallback: Movie | undefined;

      for (const query of queries) {
        const candidates = await searchSafely(query);
        const exact = findExactTitleMatch(candidates, query);
        if (exact) {
          movie = exact;
          break;
        }
        relevanceFallback ??= candidates[0];
      }

      movie ??= relevanceFallback;
      if (!movie) {
        continue;
      }

      if (excludedIds.has(movie.id)) {
        continue;
      }

      // 同じ映画が既に追加されていないか確認
      if (resolved.some((r) => r.tmdb_movie_id === movie.id)) {
        continue;
      }

      // 除外キーワード（ポルノ・ピンク映画等）を含む映画を弾く。
      // adult フラグだけでは `adult=false` のアダルト作品を通してしまうため、
      // 採用が確定する直前にTMDbへ1回だけ問い合わせる（呼び出し回数を最小化）。
      if (await hasExcludedKeyword(movie.id, { signal })) {
        continue;
      }

      resolved.push({
        tmdb_movie_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date || null,
        vote_average: movie.vote_average ?? null,
        vote_count: movie.vote_count ?? 0,
        genre_ids: movie.genre_ids ?? null,
        reason: item.reason,
        display_order: resolved.length + 1,
      });

      if (resolved.length >= limit) {
        break;
      }
    } catch (error) {
      console.error(
        `TMDb search failed for "${item.title_ja}" / "${item.title_en}":`,
        error,
      );
      continue;
    }
  }

  return resolved;
}
