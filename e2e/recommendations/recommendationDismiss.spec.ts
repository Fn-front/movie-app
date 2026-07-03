/**
 * おすすめカードからの「興味なし」登録 E2Eテスト（認証済み）
 *
 * dismiss は OpenAI/TMDb に依存せず DB へ1行追加するだけのため、
 * 実API（/api/dismissed-movies）を通しで検証する。おすすめセクションは
 * SSR 表示のため、事前に service role で お気に入り＋おすすめ をシードする。
 *
 * ユーザーストーリー網羅:
 * - 正常系: おすすめカードの「興味なし」→ 成功トースト＋そのタイルがグリッドから消える
 * - 全行程/状態保持: 登録した映画が設定ページの興味なし一覧に永続表示され、解除できる
 */

import { test, expect } from '../fixtures/auth';
import {
  seedRecommendations,
  cleanupRecommendations,
  cleanupDismissedMovies,
} from '../helpers/api';

test.describe.configure({ mode: 'serial' });

test.describe('おすすめカードからの興味なし登録（認証済み）', () => {
  test.beforeEach(async () => {
    await cleanupDismissedMovies();
    await cleanupRecommendations();
    await seedRecommendations();
  });

  test.afterAll(async () => {
    await cleanupDismissedMovies();
    await cleanupRecommendations();
  });

  test('「興味なし」クリックで成功トーストが出てグリッドから消える', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
    await expect(section).toBeVisible({ timeout: 15000 });

    // 2件シードされている
    await expect(section.getByRole('listitem')).toHaveCount(2);

    // 「E2Eおすすめ1」の興味なしボタンをクリック
    const item1 = section
      .getByRole('listitem')
      .filter({ hasText: 'E2Eおすすめ1' });
    await item1.getByRole('button', { name: '興味なし' }).click();

    // 成功トースト（本体とaria-liveで2要素のため first）
    await expect(
      page.getByText('興味なしリストに追加しました').first(),
    ).toBeVisible();

    // 興味なしにした映画はグリッドから消え、もう一方は残る
    await expect(
      section.getByRole('listitem').filter({ hasText: 'E2Eおすすめ1' }),
    ).toHaveCount(0);
    await expect(
      section.getByRole('listitem').filter({ hasText: 'E2Eおすすめ2' }),
    ).toHaveCount(1);
  });

  test('登録した映画が設定ページの興味なし一覧に表示され、解除できる', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const section = page.getByRole('region', { name: 'あなたへのおすすめ' });
    await expect(section).toBeVisible({ timeout: 15000 });

    const item1 = section
      .getByRole('listitem')
      .filter({ hasText: 'E2Eおすすめ1' });
    await item1.getByRole('button', { name: '興味なし' }).click();
    await expect(
      page.getByText('興味なしリストに追加しました').first(),
    ).toBeVisible();

    // 設定ページに遷移すると、実DB経由で興味なし一覧に反映されている
    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { name: '興味なし一覧' }),
    ).toBeVisible();
    await expect(page.getByText('E2Eおすすめ1')).toBeVisible();

    // 興味なしを解除すると一覧から消える
    await page
      .getByRole('button', { name: 'E2Eおすすめ1の興味なしを解除' })
      .click();
    await expect(
      page.getByText('興味なしリストから削除しました').first(),
    ).toBeVisible();
    await expect(page.getByText('E2Eおすすめ1')).not.toBeVisible();
  });
});
