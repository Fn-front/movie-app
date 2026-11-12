/**
 * 映画が見つからないときの 404 表示
 *
 * ルート直下の not-found.tsx でも 404 は出せるが、それだと本文だけの素の画面に
 * なりヘッダー・サイドバーが消える。セグメントに境界を置くと movies/layout.tsx の
 * 内側で差し替わるため、ナビゲーションを保ったまま映画向けの文言を出せる。
 * 既定の 404 UI がアプリのテーマを読まない問題（#1013）も踏まずに済む。
 */

import Link from 'next/link';

import { ROUTES } from '@/constants';

import styles from './notFound.module.scss';

export default function MovieNotFound() {
  return (
    <div className={styles.c_movie_not_found}>
      <h1 className={styles.c_movie_not_found__code}>404</h1>
      <h2 className={styles.c_movie_not_found__title}>映画が見つかりません</h2>
      <p className={styles.c_movie_not_found__message}>
        指定された映画は存在しないか、公開対象ではありません。
      </p>
      <Link href={ROUTES.HOME} className={styles.c_movie_not_found__link}>
        ホームに戻る
      </Link>
    </div>
  );
}
