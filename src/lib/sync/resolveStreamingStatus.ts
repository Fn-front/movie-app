/**
 * 配信状態の遷移ロジック
 *
 * DB にも TMDb にも触らない純粋関数として切り出している。
 * この機能の難しさは「一時的な欠落」と「本当の配信終了 → 再配信」の
 * 区別に集中しており、そこだけを単体でテストできるようにするため。
 */

import { STREAMING_RESUME_THRESHOLD_DAYS } from '@/constants/movies';

/**
 * 1つの提供形態（見放題 or 有料）の保存済み状態
 */
export interface StreamingOfferState {
  /** 今配信しているプロバイダーID。空なら現在は観られない */
  providerIds: number[];
  /** 今の配信期間がいつ始まったか。一度も配信が無ければ null */
  since: string | null;
  /** 最後に配信を確認した日時 */
  lastSeenAt: string | null;
  /** 一度途切れたあとの再配信か */
  resumed: boolean;
}

/** 空の状態（一度も配信を確認していない） */
const EMPTY_STATE: StreamingOfferState = {
  providerIds: [],
  since: null,
  lastSeenAt: null,
  resumed: false,
};

/** ミリ秒単位の再配信しきい値 */
const RESUME_THRESHOLD_MS =
  STREAMING_RESUME_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/**
 * 今回の問い合わせ結果から、保存すべき配信状態を求める
 *
 * `since` は配信が見えなくなっても消さない。「配信終了をいつ確定させるか」を
 * 決めずに済ませるためで、現在観られるかは `providerIds` が空かどうかで表す。
 * これにより、データが1日欠けただけで継続配信中の作品が最上位へ浮上することを防ぐ。
 *
 * @param previous - 保存済みの状態。未登録なら null
 * @param currentProviderIds - 今回確認できたプロバイダーID（空なら配信なし）
 * @param now - 現在時刻
 * @param canDetectResume - 再配信を判定してよいか。既定 true。
 *   **観測が途切れていた経路では false を渡すこと**（下記）
 * @returns 保存すべき状態
 */
export function resolveStreamingOffer(
  previous: StreamingOfferState | null,
  currentProviderIds: number[],
  now: Date,
  canDetectResume: boolean = true,
): StreamingOfferState {
  const state = previous ?? EMPTY_STATE;

  // 今回は配信を確認できなかった。
  // 現在観られないことだけ反映し、配信期間の記録には触れない
  if (currentProviderIds.length === 0) {
    return { ...state, providerIds: [] };
  }

  const nowIso = now.toISOString();

  // 一度も配信が無かった作品。今回が初配信
  if (state.since === null) {
    return {
      providerIds: currentProviderIds,
      since: nowIso,
      lastSeenAt: nowIso,
      resumed: false,
    };
  }

  // 前回も配信中だった。期間は続いているので since は動かさない
  if (state.providerIds.length > 0) {
    return {
      providerIds: currentProviderIds,
      since: state.since,
      lastSeenAt: nowIso,
      resumed: state.resumed,
    };
  }

  // 空から復活した。空いた期間で一時的な欠落か再配信かを分ける。
  //
  // ⚠️ この判定は「毎日観測していて、それでも N 日見えなかった」ことを根拠に
  // している。観測自体が途切れていた経路（`initMovieStreamingStatus` の
  // 引き直し）では前提が成立せず、ギャップは「終了した」ではなく
  // 「見ていなかった」を意味する。その場合 canDetectResume=false で抑止する。
  //
  // 抑止しないと、引き直しのしきい値（7日）と RESUME_THRESHOLD_DAYS（7日）が
  // 同値であることから **isResumed が構造的に必ず true** になり、ずっと配信中
  // だった作品が再配信グループへ降格する（#960 のレビューで判明）
  const lastSeenTime = state.lastSeenAt
    ? new Date(state.lastSeenAt).getTime()
    : 0;
  const isResumed =
    canDetectResume && now.getTime() - lastSeenTime >= RESUME_THRESHOLD_MS;

  return {
    providerIds: currentProviderIds,
    since: isResumed ? nowIso : state.since,
    lastSeenAt: nowIso,
    resumed: isResumed ? true : state.resumed,
  };
}
