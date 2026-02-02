/**
 * Avatarコンポーネント
 */

'use client';

import { type ImgHTMLAttributes, memo, useState, useCallback } from 'react';
import Image from 'next/image';

import styles from './avatar.module.scss';

/**
 * Avatarのサイズ型
 */
export type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * Avatarコンポーネントのプロパティ
 */
export interface AvatarProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'width' | 'height'
> {
  /** 画像URL */
  src?: string | null;
  /** 代替テキスト */
  alt: string;
  /** サイズ */
  size?: AvatarSize;
  /** 画像がない場合の表示文字 */
  fallback?: string;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Avatarコンポーネント
 *
 * @example
 * ```tsx
 * <Avatar
 *   src={user.avatar_url}
 *   alt={user.name}
 *   size="md"
 *   fallback={user.name.charAt(0)}
 * />
 * ```
 */
export const Avatar = memo<AvatarProps>(function Avatar({
  src,
  alt,
  size = 'md',
  fallback,
  className,
  ...props
}) {
  const [imageError, setImageError] = useState(false);

  const handleError = useCallback(() => {
    setImageError(true);
  }, []);

  const showFallback = !src || imageError;

  const classNames = [
    styles.c_avatar,
    styles[`c_avatar__size__${size}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const sizeMap: Record<AvatarSize, number> = {
    sm: 32,
    md: 40,
    lg: 64,
  };

  const imageSize = sizeMap[size];

  return (
    <div className={classNames} role='img' aria-label={alt}>
      {showFallback ? (
        <span className={styles.c_avatar__fallback} aria-hidden='true'>
          {fallback || alt.charAt(0).toUpperCase()}
        </span>
      ) : (
        <Image
          src={src!}
          alt={alt}
          width={imageSize}
          height={imageSize}
          className={styles.c_avatar__image}
          onError={handleError}
          {...props}
        />
      )}
    </div>
  );
});

Avatar.displayName = 'Avatar';
