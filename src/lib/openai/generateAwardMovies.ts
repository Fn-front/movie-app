/**
 * OpenAI APIを使用した受賞作品データ取得ロジック
 *
 * 処理フロー:
 * 1. OpenAI Responses API + web_search_preview で最新受賞データ取得
 * 2. レスポンスをZodスキーマでバリデーション
 * 3. 映画タイトルをTMDb APIで検索 → tmdb_movie_id解決
 */

import type { AwardDefinition } from '@/constants/awards';
import { OPENAI_CONFIG } from '@/constants';
import { searchMovies } from '@/lib/tmdb/tmdb';
import {
  openAiAwardsResponseSchema,
  type OpenAiAwardItem,
} from '@/schema/awards';

import { createOpenAIClient, getOpenAIModel } from './client';

/** TMDb検索で解決済みの受賞作品情報 */
export interface ResolvedAwardMovie {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  genre_ids: number[] | null;
  category: string;
  is_winner: boolean;
  display_order: number;
}

/**
 * システムプロンプトを生成
 */
function buildSystemPrompt(): string {
  return `あなたは映画賞のデータベースです。
指定された映画賞の受賞作品・ノミネート作品を正確に返してください。
Web検索を使って最新情報を取得してください。

ルール:
- 実際に発表された受賞・ノミネート情報のみ返すこと
- 各部門の受賞者（is_winner: true）は1名のみ
- ノミネート者は実際にノミネートされた人物・作品のみ
- title_jaは日本語の正式タイトル、title_enは英語の正式タイトル
- yearは映画の公開年（授賞式の年ではなく）

レスポンスは以下のJSON形式で返してください:
{
  "awards": [
    {
      "title_ja": "日本語タイトル",
      "title_en": "英語タイトル",
      "category": "部門キー",
      "is_winner": true,
      "year": 2025
    }
  ]
}`;
}

/**
 * ユーザープロンプトを組み立てる
 */
export function buildUserPrompt(
  awardYear: number,
  awardLabel: string,
  categories: readonly { key: string; label: string }[],
): string {
  const categoryLines = categories
    .map((c) => `- ${c.key}: ${c.label}`)
    .join('\n');

  return `${awardYear}年 ${awardLabel} の以下の部門の受賞作品とノミネート作品を教えてください。

部門:
${categoryLines}

各部門について、受賞者1名とノミネート者（受賞者を含む全候補者）を返してください。
categoryフィールドには上記の部門キーをそのまま使用してください。`;
}

/**
 * OpenAI APIを呼び出して受賞作品データを取得
 */
export async function fetchAwardsFromOpenAI(
  awardYear: number,
  awardLabel: string,
  categories: readonly { key: string; label: string }[],
): Promise<OpenAiAwardItem[] | null> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return null;
  }

  const userPrompt = buildUserPrompt(awardYear, awardLabel, categories);

  try {
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions: buildSystemPrompt(),
      input: userPrompt,
      tools: [{ type: 'web_search_preview' }],
      text: {
        format: {
          type: 'json_schema',
          name: 'awards_response',
          schema: {
            type: 'object',
            properties: {
              awards: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title_ja: { type: 'string' },
                    title_en: { type: 'string' },
                    category: { type: 'string' },
                    is_winner: { type: 'boolean' },
                    year: { type: 'number' },
                  },
                  required: [
                    'title_ja',
                    'title_en',
                    'category',
                    'is_winner',
                    'year',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['awards'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      temperature: OPENAI_CONFIG.AWARDS_TEMPERATURE,
    });

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
    const result = openAiAwardsResponseSchema.safeParse(parsed);

    if (!result.success) {
      console.error('OpenAI response validation failed:', result.error);
      return null;
    }

    return result.data.awards;
  } catch (error) {
    console.error('OpenAI API call failed:', error);
    return null;
  }
}

/**
 * TMDb検索結果から公開年が一致する映画を優先選択する
 * 一致するものがなければ先頭結果をフォールバックとして返す
 */
function findBestMatch<T extends { id: number; release_date?: string }>(
  results: T[],
  year: number,
): T | undefined {
  return (
    results.find((m) => m.release_date?.startsWith(String(year))) ?? results[0]
  );
}

/**
 * OpenAIの受賞作品結果をTMDb検索で解決し、映画情報を取得する
 */
export async function resolveAwardsWithTMDb(
  items: OpenAiAwardItem[],
  awardDefinition: AwardDefinition,
): Promise<ResolvedAwardMovie[]> {
  const resolved: ResolvedAwardMovie[] = [];
  const validCategoryKeys = new Set(
    awardDefinition.categories.map((c) => c.key),
  );
  // 部門ごとのdisplay_orderカウンター
  const categoryOrderMap = new Map<string, number>();

  for (const item of items) {
    if (!validCategoryKeys.has(item.category)) {
      console.warn(`Unknown category key: ${item.category}, skipping`);
      continue;
    }

    try {
      // 日本語タイトルで検索、見つからなければ英語タイトルで検索
      let searchResult = await searchMovies({ query: item.title_ja });
      let movie = findBestMatch(searchResult.results, item.year);

      if (!movie) {
        searchResult = await searchMovies({ query: item.title_en });
        movie = findBestMatch(searchResult.results, item.year);
      }

      if (!movie) {
        console.warn(
          `TMDb search failed for "${item.title_ja}" / "${item.title_en}"`,
        );
        continue;
      }

      // 同じ映画×同じ部門の重複を防止
      if (
        resolved.some(
          (r) => r.tmdb_movie_id === movie.id && r.category === item.category,
        )
      ) {
        continue;
      }

      // 部門ごとの連番を採番
      const currentOrder = (categoryOrderMap.get(item.category) ?? 0) + 1;
      categoryOrderMap.set(item.category, currentOrder);

      resolved.push({
        tmdb_movie_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date || null,
        vote_average: movie.vote_average ?? null,
        genre_ids: movie.genre_ids ?? null,
        category: item.category,
        is_winner: item.is_winner,
        display_order: currentOrder,
      });
    } catch (error) {
      console.error(`TMDb search failed for "${item.title_ja}":`, error);
      continue;
    }
  }

  return resolved;
}
