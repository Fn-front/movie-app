/**
 * 受賞作品同期サービス
 * CRONルートから分離したビジネスロジック
 *
 * 処理フロー:
 * 1. 当年・現在月に該当する賞を AWARD_DEFINITIONS から特定
 * 2. アカデミー賞: eiga.com から正規表現で抽出 → TMDb で映画情報解決
 *    その他の賞: Wikipedia + OpenAI で構造化 → TMDb で映画情報解決
 * 3. award_movies テーブルに UPSERT
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { AWARD_DEFINITIONS, type AwardName } from '@/constants/awards';
import type { OpenAiAwardItem } from '@/schema/awards';
import { fetchEigaOscarAwards } from '@/lib/eiga/fetchEigaOscarAwards';
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
  month: number | null;
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
  data: { year: number; month: number | null; reason: string };
}

export type SyncAwardMoviesCronResult = CronSuccess | CronError | CronSkipped;

/** CRON同期対象外の賞 */
const EXCLUDED_AWARDS: ReadonlySet<string> = new Set(['japan_academy_awards']);

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
  const skippedAwards: string[] = [];
  let totalUpserted = 0;

  for (const [awardName, awardDef] of targetAwards) {
    try {
      let allAiItems: OpenAiAwardItem[];

      if (awardName === 'academy_awards') {
        // アカデミー賞: eiga.com から正規表現で抽出（ハルシネーションなし）
        allAiItems = await fetchEigaOscarAwards(syncYear);
      } else {
        // その他の賞: Wikipedia + OpenAI で構造化
        allAiItems = await fetchAwardItemsViaWikipedia(
          awardName,
          awardDef,
          syncYear,
        );
      }

      if (allAiItems.length === 0) {
        skippedAwards.push(awardName);
        continue;
      }

      const resolved = await resolveAwardsWithTMDb(allAiItems, awardDef);

      if (resolved.length === 0) {
        console.warn(`No TMDb results for ${awardName} ${syncYear}`);
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
        award_year: syncYear,
        category: r.category,
        award_label: r.award_label,
        is_winner: r.is_winner,
        display_order: r.display_order,
        person_name: r.person_name ?? null,
        generated_at: generatedAt,
      }));

      // UPSERT前に重複チェック（同じユニークキーのレコードを除外）
      const seen = new Set<string>();
      const deduplicatedData = upsertData.filter((r) => {
        const key = `${r.tmdb_movie_id}:${r.award_name}:${r.award_year}:${r.category}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const { error } = await supabase
        .from('award_movies')
        .upsert(deduplicatedData, {
          onConflict: 'tmdb_movie_id,award_name,award_year,category',
        });

      if (error) {
        console.error(`Failed to upsert ${awardName}:`, error);
        skippedAwards.push(awardName);
        continue;
      }

      totalUpserted += deduplicatedData.length;
      syncedAwards.push(awardName);
    } catch (error) {
      console.error(`Error processing ${awardName}:`, error);
      skippedAwards.push(awardName);
    }
  }

  return {
    type: 'success',
    data: {
      year: syncYear,
      month: isManualSync ? null : currentMonth,
      synced_awards: syncedAwards,
      skipped_awards: skippedAwards,
      total_upserted: totalUpserted,
    },
  };
}

/**
 * Wikipedia + OpenAI で受賞作品データを取得
 * アカデミー賞以外の賞で使用
 */
async function fetchAwardItemsViaWikipedia(
  awardName: string,
  awardDef: (typeof AWARD_DEFINITIONS)[AwardName],
  currentYear: number,
): Promise<OpenAiAwardItem[]> {
  const allAiItems: OpenAiAwardItem[] = [];
  const maxRetries = 3;

  const wikipediaTitle = buildWikipediaTitle(currentYear, awardDef);
  const articleText = await fetchWikipediaArticle(wikipediaTitle);

  if (!articleText) {
    console.warn(
      `Wikipedia article not found for ${awardName}: "${wikipediaTitle}"`,
    );
    return [];
  }

  const validTitles = extractMovieTitlesFromWikitext(articleText);

  for (const category of awardDef.categories) {
    let categoryItems: Awaited<ReturnType<typeof fetchAwardsFromOpenAI>> = null;

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
      const verified = categoryItems.filter((item) => {
        if (validTitles.has(item.title_ja)) return true;
        console.warn(
          `Hallucination detected: "${item.title_ja}" not found in wikitext, skipping`,
        );
        return false;
      });
      const corrected = verified.map((item) => {
        if (Math.abs(item.year - currentYear) > 2) {
          console.warn(
            `Year corrected: "${item.title_ja}" year=${item.year} → ${currentYear - 1}`,
          );
          return { ...item, year: currentYear - 1 };
        }
        return item;
      });
      allAiItems.push(...corrected);
    }
  }

  return allAiItems;
}
