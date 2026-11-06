/**
 * ウォッチリスト関連の定数
 */

import { errorMessage, successMessage } from './common';
import { MS_PER_DAY } from './time';

/**
 * ウォッチリストのデフォルト取得件数
 */
export const WATCHLIST_DEFAULT_LIMIT = 20;

/**
 * ウォッチリストの最大取得件数
 */
export const WATCHLIST_MAX_LIMIT = 50;

/**
 * ウォッチリスト取得SELECTカラム
 */
export const WATCHLIST_SELECT =
  'id, tmdb_movie_id, title, poster_path, release_date, added_at, watched_at';

const TARGET = 'ウォッチリスト';

/**
 * ウォッチリストエラーメッセージ
 */
export const WATCHLIST_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  ADD_FAILED: errorMessage.addFailed(TARGET),
  REMOVE_FAILED: errorMessage.removeFailed(TARGET),
  WATCHED_UPDATE_FAILED: '視聴済みの更新に失敗しました',
  ALREADY_EXISTS: 'この映画はすでにウォッチリストに追加されています',
  NOT_FOUND: 'ウォッチリストに見つかりません',
  INVALID_ID: errorMessage.invalid('ウォッチリストID'),
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
  INVALID_BODY: errorMessage.invalid('入力内容'),
  YEARS_FETCH_FAILED: '追加年の取得に失敗しました',
  BULK_DELETE_FAILED: '視聴済みの一括削除に失敗しました',
} as const;

/**
 * ウォッチリスト成功メッセージ
 */
export const WATCHLIST_SUCCESS_MESSAGES = {
  ADDED: successMessage.added(TARGET),
  REMOVED: successMessage.removed(TARGET),
  MARKED_WATCHED: '視聴済みにしました',
  UNMARKED_WATCHED: '未視聴に戻しました',
  /** 一括削除成功: 「{件数}件を削除しました」 */
  bulkDeleted: (count: number) => `${count}件を削除しました`,
} as const;

/**
 * ウォッチリストのカードに並べるプロバイダーロゴの上限
 *
 * 溢れた分は「+N」で畳む。小さなカードに4つ以上並べると判別できないため。
 */
export const WATCHLIST_PROVIDER_LOGO_MAX = 3;

/**
 * 配信バッジの表示ラベル
 */
export const WATCHLIST_STREAMING_LABELS = {
  /** 見放題 */
  FLATRATE: '見放題',
  /** レンタル・購入 */
  PAID: 'レンタル',
  /** ロゴが溢れたときの表示: 「+2」 */
  overflow: (count: number) => `+${count}`,
  /** バッジ全体の読み上げ: 「U-NEXT、Netflix で見放題」 */
  ariaLabel: (offerLabel: string, providerNames: string[]) =>
    providerNames.length > 0
      ? `${providerNames.join('、')} で${offerLabel}`
      : `${offerLabel}で配信中`,
} as const;

/**
 * 視聴済みの表示ラベル
 */
export const WATCHLIST_WATCHED_LABELS = {
  /** 視聴済みにする */
  MARK: '視聴済みにする',
  /** 未視聴に戻す */
  UNMARK: '未視聴に戻す',
  /** 視聴済みバッジ */
  BADGE: '視聴済み',
} as const;

/**
 * 一括削除で指定できる年の下限
 *
 * 上限を「現在年」にするとバリデーションが実行時刻に依存してテストが不安定になる。
 * 未来の年を指定しても対象は0件になるだけなので、固定の範囲で異常入力だけ弾く。
 */
export const WATCHLIST_CLEANUP_MIN_YEAR = 2000;

/**
 * 一括削除で指定できる年の上限
 */
export const WATCHLIST_CLEANUP_MAX_YEAR = 2100;

/**
 * 一括削除で除外できる件数の上限
 */
export const WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS = 1000;

/**
 * 視聴済み一括削除の表示ラベル
 */
export const WATCHLIST_CLEANUP_LABELS = {
  /** ツールバーの起動ボタン */
  OPEN_BUTTON: '視聴済みを整理',
  /** モーダルのタイトル */
  MODAL_TITLE: '視聴済みをまとめて削除',
  /** 年セレクトのラベル */
  YEAR_LABEL: '追加年',
  /** 全選択チェックボックス */
  SELECT_ALL: 'すべて選択',
  /** 視聴済みが1件も無いときの表示 */
  EMPTY: '整理できる視聴済みの作品がありません',
  /** キャンセルボタン */
  CANCEL: 'キャンセル',
  /** 削除ボタン: 「{件数}件を削除する」 */
  deleteButton: (count: number) => `${count}件を削除する`,
  /** 選択件数の表示: 「{件数}件を選択中」 */
  selectedCount: (count: number) => `${count}件を選択中`,
  /** 年セレクトの選択肢: 「{年}年（{件数}件）」 */
  yearOption: (year: number, count: number) => `${year}年（${count}件）`,
  /** お気に入り未登録の行に付ける印 */
  UNRATED_BADGE: '未評価',
  /**
   * お気に入り未登録がある年に出す注意書き
   *
   * 視聴済みにしても評価モーダルを閉じればお気に入りは未登録のまま残る。
   * その作品を消すと観たという記録がアプリ上に残らないため、削除前に知らせる。
   */
  unratedNotice: (count: number) =>
    `お気に入り未登録の${count}件は、削除すると視聴した記録が残りません`,
} as const;

/**
 * 「配信中」とみなす範囲の選択肢
 *
 * any      : 見放題・レンタル・購入のいずれかで観られる
 * flatrate : 見放題になったときだけ
 */
export const STREAMING_SCOPE_VALUES = ['any', 'flatrate'] as const;

/**
 * 「配信中」とみなす範囲
 */
export type StreamingScope = (typeof STREAMING_SCOPE_VALUES)[number];

/**
 * 初期値
 *
 * 実測では未視聴26件のうち見放題10件・レンタルのみ5件で、any にしても
 * 先頭が埋まりすぎることはなかった。バッジで形態を区別できるため
 * 含めても誤解させない。
 */
export const STREAMING_SCOPE_DEFAULT: StreamingScope = 'any';

/**
 * 配信範囲設定の表示ラベル
 */
export const WATCHLIST_STREAMING_SCOPE_LABELS = {
  /** 設定セクションの見出し */
  HEADING: '配信開始のお知らせ',
  /** 設定の説明 */
  DESCRIPTION:
    'ウォッチリストで「配信中」として扱う範囲を選べます。先頭に表示する対象と、カードのバッジに反映されます',
  /** any の選択肢 */
  ANY: 'レンタル・購入も含める',
  /** flatrate の選択肢 */
  FLATRATE: '見放題になったときだけ',
  /** ラジオグループの読み上げ名 */
  GROUP_ARIA: '配信開始のお知らせの対象',
  /** 更新成功 */
  UPDATED: '配信開始のお知らせを更新しました',
  /** 更新失敗 */
  UPDATE_FAILED: '配信設定の更新に失敗しました',
} as const;

/**
 * ウォッチリストのツールバーに出す、並びの説明
 */
export const WATCHLIST_STREAMING_HINT_LABELS = {
  /** ⓘ リンクの読み上げ名（設定ページへのリンクであることを伝える） */
  TRIGGER_ARIA: '並び順について。設定を開く',
  /** 本文（any のとき） */
  ANY: '配信中の作品を先頭に表示しています。見放題・レンタルが対象です。ここから設定を変更できます。',
  /** 本文（flatrate のとき） */
  FLATRATE:
    '配信中の作品を先頭に表示しています。見放題のみを対象にしているため、レンタルのみの作品にはバッジを出しません。ここから設定を変更できます。',
} as const;

/**
 * `movie_streaming_status` の行を「新しい」とみなす上限（ミリ秒）
 *
 * ウォッチリスト追加時（`initMovieStreamingStatus`）に、この期間より古い行は
 * TMDb へ引き直す。行の**有無**しか見ていなかった頃は、古い行が残っている
 * 作品で配信バッジの遅延が再発していた（#960）。
 *
 * ## なぜ行が陳腐化するか
 *
 * `movie_streaming_status` は作品単位の共有テーブルだが、日次Cron
 * （`syncWatchlistStreaming`）が更新するのは**誰かのウォッチリストに入っていて
 * 未視聴**の作品だけ。全員が視聴済みにする／削除すると以後は一切更新されず、
 * 取り残される期間に上限が無い。
 *
 * ## なぜ7日か
 *
 * Cron は毎日回るため、誰かのウォッチリストに入っている作品なら通常は
 * 1日で更新される。7日経っても更新されていない行は、その間どのウォッチリストにも
 * 入っていなかった可能性が高い。短くすると追加のたびにTMDbを引く頻度が上がり、
 * 長くすると陳腐化した行をそのまま使う窓が広がる。
 *
 * ⚠️ 「古い＝誰も持っていなかった」と断定はできない。Cron 側の事情でも
 * `checked_at` は進まない。
 *
 * - その作品だけ TMDb 問い合わせに失敗した（`syncWatchlistStreaming` は
 *   失敗分を upsert に含めない）
 * - upsert を最後に1回だけ実行するため、そこが失敗すると run 全体で0行
 * - `maxDuration` を使い切った
 *
 * つまり Cron の障害でも引き直し経路に入りうる。そのため再配信の判定は
 * この経路では抑止している（`initMovieStreamingStatus` のコメント参照）。
 */
export const STREAMING_STATUS_FRESH_MS = 7 * MS_PER_DAY;
