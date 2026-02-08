/**
 * 見出しコンポーネント
 */

import { memo, type HTMLAttributes, type ElementType } from 'react';

import styles from './heading.module.scss';

/**
 * 見出しレベル
 */
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * テキスト配置
 */
type HeadingAlign = 'left' | 'center' | 'right';

/**
 * Headingコンポーネントのプロパティ
 */
export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** 見出しレベル（1-6） */
  level?: HeadingLevel;
  /** テキスト配置 */
  align?: HeadingAlign;
}

const levelStyleMap: Record<HeadingLevel, string> = {
  1: styles.c_heading__level__1,
  2: styles.c_heading__level__2,
  3: styles.c_heading__level__3,
  4: styles.c_heading__level__4,
  5: styles.c_heading__level__5,
  6: styles.c_heading__level__6,
};

const alignStyleMap: Record<HeadingAlign, string> = {
  left: styles.c_heading__align__left,
  center: styles.c_heading__align__center,
  right: styles.c_heading__align__right,
};

/**
 * 見出しコンポーネント
 *
 * @example
 * ```tsx
 * <Heading level={1} align="center">ログイン</Heading>
 * <Heading level={2}>映画一覧</Heading>
 * ```
 */
export const Heading = memo(function Heading({
  level = 1,
  align = 'left',
  className,
  children,
  ...props
}: HeadingProps) {
  const Tag: ElementType = `h${level}`;

  const classNames = [
    styles.c_heading,
    levelStyleMap[level],
    alignStyleMap[align],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classNames} {...props}>
      {children}
    </Tag>
  );
});

Heading.displayName = 'Heading';
