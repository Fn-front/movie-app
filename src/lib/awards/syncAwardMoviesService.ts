/**
 * 受賞作品同期サービス
 * CRONルートから分離したビジネスロジック
 *
 * 処理フロー:
 * 1. 当年・現在月に該当する賞を AWARD_DEFINITIONS から特定
 * 2. 該当する賞ごとに OpenAI + TMDb で受賞作品データ取得
 * 3. award_movies テーブルに UPSERT
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { AWARD_DEFINITIONS, type AwardName } from '@/constants/awards';
import type { OpenAiAwardItem } from '@/schema/awards';
import {
  buildWikipediaTitle,
  extractMovieTitlesFromWikitext,
  fetchAwardsFromOpenAI,
  resolveAwardsWithTMDb,
} from '@/lib/openai/generateAwardMovies';
import { fetchWikipediaArticle } from '@/lib/wikipedia/fetchArticle';

/** 同期処理のサマリー */
export interface SyncAwardMoviesSummary {
  year: number;
  month: number;
  synced_awards: string[];
  skipped_awards: string[];
  total_upserted: number;
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
  data: { year: number; month: number; reason: string };
}

export type SyncAwardMoviesCronResult = CronSuccess | CronError | CronSkipped;

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
  ).filter(([, def]) => def.month === month);
}

/**
 * 受賞作品同期CRONのメイン処理
 *
 * API呼び出し回数の目安（部門ごとにOpenAI 1回、リトライ最大3回）:
 * - 1月: ゴールデングローブ賞 9部門 → 最大27回
 * - 3月: アカデミー賞6部門 + 日本アカデミー賞7部門 → 最大39回
 * - 5月: カンヌ映画祭 8部門 → 最大24回
 * maxDuration=300秒の範囲内で処理完了する想定
 */
export async function executeSyncAwardMoviesCron(
  supabase: SupabaseClient,
): Promise<SyncAwardMoviesCronResult> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const generatedAt = now.toISOString();

  const targetAwards = getAwardsForMonth(currentMonth);

  if (targetAwards.length === 0) {
    return {
      type: 'skipped',
      data: {
        year: currentYear,
        month: currentMonth,
        reason: `${currentMonth}月に該当する賞はありません`,
      },
    };
  }

  const syncedAwards: string[] = [];
  const skippedAwards: string[] = [];
  let totalUpserted = 0;

  for (const [awardName, awardDef] of targetAwards) {
    try {
      const allAiItems: OpenAiAwardItem[] = [];
      const maxRetries = 3;

      // Wikipedia記事を取得（賞ごとに1回）
      const wikipediaTitle = buildWikipediaTitle(currentYear, awardDef);
      const articleText = await fetchWikipediaArticle(wikipediaTitle);

      if (!articleText) {
        console.warn(
          `Wikipedia article not found for ${awardName}: "${wikipediaTitle}"`,
        );
        skippedAwards.push(awardName);
        continue;
      }

      // wikitextから映画タイトル候補を事前抽出（ハルシネーション防止用）
      const validTitles = extractMovieTitlesFromWikitext(articleText);

      // 部門ごとに個別にOpenAIで構造化
      for (const category of awardDef.categories) {
        let categoryItems: Awaited<ReturnType<typeof fetchAwardsFromOpenAI>> =
          null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          categoryItems = await fetchAwardsFromOpenAI(
            currentYear,
            awardDef.label,
            category,
            articleText,
          );
          if (categoryItems && categoryItems.length > 0) break;
          console.warn(
            `No AI results for ${awardName}/${category.key} ${currentYear} (attempt ${attempt}/${maxRetries})`,
          );
        }

        if (categoryItems && categoryItems.length > 0) {
          // wikitextに存在しないタイトルを除外（ハルシネーション防止）
          const verified = categoryItems.filter((item) => {
            if (validTitles.has(item.title_ja)) return true;
            console.warn(
              `Hallucination detected: "${item.title_ja}" not found in wikitext, skipping`,
            );
            return false;
          });
          allAiItems.push(...verified);
        }
      }

      if (allAiItems.length === 0) {
        skippedAwards.push(awardName);
        continue;
      }

      const resolved = await resolveAwardsWithTMDb(allAiItems, awardDef);

      if (resolved.length === 0) {
        console.warn(`No TMDb results for ${awardName} ${currentYear}`);
        skippedAwards.push(awardName);
        continue;
      }

      // 部門ラベルをカテゴリごとに解決
      const categoryLabelMap = new Map<string, string>(
        awardDef.categories.map((c) => [c.key, c.label]),
      );
      const resolvedWithLabels = resolved.map((r) => ({
        ...r,
        award_label: categoryLabelMap.get(r.category) ?? r.category,
      }));

      // 各レコードにaward_labelを付与してUPSERT
      const upsertData = resolvedWithLabels.map((r) => ({
        tmdb_movie_id: r.tmdb_movie_id,
        title: r.title,
        poster_path: r.poster_path,
        release_date: r.release_date,
        vote_average: r.vote_average,
        genre_ids: r.genre_ids,
        award_name: awardName,
        award_year: currentYear,
        category: r.category,
        award_label: r.award_label,
        is_winner: r.is_winner,
        display_order: r.display_order,
        generated_at: generatedAt,
      }));

      const { error } = await supabase.from('award_movies').upsert(upsertData, {
        onConflict: 'tmdb_movie_id,award_name,award_year,category',
      });

      if (error) {
        console.error(`Failed to upsert ${awardName}:`, error);
        skippedAwards.push(awardName);
        continue;
      }

      totalUpserted += upsertData.length;
      syncedAwards.push(awardName);
    } catch (error) {
      console.error(`Error processing ${awardName}:`, error);
      skippedAwards.push(awardName);
    }
  }

  return {
    type: 'success',
    data: {
      year: currentYear,
      month: currentMonth,
      synced_awards: syncedAwards,
      skipped_awards: skippedAwards,
      total_upserted: totalUpserted,
    },
  };
}
