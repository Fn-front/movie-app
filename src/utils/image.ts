/**
 * 画像URLユーティリティ
 */

import { API } from '@/constants';

// 画像サイズ型定義
export type TMDbImageSize =
  | 'w92'
  | 'w154'
  | 'w185'
  | 'w342'
  | 'w500'
  | 'w780'
  | 'original';

/**
 * TMDb画像のURLを生成
 *
 * @param path - 画像パス（TMDb APIから取得）
 * @param size - 画像サイズ（デフォルト: w500）
 * @returns 完全なTMDb画像URL、またはnull
 *
 * @example
 * ```ts
 * const posterUrl = getTMDbImageUrl('/abc123.jpg', 'w500');
 * // => 'https://image.tmdb.org/t/p/w500/abc123.jpg'
 *
 * const backdropUrl = getTMDbImageUrl('/xyz789.jpg', 'original');
 * // => 'https://image.tmdb.org/t/p/original/xyz789.jpg'
 * ```
 */
export function getTMDbImageUrl(
  path: string | null | undefined,
  size: TMDbImageSize = 'w500',
): string | null {
  if (!path) return null;

  return `${API.TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

/**
 * TMDbポスター画像URLを生成（w500固定）
 *
 * @param path - ポスター画像パス
 * @returns ポスター画像URL、またはnull
 */
export function getTMDbPosterUrl(
  path: string | null | undefined,
): string | null {
  return getTMDbImageUrl(path, 'w500');
}

/**
 * TMDbバックドロップ画像URLを生成（original固定）
 *
 * @param path - バックドロップ画像パス
 * @returns バックドロップ画像URL、またはnull
 */
export function getTMDbBackdropUrl(
  path: string | null | undefined,
): string | null {
  return getTMDbImageUrl(path, 'original');
}

/**
 * TMDbプロフィール画像URLを生成（w185固定）
 *
 * @param path - プロフィール画像パス
 * @returns プロフィール画像URL、またはnull
 */
export function getTMDbProfileUrl(
  path: string | null | undefined,
): string | null {
  return getTMDbImageUrl(path, 'w185');
}

/**
 * TMDbプロバイダーロゴ画像URLを生成（w154固定）
 *
 * @param path - ロゴ画像パス
 * @returns ロゴ画像URL、またはnull
 */
export function getTMDbProviderLogoUrl(
  path: string | null | undefined,
): string | null {
  return getTMDbImageUrl(path, 'w154');
}

/**
 * プレースホルダー画像URLを生成
 *
 * @param width - 幅
 * @param height - 高さ
 * @param text - 表示テキスト（オプション）
 * @returns プレースホルダー画像URL
 */
export function getPlaceholderImageUrl(
  width: number,
  height: number,
  text?: string,
): string {
  const displayText = text || `${width}x${height}`;
  return `https://placehold.co/${width}x${height}?text=${encodeURIComponent(displayText)}`;
}
