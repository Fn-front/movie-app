/**
 * 人物（俳優・スタッフ）関連の定数
 */

import { errorMessage } from './common';

/** メッセージ共通の対象名 */
const TARGET = '人物情報';

/**
 * 人物APIのエラーメッセージ
 */
export const PERSON_ERROR_MESSAGES = {
  /** 人物ID不正 */
  INVALID_PERSON_ID: errorMessage.invalid('人物ID'),
  /** 人物未検出 */
  NOT_FOUND: errorMessage.notFound('人物'),
  /** 取得失敗（クライアント表示用） */
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
} as const;

/**
 * 演技ではないクレジットを示す役名のパターン
 *
 * TMDb の `movie_credits.cast` は演技クレジットと本人出演を区別しない。
 * メイキング映像やドキュメンタリーへの本人出演、アーカイブ映像の使用も
 * すべて cast として返るため、役名から判別する。
 * クリスチャン・ベールでは78件中22件がこの形だった。
 *
 * ⚠️ `/self/i` の部分一致では判定できない。『アバター』の
 * Parker Selfridge（34,930票）のような実在の役名が巻き込まれるため、
 * 単語境界を必ず見ること。
 *
 *   Self / Self - Actor / Self - Gorr / Himself / Herself   → 除外
 *   Batman (archive footage) / (Archive footage)            → 除外
 *   Parker Selfridge / Selfridge                            → 残す
 */
export const PERSON_NON_ACTING_CHARACTER_PATTERN =
  /^(self|himself|herself)\b|\bas (self|himself|herself)\b|\barchive footage\b/i;

/**
 * 人物ページの表示メッセージ
 */
export const PERSON_MESSAGES = {
  /** 略歴の見出し */
  BIOGRAPHY_HEADING: '略歴',
  /** 略歴が未登録のとき */
  BIOGRAPHY_EMPTY: '略歴は登録されていません',
  /** 日本語の略歴が無く英語原文を表示しているときの注記 */
  BIOGRAPHY_FALLBACK_NOTE:
    '日本語の略歴が未登録のため、英語の原文を表示しています',
  /** 略歴の展開ボタン */
  BIOGRAPHY_EXPAND: '続きを読む',
  /** 略歴の折りたたみボタン */
  BIOGRAPHY_COLLAPSE: '折りたたむ',
  /** 出演作品一覧の見出し */
  FILMOGRAPHY_HEADING: '出演作品',
  /** 出演作品が0件のとき */
  FILMOGRAPHY_EMPTY_TITLE: '出演作品が登録されていません',
  /** 出演作品が0件のときの補足 */
  FILMOGRAPHY_EMPTY_DESCRIPTION:
    'TMDbに出演作品の情報が登録されると表示されます',
  /** 生年月日のラベル */
  BIRTHDAY_LABEL: '生年月日',
  /** 出生地のラベル */
  PLACE_OF_BIRTH_LABEL: '出生地',
  /** 没年月日を併記するときの区切り */
  LIFESPAN_SEPARATOR: ' – ',
  /** 取得失敗時の再試行ボタン */
  RETRY: '再読み込み',
} as const;

/**
 * TMDb の `known_for_department` の日本語ラベル。
 *
 * TMDb は英語の部門名しか返さないため、表示用にここで対応付ける。
 * 未知の値はそのまま表示する（増えても壊れないようにするため）。
 */
export const PERSON_DEPARTMENT_LABELS: Record<string, string> = {
  Acting: '俳優',
  Directing: '監督',
  Writing: '脚本',
  Production: '製作',
  Sound: '音響',
  Camera: '撮影',
  Editing: '編集',
  Art: '美術',
  'Costume & Make-Up': '衣装・メイク',
  'Visual Effects': 'VFX',
  Crew: 'スタッフ',
  Lighting: '照明',
  Actors: '俳優',
};

/**
 * 出演作品一覧の1ページあたりの表示件数。
 *
 * TMDb の `movie_credits` はページングが無く全件を一括で返すため、
 * ページングはクライアント側で行う。
 */
export const PERSON_FILMOGRAPHY_PAGE_SIZE = 20;

/**
 * 略歴に「続きを読む」を出す文字数のしきい値。
 *
 * 実際の折り返し行数はフォント・画面幅で変わるため DOM 計測が要るが、
 * 計測のためだけに ref とリサイズ監視を持ち込むと複雑さに見合わない。
 * 折りたたみ行数（personProfile.module.scss の line-clamp = 5行）に
 * 収まらないことがほぼ確実な文字数で代用する。
 */
export const PERSON_BIOGRAPHY_CLAMP_CHARS = 200;

/**
 * 人物情報のキャッシュ秒数（24時間）。
 *
 * 人物プロフィールは頻繁に変わらない。API の `Cache-Control`（s-maxage）と
 * サーバー側 `unstable_cache` の revalidate を同じ値で揃える。
 */
export const PERSON_REVALIDATE_SECONDS = 86400;

/**
 * React Query の staleTime（Cache-Control と一致, ミリ秒）
 */
export const PERSON_STALE_TIME_MS = PERSON_REVALIDATE_SECONDS * 1000;
