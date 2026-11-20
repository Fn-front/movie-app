/**
 * @jest-environment node
 */

/**
 * CRON 名の突き合わせ（#979）
 *
 * ⚠️ 連投抑止の識別子は **CRON 名**（`rate_limits.identifier`）。
 * 1本でもディレクトリ名とずれると、**別の CRON とカウンタを共有して
 * 相手の通知まで止める**。1日1通なので、巻き込まれた側は丸一日黙る。
 *
 * ルートごとのテストでは9本のうち2本しか `CRON_SECRET` 未設定の分岐を
 * 持っておらず、`verifyCronAuth` へ渡す名前は誰も見ていなかった
 * （`'wrong-name'` に変えても全件緑になる状態だった）。
 * 各ルートに同じテストを7本足すより、ここで一度に突き合わせる。
 */

import fs from 'fs';
import path from 'path';

const CRON_DIR = path.join(process.cwd(), 'src', 'app', 'api', 'cron');

/** CRON 名を渡している3箇所 */
const CALLS: { label: string; pattern: RegExp }[] = [
  {
    label: 'verifyCronAuth',
    pattern: /verifyCronAuth\(\s*request,\s*'([^']+)'/g,
  },
  {
    label: 'handleCronError',
    pattern: /handleCronError\(\s*\n?\s*error,\s*\n?\s*'([^']+)'/g,
  },
  { label: 'notifyCronFailure', pattern: /cronName:\s*'([^']+)'/g },
];

const cronDirs = fs
  .readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('CRON 名とディレクトリ名の突き合わせ', () => {
  it('ルートを取りこぼしていない', () => {
    // 走査対象が0件でも全テストが緑になってしまうため、件数を押さえる
    expect(cronDirs.length).toBeGreaterThanOrEqual(10);
  });

  /**
   * ⚠️ **`vercel.json` に登録しないと、ルートがあっても一度も走らない。**
   *
   * スケジュールを消しても、消し忘れても、テストは1本も落ちなかった
   * （#1000 のレビューで実測）。`vercel.json` を読むテストが
   * リポジトリに1本も無かった。
   *
   * とくに `sync-upcoming` は止まると**新作が入ってこなくなる**経路で、
   * API 側のフォールバックは0件にならない限り発火しない。
   */
  it('すべての CRON ルートが vercel.json に登録されている', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: { path: string; schedule: string }[] };

    const scheduled = config.crons.map((cron) => cron.path).sort();
    const expected = cronDirs.map((dir) => `/api/cron/${dir}`).sort();

    // 落ちたら: ルートを足したなら vercel.json へ、
    //          消したなら vercel.json からも消す
    expect(scheduled).toEqual(expected);
  });

  // 同じ時刻に固まると TMDb のレート制限に当たりやすい
  it('スケジュールの書式が cron 式になっている', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { crons: { path: string; schedule: string }[] };

    for (const cron of config.crons) {
      expect(cron.schedule.split(' ')).toHaveLength(5);
    }
  });

  it.each(cronDirs)('%s は自分の名前だけを使う', (dir) => {
    const source = fs.readFileSync(
      path.join(CRON_DIR, dir, 'route.ts'),
      'utf8',
    );

    const found = CALLS.flatMap(({ label, pattern }) =>
      [...source.matchAll(pattern)].map((match) => `${label}: ${match[1]}`),
    );

    // 認証は必ず通すので、最低でも verifyCronAuth の1件はあるはず
    expect(found.length).toBeGreaterThan(0);

    // 落ちたら: ずれている呼び出しの名前をディレクトリ名に合わせる
    expect(found).toEqual(found.map(() => expect.stringMatching(`: ${dir}$`)));
  });

  /**
   * ⚠️ 認証を通さないルートがあると、そこだけ誰でも叩ける。
   * `verifyCronAuth` の呼び出し漏れをここで止める。
   */
  it.each(cronDirs)('%s は verifyCronAuth を呼んでいる', (dir) => {
    const source = fs.readFileSync(
      path.join(CRON_DIR, dir, 'route.ts'),
      'utf8',
    );

    expect(source).toMatch(/await verifyCronAuth\(/);
  });
});
