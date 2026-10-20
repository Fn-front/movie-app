/**
 * 人物ページ E2Eテスト
 *
 * 「映画詳細モーダル → キャスト → 人物ページ → 出演作 → 映画詳細モーダル」の
 * 一連のジャーニーと、未認証アクセス・存在しない人物の扱いを検証する。
 *
 * 表示内容は /api/person/:id と /api/movies/:id をモックして TMDb 非依存にする。
 * ただしページ本体（Server Component）の存在確認だけはサーバ側で TMDb を呼ぶため、
 * 実在が安定している PERSON_ID を使う。
 */

import { test, expect } from '@playwright/test';

import { movieTiles } from '../helpers/locators';
import { mockMovieDetail } from '../helpers/movieDetail';
import {
  MISSING_PERSON_ID,
  PERSON_ID,
  mockPersonDetail,
} from '../helpers/person';

/** 詳細モーダルに出すキャスト（人物ページへの導線） */
const CAST = [
  {
    id: PERSON_ID,
    name: 'E2Eテスト俳優',
    character: 'E2E役',
    profile_path: null,
    order: 0,
  },
];

test.describe('人物ページ', () => {
  test.beforeEach(async ({ page }) => {
    await mockMovieDetail(page, { credits: { cast: CAST } });
    await mockPersonDetail(page);
  });

  test('詳細モーダルのキャストから人物ページへ遷移し、出演作から映画詳細を開ける', async ({
    page,
  }) => {
    await page.goto('/movies/now-showing');
    await movieTiles(page).first().waitFor({ timeout: 30000 });

    // 映画詳細モーダルを開く
    await movieTiles(page).first().click();
    await expect(page.getByText('キャスト')).toBeVisible({ timeout: 15000 });

    // キャストから人物ページへ
    await page
      .getByRole('link', { name: 'E2Eテスト俳優のプロフィール' })
      .click();
    await page.waitForURL(`/person/${PERSON_ID}`);

    // プロフィールが表示される
    await expect(
      page.getByRole('heading', { level: 1, name: 'E2Eテスト俳優' }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('E2E用の略歴テキストです。')).toBeVisible();

    // 遷移元のモーダルは閉じている
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 出演作をクリックすると映画詳細モーダルが開く
    await expect(
      page.getByRole('heading', { name: '出演作品 2件' }),
    ).toBeVisible();
    await movieTiles(page).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  });

  test('未認証でも人物ページを閲覧できる', async ({ browser }) => {
    // storageState を持たない新しいコンテキストで開く
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await mockPersonDetail(page);

    await page.goto(`/person/${PERSON_ID}`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'E2Eテスト俳優' }),
    ).toBeVisible({ timeout: 20000 });
    // ログイン画面へリダイレクトされない
    expect(page.url()).toContain(`/person/${PERSON_ID}`);

    await context.close();
  });

  test('出演作が0件のときは空状態を表示する', async ({ page }) => {
    await mockPersonDetail(page, { cast: [] });

    await page.goto(`/person/${PERSON_ID}`);

    await expect(page.getByText('出演作品が登録されていません')).toBeVisible({
      timeout: 20000,
    });
  });

  test('存在しない人物IDは404ページになる', async ({ page }) => {
    const response = await page.goto(`/person/${MISSING_PERSON_ID}`);

    expect(response?.status()).toBe(404);
  });

  test('書式が不正な人物IDは404ページになる', async ({ page }) => {
    const response = await page.goto('/person/abc');

    expect(response?.status()).toBe(404);
  });
});
