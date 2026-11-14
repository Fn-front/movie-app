/**
 * ホーム（`/`）のページ テスト
 *
 * ⚠️ このページの要点は**静的プリレンダのままであること**（#1115）。
 * cookie を読む処理が1つでも混ざると ƒ（動的）に戻り、遷移のたびに
 * サーバー往復が発生する。ビルド出力は jest からは見えないので、
 * 戻る原因になりうる点をここで固定する。
 */

import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import { NOW_SHOWING_REVALIDATE_SECONDS } from '@/constants';

import Home, { revalidate, metadata } from './page';

// --- Mocks ---

const mockGetNowShowingMovies = jest.fn();
jest.mock('@/lib/api/nowShowing/nowShowing.server', () => ({
  getNowShowingMovies: () => mockGetNowShowingMovies(),
}));

jest.mock('@/features/home/home', () => ({
  HomePage: ({ nowShowingMovies }: { nowShowingMovies: unknown[] }) => (
    <div data-testid='home-page' data-count={nowShowingMovies.length} />
  ),
}));

// --- Helpers ---

/**
 * ページの実装（コメントを除いたもの）
 *
 * コメントには「`auth()` を戻すな」と書いてあるので、素のまま照合すると
 * 注意書き自体に当たってしまう
 */
const pageCode = fs
  .readFileSync(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// --- Tests ---

describe('Home page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNowShowingMovies.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
  });

  it('公開中の映画をサーバーで取って渡す', async () => {
    render(await Home());

    expect(screen.getByTestId('home-page')).toHaveAttribute('data-count', '2');
    expect(mockGetNowShowingMovies).toHaveBeenCalledTimes(1);
  });

  it('メタデータを持つ', () => {
    expect(metadata.title).toBe('ホーム | Movie App');
  });

  /**
   * `revalidate` は Next.js が静的に解析するため、定数を import して
   * 代入できない（`Invalid segment configuration export detected`）。
   * リテラルで書くしかないので、定数とのずれをここで止める
   */
  it('revalidate が公開中キャッシュの間隔と一致している', () => {
    expect(revalidate).toBe(NOW_SHOWING_REVALIDATE_SECONDS);
  });

  /**
   * ⚠️ `auth()` を呼ぶとルート全体が ƒ に戻る。
   * props で受け渡す形へ「戻してしまう」改修を止めるための番人
   */
  it('cookie を読む処理を呼んでいない', () => {
    expect(pageCode).not.toMatch(/from '@\/lib\/auth\/auth'/);
    expect(pageCode).not.toMatch(/\bauth\(\)/);
    expect(pageCode).not.toMatch(/next\/headers/);
    expect(pageCode).not.toMatch(/getRecommendations/);
  });
});
