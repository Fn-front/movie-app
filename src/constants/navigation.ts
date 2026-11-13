/**
 * ナビゲーション関連の定数
 */

import type { IconType } from 'react-icons';
import {
  IoBookmarkOutline,
  IoCalendarOutline,
  IoFilmOutline,
  IoHeartOutline,
  IoHomeOutline,
  IoPlayCircleOutline,
  IoTrophyOutline,
} from 'react-icons/io5';

import { ROUTES } from './common';

/**
 * ナビゲーションアイテムの型（アイコンなし）
 */
export interface NavItemBase {
  /** ラベル */
  label: string;
  /** リンク先パス */
  href: string;
}

/**
 * ナビゲーション項目（サイドナビ・ドロワー・ボトムナビの共通の真実源）
 *
 * ⚠️ `NavItemBase[]` と**型注釈しない**。注釈すると `href` が `string` に
 * 広がり、`NAV_ICON_MAP` の「全行き先にアイコンが要る」という型が
 * `Record<string, …>` と同じになって効かなくなる（#1020）。
 * `satisfies` なら形を検査しつつリテラル型を残せる。
 *
 * ⚠️ `readonly` になるので、`NavItemBase[]` を取る関数へ渡すと型が合わない。
 * 受け取る側のシグネチャを `readonly NavItemBase[]` にすること。
 */
export const NAV_ITEMS = [
  { label: '公開予定', href: ROUTES.UPCOMING },
  { label: '公開中', href: ROUTES.NOW_SHOWING },
  { label: 'お気に入り', href: ROUTES.FAVORITES },
  { label: 'ウォッチリスト', href: ROUTES.WATCHLIST },
  { label: '受賞作品', href: ROUTES.AWARDS },
  { label: 'シアター体験', href: ROUTES.THEATER_EXPERIENCE },
] as const satisfies readonly NavItemBase[];

/**
 * アイコンを用意しなければならない行き先
 *
 * ドロワーは `NAV_ITEMS` 全部に、ボトムナビはそこへホームを足した集合から
 * 選んで出す。`NAV_ICON_MAP` をこの型で縛ることで、**ナビ項目を足して
 * アイコンを定義し忘れるとコンパイルエラーになる**（#1020）。
 */
export type NavIconRoute =
  | typeof ROUTES.HOME
  | (typeof NAV_ITEMS)[number]['href'];

/**
 * ルートごとのナビゲーションアイコン
 *
 * ドロワーとボトムナビが同じ行き先に同じ絵を使うための真実源。片方だけ
 * 差し替わると、同じ SP 画面で同じ行き先が別の絵になり覚え直しが要る。
 *
 * 要素ではなく**コンポーネント**を持つ。サイズは表示側が `ICON_SIZES` から
 * 決めるので、ここで固定すると使い回せない（この定数は `.ts` なので
 * JSX も書けない）。
 *
 * ⚠️ キーは `NavIconRoute` で**全行き先必須**にしてある。`NAV_ITEMS` に
 * 項目を足したらここにも足さないとビルドが通らない。`Record<string, …>` に
 * 緩めると、受賞作品とシアター体験だけアイコンが無かった状態（#1020）へ
 * 黙って戻る。
 */
export const NAV_ICON_MAP: Record<NavIconRoute, IconType> = {
  [ROUTES.HOME]: IoHomeOutline,
  [ROUTES.UPCOMING]: IoCalendarOutline,
  [ROUTES.NOW_SHOWING]: IoPlayCircleOutline,
  [ROUTES.FAVORITES]: IoHeartOutline,
  [ROUTES.WATCHLIST]: IoBookmarkOutline,
  [ROUTES.AWARDS]: IoTrophyOutline,
  [ROUTES.THEATER_EXPERIENCE]: IoFilmOutline,
};

/**
 * メニューアクション項目ラベル
 */
export const MENU_LABELS = {
  CALENDAR: '公開カレンダー',
  SETTINGS: '設定',
  /** admin ロールのみに表示するアカウント管理画面への導線 */
  ADMIN_ACCOUNTS: 'アカウント管理',
  /** admin ロールのみに表示する受賞作品同期画面への導線 */
  ADMIN_AWARD_SYNC: '受賞作品の同期',
  LOGOUT: 'ログアウト',
  LOGIN: 'ログイン',
  DARK_MODE: 'ダークモード',
} as const;

/**
 * 保護ルートをナビゲーションから開こうとした際の、未認証ユーザー向け誘導メッセージ。
 * 「保護対象かどうか」の判定は AUTH_REQUIRED_ROUTES が真実源であり、ここは表示文言のみ。
 * AUTH_REQUIRED_ROUTES のうちナビに出るルートはここに文言を用意し、
 * 未定義のルートは NAV_AUTH_PROMPT_DEFAULT_MESSAGE にフォールバックする。
 */
export const NAV_AUTH_PROMPT_MESSAGES: Record<string, string> = {
  [ROUTES.FAVORITES]: 'お気に入りを見るにはログインが必要です。',
  [ROUTES.WATCHLIST]: 'ウォッチリストを見るにはログインが必要です。',
  [ROUTES.THEATER_EXPERIENCE]: 'シアター体験を見るにはログインが必要です。',
};

/** 保護ルート用メッセージが未定義の場合のデフォルト誘導文言 */
export const NAV_AUTH_PROMPT_DEFAULT_MESSAGE =
  'このページを見るにはログインが必要です。';
