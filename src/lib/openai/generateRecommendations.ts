/**
 * OpenAI APIを使用したレコメンド生成ロジック
 */

import { RECOMMENDATIONS_MAX_COUNT } from '@/constants';
import { searchMovies } from '@/lib/tmdb/tmdb';
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

const SYSTEM_PROMPT = `あなたは映画レコメンドAIです。
ユーザーのお気に入り映画と評価（1〜10点）を分析し、そのユーザーが好みそうな映画を${RECOMMENDATIONS_MAX_COUNT}件推薦してください。

ルール:
- 除外リストにある映画は絶対に推薦しないこと
- 実在する映画のみ推薦すること
- ジャンル、監督、テーマ、雰囲気などの傾向を分析して推薦すること
- 評価が高い映画の傾向をより重視すること
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

/**
 * お気に入り映画リストからユーザープロンプトを組み立てる
 */
export function buildUserPrompt(
  favorites: FavoriteMovie[],
  excludedTitles: string[],
): string {
  const favoriteLines = favorites
    .map((f) => {
      const rating = f.rating !== null ? ` - 評価: ${f.rating}/10` : '';
      return `- ${f.title}${rating}`;
    })
    .join('\n');

  let prompt = `## お気に入り映画\n${favoriteLines}`;

  if (excludedTitles.length > 0) {
    const excludeLines = excludedTitles.map((t) => `- ${t}`).join('\n');
    prompt += `\n\n## 除外リスト（これらの映画は推薦しないでください）\n${excludeLines}`;
  }

  return prompt;
}

/**
 * OpenAI APIを呼び出してレコメンドを生成
 *
 * @returns パース済みのレコメンド項目配列、失敗時はnull
 */
export async function fetchRecommendationsFromOpenAI(
  favorites: FavoriteMovie[],
  excludedTitles: string[],
): Promise<OpenAiRecommendationItem[] | null> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return null;
  }

  const userPrompt = buildUserPrompt(favorites, excludedTitles);

  try {
    const response = await client.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
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
 * OpenAIのレコメンド結果をTMDb検索で解決し、映画情報を取得する
 *
 * @param items - OpenAIが返したレコメンド項目
 * @param excludedIds - 除外するtmdb_movie_idの集合
 * @returns 解決済みのレコメンド映画情報配列
 */
export async function resolveRecommendationsWithTMDb(
  items: OpenAiRecommendationItem[],
  excludedIds: Set<number>,
): Promise<ResolvedRecommendation[]> {
  const resolved: ResolvedRecommendation[] = [];

  for (const item of items) {
    try {
      // yearなしで検索（TMDb APIのyearは厳密フィルタのため、1年ずれると0件になる）
      const searchResult = await searchMovies({
        query: item.title,
      });

      // タイトル一致かつ公開年が近い結果を優先的に選択
      const movie = searchResult.results[0];
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

      if (resolved.length >= RECOMMENDATIONS_MAX_COUNT) {
        break;
      }
    } catch (error) {
      console.error(`TMDb search failed for "${item.title}":`, error);
      continue;
    }
  }

  return resolved;
}
