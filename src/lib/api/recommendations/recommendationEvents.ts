/**
 * レコメンド利用イベント記録API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { RecommendationEvent } from '@/schema/recommendations';

/**
 * レコメンド利用イベントをまとめて記録する
 *
 * 計測はユーザー操作の副次処理なので、失敗しても呼び出し側の
 * 処理は止めない（呼び出し側で握りつぶす前提）。
 *
 * @param events - 記録するイベント
 */
export async function recordRecommendationEvents(
  events: RecommendationEvent[],
): Promise<void> {
  await axiosInstance.post(API_ENDPOINTS.RECOMMENDATIONS_EVENTS, { events });
}

/**
 * ページ離脱時にレコメンド利用イベントを記録する
 *
 * `pagehide` の最中は通常のリクエストがドキュメントの破棄とともに
 * キャンセルされうる。`keepalive` を付けた fetch はドキュメントを離れても
 * 送信が継続されるため、離脱直前のキューを取りこぼさない。
 * axios は XHR で送るため `keepalive` を指定できず、この経路には使えない。
 *
 * `sendBeacon` でも同じことができるが、Content-Type を JSON に固定できる
 * fetch を使う（API Route は JSON ボディを前提にしている）。
 *
 * 離脱後に結果を扱えないため、成否は呼び出し側に返さない。
 *
 * @param events - 記録するイベント
 */
export function recordRecommendationEventsOnUnload(
  events: RecommendationEvent[],
): void {
  if (events.length === 0) {
    return;
  }

  void fetch(API_ENDPOINTS.RECOMMENDATIONS_EVENTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // 計測の失敗はユーザー操作に影響させない
  });
}
