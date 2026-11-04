/**
 * 管理画面からの受賞作品手動同期
 *
 * 残留レコードを消す「世代付き入れ替え」を行う。前回あって今回無いレコードが
 * 残り続けると「データがおかしいからやり直す」場面で直したことにならないため。
 * cron（`syncSingleAward`）も同じ入れ替えを行い、削除は
 * `deleteStaleAwardRows` を共有する。
 *
 * ⚠️ DELETE → INSERT の順にしてはいけない。supabase-js の DELETE と INSERT は
 * 別々の文でそれぞれ自動コミットされるため、DELETE 後に INSERT が失敗すると
 * その賞・年のデータが消えたまま復旧しない。しかも `resolveAwardsWithTMDb` は
 * 重複を返しうる（cron 側が UPSERT 前に dedup しているのがその証拠）ので、
 * 多行まとめた1文の INSERT は一意制約で全ロールバックしやすい。
 * **UPSERT を先に行い、今回更新されなかった行だけを後から消す。**
 *
 * 設計: `.claude/documents/admin-award-sync-design.md` 4-3
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import {
  AWARD_DEFINITIONS,
  AWARD_MOVIES_CONFLICT_TARGET,
} from '@/constants/awards';
import {
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_STATUS,
  type SyncableAwardName,
} from '@/constants/awardSync';

import { deleteStaleAwardRows } from './deleteStaleAwardRows';
import {
  fetchAndResolveAward,
  type AwardFetchFailure,
} from './syncAwardMoviesService';
import { finishJobIfRunning, isJobStillRunning } from './awardSyncJob';

/** 事後調査に使えるよう code を添えて1行にする */
function formatPostgrestError(error: PostgrestError): string {
  return error.code ? `${error.message} (${error.code})` : error.message;
}

/**
 * 取得できなかった理由を画面に出す文言へ変換する
 *
 * **記事名を含める。** 記事名が出れば、それが実在するかを admin がその場で
 * 確かめられる。「受賞作品を取得できませんでした」だけでは、記事名の誤りと
 * 一時障害と記事構成の変更を切り分けられない（#916 / #918）。
 * admin 専用画面にしか出ないため、Wikipedia の記事名を出して差し支えない。
 */
export function describeAwardFetchFailure(failure: AwardFetchFailure): string {
  switch (failure.type) {
    case 'no_article':
      return `${AWARD_SYNC_MESSAGES.NO_ARTICLE}: ${failure.wikipediaTitle}`;
    case 'article_unavailable':
      return `${AWARD_SYNC_MESSAGES.ARTICLE_UNAVAILABLE}: ${failure.wikipediaTitle}`;
    case 'no_section':
      return `${AWARD_SYNC_MESSAGES.NO_SECTION}: ${failure.wikipediaTitle}`;
    case 'no_tmdb_match':
      return AWARD_SYNC_MESSAGES.NO_TMDB_MATCH;
    case 'no_items':
      return AWARD_SYNC_MESSAGES.NO_ITEMS;
    default: {
      // 理由を足したらここで型エラーになる。default で畳むと、
      // 本Issueが潰した「1つにまとめる」が静かに再発する
      const unhandled: never = failure;
      return unhandled;
    }
  }
}

interface ManualAwardSyncParams {
  jobId: string;
  awardName: SyncableAwardName;
  year: number;
}

/**
 * 1賞・1年ぶんを同期してジョブを終端状態にする
 *
 * **例外を外へ投げない。** `after()` のコールバックとして呼ばれるが、Next は
 * そこで投げた例外を握り潰してログに出すだけなので、投げるとジョブが running の
 * まま孤児になる。すべての経路で必ず終端状態を書く。
 */
export async function executeManualAwardSync(
  supabase: SupabaseClient,
  params: ManualAwardSyncParams,
): Promise<void> {
  const { jobId, awardName, year } = params;
  const generatedAt = new Date().toISOString();

  try {
    const resolved = await fetchAndResolveAward({
      awardName,
      awardDef: AWARD_DEFINITIONS[awardName],
      year,
      generatedAt,
    });

    // 取得できなかったときは既存データに一切触れない。
    // ここで素通しすると「0件でUPSERT → 全部DELETE」になり全損する
    if (resolved.type !== 'rows') {
      await finishJobIfRunning(supabase, jobId, {
        status: AWARD_SYNC_STATUS.FAILED,
        errorMessage: describeAwardFetchFailure(resolved),
      });
      return;
    }

    // 書き込みに入る直前に失効を確認する。強制失効されていた場合、
    // 既に別のジョブが同じ賞・年を触っている可能性がある
    if (!(await isJobStillRunning(supabase, jobId))) {
      console.warn(
        `[manualAwardSync] ジョブが失効していたため書き込みを中止しました id=${jobId}`,
      );
      return;
    }

    const { error: upsertError } = await supabase
      .from('award_movies')
      .upsert(resolved.rows, {
        onConflict: AWARD_MOVIES_CONFLICT_TARGET,
      });

    // UPSERT が失敗したらここで終わる。DELETE へ進むと既存データを失う
    if (upsertError) {
      await finishJobIfRunning(supabase, jobId, {
        status: AWARD_SYNC_STATUS.FAILED,
        errorMessage: `${AWARD_SYNC_MESSAGES.WRITE_FAILED}: ${upsertError.message}`,
      });
      return;
    }

    // 今回更新されなかった行＝前回あって今回無い残留だけを消す。
    // 削除範囲の絞り込みは cron と同じ関数に任せる（挙動を2通り持たない）
    const deleteError = await deleteStaleAwardRows(supabase, {
      awardName,
      year,
      generatedAt,
      categories: resolved.deletableCategories,
    });

    if (deleteError) {
      // UPSERT は成功しているのでデータは新しい。残留が消えなかっただけなので
      // 成功扱いにする。ただし「完了しました」だけだと残留に気づけないため、
      // 警告として画面まで届ける
      console.error(
        `[manualAwardSync] 旧世代の削除に失敗しました award=${awardName} year=${year}`,
        deleteError,
      );
    }

    await finishJobIfRunning(supabase, jobId, {
      status: AWARD_SYNC_STATUS.SUCCEEDED,
      totalUpserted: resolved.rows.length,
      ...(deleteError
        ? {
            // code も残す。42501（権限）と 57014（タイムアウト）は対処が違う
            warningMessage: `${AWARD_SYNC_MESSAGES.STALE_DELETE_FAILED}: ${formatPostgrestError(deleteError)}`,
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[manualAwardSync] 同期に失敗しました id=${jobId}`, error);

    await finishJobIfRunning(supabase, jobId, {
      status: AWARD_SYNC_STATUS.FAILED,
      errorMessage: message,
    });
  }
}
