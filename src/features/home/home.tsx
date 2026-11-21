/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント（Server Component）
 */

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { NowShowingMovieList } from '@/features/nowShowing/component/nowShowingMovieList/nowShowingMovieList';
import { RecommendationSection } from '@/features/recommendations/component/recommendationSection/recommendationSection';
import type { NowShowingMovie } from '@/lib/types';

/**
 * HomePageコンポーネントのプロパティ
 */
export interface HomePageProps {
  /** 劇場公開中の人気映画一覧 */
  nowShowingMovies: NowShowingMovie[];
}

/**
 * HomePageコンポーネント
 *
 * ⚠️ **cookie を読む処理をこのツリーに持ち込まないこと。** 1箇所でも
 * `auth()` を呼ぶとルート全体が動的になり、ホームへの遷移が毎回
 * サーバー往復になる（他の静的タブの約10倍 / #1115）。
 * 認証が要る表示はクライアント側（`RecommendationSection`）に閉じてある。
 */
export function HomePage({ nowShowingMovies }: HomePageProps) {
  return (
    <AppLayout>
      {/*
        ホームは複数セクションの集合で「見出しに相当する可視の文言」が無いため、
        スクリーンリーダー向けにのみ h1 を置く。これが無いとページの主題が
        見出しから辿れない（axe: page-has-heading-one）。
      */}
      <h1 className='sr-only'>ホーム</h1>
      <NowShowingMovieList movies={nowShowingMovies} />
      <RecommendationSection />
      {/*
        詳細モーダルはここに置かない。アプリ全体で `AppLayout` の1つだけ
        （#1077）。`useSearchParams` を読む `<Suspense>` もそちらへ移った
      */}
    </AppLayout>
  );
}
