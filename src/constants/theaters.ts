/**
 * シアター体験関連の定数
 */

export const THEATER_MESSAGES = {
  /** ページタイトル */
  PAGE_TITLE: 'シアター体験',
  /** 取得エラー */
  FETCH_ERROR: '劇場データの取得に失敗しました',
  /** 劇場未検出 */
  NOT_FOUND: '指定された劇場が見つかりません',
  /** 座席選択ヒント */
  SELECT_SEAT: '座席をクリックして体験を開始',
  /** バリデーションエラー */
  INVALID_SLUG: '不正な劇場IDです',
} as const;

/** デフォルト劇場slug */
export const DEFAULT_THEATER_SLUG = 'standard-medium';

/** 劇場一覧SELECTカラム */
export const THEATERS_LIST_SELECT =
  'id, name, slug, format, audio_layout, description';

/** 劇場詳細SELECTカラム */
export const THEATERS_DETAIL_SELECT =
  'id, name, slug, format, room_width, room_depth, room_height, screen_width, screen_height, screen_center_x, screen_center_y, screen_center_z, audio_layout, description';

/** 座席SELECTカラム */
export const THEATER_SEATS_SELECT =
  'id, row_label, seat_number, position_x, position_y, position_z, seat_type';

/** スピーカーSELECTカラム */
export const THEATER_SPEAKERS_SELECT =
  'id, channel, position_x, position_y, position_z, power_watts, direction_x, direction_y, direction_z, directivity_alpha';

/** 劇場データのキャッシュ有効期間（秒）。API Cache-Control と React Query staleTime の単一ソース */
export const THEATER_CACHE_MAX_AGE_SECONDS = 3600;

/** キャッシュヘッダー（認証済みユーザー向け） */
export const THEATER_CACHE_CONTROL = `private, max-age=${THEATER_CACHE_MAX_AGE_SECONDS}`;

/** React Query の staleTime（Cache-Control と一致, ミリ秒） */
export const THEATER_STALE_TIME_MS = THEATER_CACHE_MAX_AGE_SECONDS * 1000;

/** 選択中の劇場を保持するURLクエリのキー */
export const THEATER_QUERY_PARAM = 'theater';
