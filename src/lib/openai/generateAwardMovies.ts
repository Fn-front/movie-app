/**
 * OpenAI APIを使用した受賞作品データ取得ロジック
 *
 * 処理フロー:
 * 1. Wikipedia APIで記事本文を取得（安定したデータソース）
 * 2. OpenAI APIで記事本文を構造化データに変換
 * 3. 映画タイトルをTMDb APIで検索 → tmdb_movie_id解決
 */

import type { AwardCategory, AwardDefinition } from '@/constants/awards';
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
  return `あなたは映画賞データの構造化エキスパートです。
提供されたWikipedia記事のwikitextから、指定された部門の受賞作品とノミネート作品を正確に抽出してJSON形式で返してください。

## wikitextの読み方
- 記事はwikitext（MediaWikiマークアップ）形式です
- 受賞者は '''太字''' で記載され、先頭行（* で始まる行）に配置されます
- ノミネート者は ** で始まる行に記載されます
- 映画タイトルは『』や[[]]で囲まれています
- {{Award category|...|部門名}} がセクション区切りです

## 抽出ルール
- title_ja、title_enには必ず「映画のタイトル」を入れること。俳優名・監督名・人物名は絶対に入れないこと
- 演技賞の場合、記事中の俳優名の横に『』で記載されている出演映画のタイトルを返すこと
- 監督賞の場合、記事中の監督名の横に『』で記載されている監督作品のタイトルを返すこと
- yearは映画の公開年（授賞式の年ではなく）
- 受賞者（is_winner: true）は'''太字'''かつ先頭（*で始まる行）の1名のみ
- ノミネート者（**で始まる行）は記事に記載されている全員を漏れなく返すこと

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
 * Wikipedia記事タイトルを生成
 */
export function buildWikipediaTitle(
  awardYear: number,
  awardDef: AwardDefinition,
): string {
  const edition =
    awardDef.firstEditionYear > 0
      ? awardYear - awardDef.firstEditionYear
      : 0;
  return awardDef.wikipediaTemplate
    .replace('{edition}', String(edition))
    .replace('{year}', String(awardYear));
}

/**
 * Wikipedia記事本文を含むユーザープロンプトを組み立てる
 */
export function buildUserPrompt(
  awardYear: number,
  awardLabel: string,
  category: AwardCategory,
  articleText: string,
): string {
  return `以下は${awardYear}年に授賞式が行われた${awardLabel}のWikipedia記事（wikitext形式）です。
この記事から「${category.label}」部門の受賞作品とノミネート作品を抽出してください。

- categoryフィールドには "${category.key}" をそのまま使用してください
- yearフィールドには映画の公開年（授賞式の年ではなく）を入れてください
- '''太字'''の先頭行（*）が受賞者（is_winner: true）です
- **で始まる行がノミネート者です。全員を漏れなく返してください

---
${articleText}
---`;
}

/**
 * OpenAI APIを呼び出して1部門の受賞作品データを抽出
 */
export async function fetchAwardsFromOpenAI(
  awardYear: number,
  awardLabel: string,
  category: AwardCategory,
  articleText: string,
): Promise<OpenAiAwardItem[] | null> {
  const client = createOpenAIClient();
  if (!client) {
    console.error('OpenAI API key is not configured');
    return null;
  }

  const userPrompt = buildUserPrompt(
    awardYear,
    awardLabel,
    category,
    articleText,
  );

  try {
    const response = await client.responses.create({
      model: getOpenAIModel(),
      instructions: buildSystemPrompt(),
      input: userPrompt,
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
