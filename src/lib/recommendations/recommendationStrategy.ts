/**
 * レコメンド生成の戦略ロジック
 *
 * 試行ごとの生成パラメータ決定と、候補の多様性リランキング。
 * 外部API（OpenAI / TMDb）に依存しない純粋関数だけを置く。
 */

import {
  OPENAI_CONFIG,
  RECOMMENDATIONS_MAX_GENRE_RATIO,
  RECOMMENDATIONS_RETRY_MAX_TEMPERATURE,
  RECOMMENDATIONS_RETRY_TEMPERATURE_STEP,
} from '@/constants';
import type { ResolvedRecommendation } from '@/lib/openai/generateRecommendations';

/** リトライ時に変化させる生成戦略 */
export interface RetryStrategy {
  /** 今回の試行で使う temperature */
  temperature: number;
  /** システムプロンプトへ追記する指示。初回は null */
  hint: string | null;
}

/**
 * 試行回数に応じた生成戦略を決める
 *
 * 同じ入力・同じ温度で再送しても似た候補が返るだけで、リトライが空振りする。
 * 試行ごとに temperature を上げて出力を散らし、2回目以降は
 * 「これまでと違う方向から選べ」という指示も足す。
 *
 * @param attempt - 0始まりの試行回数
 * @returns 今回の試行で使う温度と追加指示
 */
export function buildRetryStrategy(attempt: number): RetryStrategy {
  const temperature = Math.min(
    OPENAI_CONFIG.RECOMMENDATIONS_TEMPERATURE +
      attempt * RECOMMENDATIONS_RETRY_TEMPERATURE_STEP,
    RECOMMENDATIONS_RETRY_MAX_TEMPERATURE,
  );

  if (attempt === 0) {
    return { temperature, hint: null };
  }

  return {
    temperature,
    hint: 'これまでの推薦では候補が足りませんでした。前回までとは異なるジャンル・年代・制作国の作品を重点的に選んでください。',
  };
}

/**
 * 同一ジャンルへの偏りを抑えて候補を選抜する
 *
 * お気に入りに偏り（例: アクションばかり）があるユーザーには、AIも同系統の
 * 作品ばかり返す。関連度順をそのまま採用すると一覧がほぼ1ジャンルになるため、
 * 代表ジャンル（genre_ids の先頭）ごとの採用数に上限を設けて選抜する。
 *
 * 上限に達したジャンルの候補も捨てずに保留し、他ジャンルで枠が埋まらなかった
 * 場合は元の順序で補充する。多様性のために件数を減らさないための措置。
 *
 * @param candidates - TMDb解決済みの候補（関連度順）
 * @param limit - 採用する件数
 * @returns 選抜後の候補。display_order は振り直す
 */
export function applyDiversityReranking(
  candidates: ResolvedRecommendation[],
  limit: number,
): ResolvedRecommendation[] {
  const maxPerGenre = Math.max(
    1,
    Math.ceil(limit * RECOMMENDATIONS_MAX_GENRE_RATIO),
  );
  const genreCounts = new Map<number, number>();
  const selected: ResolvedRecommendation[] = [];
  const deferred: ResolvedRecommendation[] = [];

  for (const candidate of candidates) {
    if (selected.length >= limit) {
      break;
    }

    // 代表ジャンル。genre_ids が無い候補は偏りの判定対象外とする
    const genre = candidate.genre_ids?.[0] ?? null;
    if (genre === null) {
      selected.push(candidate);
      continue;
    }

    const count = genreCounts.get(genre) ?? 0;
    if (count >= maxPerGenre) {
      deferred.push(candidate);
      continue;
    }

    genreCounts.set(genre, count + 1);
    selected.push(candidate);
  }

  // 上限で弾いた候補で残りの枠を埋める（多様性より件数を優先する）
  for (const candidate of deferred) {
    if (selected.length >= limit) {
      break;
    }
    selected.push(candidate);
  }

  return selected.map((item, index) => ({
    ...item,
    display_order: index + 1,
  }));
}
