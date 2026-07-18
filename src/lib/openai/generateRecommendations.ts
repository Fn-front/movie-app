/**
 * OpenAI APIを使用したレコメンド生成ロジック
 */

import {
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_YEAR_MATCH_TOLERANCE,
  OPENAI_CONFIG,
  TMDB_GENRE_MAP,
} from '@/constants';
import { searchMovies } from '@/lib/tmdb/tmdb';
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
- 除外リストにある映画は絶対に推薦しないこと
- 実在する映画のみ推薦すること
- ジャンル、監督、テーマ、雰囲気などの傾向を分析して推薦すること
- 評価が高い映画の傾向をより重視すること
- 「興味なし」リストがある場合、それらの映画のジャンルやテーマの傾向を避けること
- 推薦理由は日本語で1〜2文で簡潔に書くこと

レスポンスは以下のJSON形式で返してください:
{
  "recommendations": [
    {
      "title": "映画の原題または最も一般的なタイトル",
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
  excludedTitles: string[],
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

  if (excludedTitles.length > 0) {
    const excludeLines = excludedTitles.map((t) => `- ${t}`).join('\n');
    prompt += `\n\n## 除外リスト（これらの映画は推薦しないでください）\n${excludeLines}`;
  }

  return prompt;
}

/**
 * OpenAI APIを呼び出してレコメンドを生成
 *
 * @param favorites - お気に入り映画リスト
 * @param excludedTitles - 除外する映画タイトルリスト
 * @param count - 推薦する件数（デフォルト: RECOMMENDATIONS_MAX_COUNT）
 * @param dismissedMovies - 興味なし映画リスト（傾向分析用）
 * @returns パース済みのレコメンド項目配列、失敗時はnull
 */
export async function fetchRecommendationsFromOpenAI(
  favorites: FavoriteMovie[],
  excludedTitles: string[],
  count: number = RECOMMENDATIONS_MAX_COUNT,
  dismissedMovies: DismissedMovie[] = [],
): Promise<OpenAiRecommendationItem[] | null> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return null;
  }

  const userPrompt = buildUserPrompt(
    favorites,
    excludedTitles,
    dismissedMovies,
  );

  try {
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: 'system', content: buildSystemPrompt(count) },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('OpenAI returned empty response');
      return null;
    }

    const parsed = JSON.parse(content);
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
 * TMDb検索結果から、AIが指定した公開年に最も近い候補を選ぶ
 *
 * 検索はタイトルのみで行う（TMDb APIのyearは厳密フィルタのため、1年ずれると
 * 0件になる）ため、結果はTMDbの関連度順に並ぶ。その並びを尊重しつつ、AIが返した
 * 公開年と許容範囲内で一致する最初の候補を優先する。一致がなければ先頭を採用する。
 *
 * @param results - TMDb検索結果
 * @param year - AIが返した公開年
 * @returns 採用する映画。結果が空なら undefined
 */
function selectBestMovieMatch(
  results: Movie[],
  year: number,
): Movie | undefined {
  if (results.length === 0) {
    return undefined;
  }

  const matched = results.find((movie) => {
    const releaseYear = getReleaseYear(movie.release_date);
    return (
      releaseYear !== null &&
      Math.abs(releaseYear - year) <= RECOMMENDATIONS_YEAR_MATCH_TOLERANCE
    );
  });

  return matched ?? results[0];
}

/**
 * OpenAIのレコメンド結果をTMDb検索で解決し、映画情報を取得する
 *
 * @param items - OpenAIが返したレコメンド項目
 * @param excludedIds - 除外するtmdb_movie_idの集合
 * @param limit - 解決する最大件数（デフォルト: RECOMMENDATIONS_MAX_COUNT）
 * @returns 解決済みのレコメンド映画情報配列
 */
export async function resolveRecommendationsWithTMDb(
  items: OpenAiRecommendationItem[],
  excludedIds: Set<number>,
  limit: number = RECOMMENDATIONS_MAX_COUNT,
): Promise<ResolvedRecommendation[]> {
  const resolved: ResolvedRecommendation[] = [];

  for (const item of items) {
    try {
      // yearなしで検索（TMDb APIのyearは厳密フィルタのため、1年ずれると0件になる）
      const searchResult = await searchMovies({
        query: item.title,
      });

      // タイトル一致かつ公開年が近い結果を優先的に選択
      const movie = selectBestMovieMatch(searchResult.results, item.year);
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

      resolved.push({
        tmdb_movie_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date || null,
        vote_average: movie.vote_average ?? null,
        genre_ids: movie.genre_ids ?? null,
        reason: item.reason,
        display_order: resolved.length + 1,
      });

      if (resolved.length >= limit) {
        break;
      }
    } catch (error) {
      console.error(`TMDb search failed for "${item.title}":`, error);
      continue;
    }
  }

  return resolved;
}
