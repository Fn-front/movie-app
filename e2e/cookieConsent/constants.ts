/**
 * GA 有効 E2E の定数（#931）
 *
 * `playwright.ga.config.ts` と spec の双方から読むため、config 本体ではなく
 * ここに置く。spec が config を import すると、ワーカープロセスで config が
 * 再評価されるうえ、config ↔ spec の循環参照になる。
 */

/**
 * E2E 専用のダミー測定ID
 *
 * 実在の GA4 プロパティを指さない。`src/utils/analytics.ts` の
 * `MEASUREMENT_ID_PATTERN`（`/^G-[A-Z0-9]{6,20}$/`）を満たす必要がある。
 *
 * gtag.js は**未登録のIDでも 200 を返して動作し**、`_ga` と
 * `_ga_<`G-` を除いた部分>` を書く。そのため Cookie の検証はダミーIDで成立する。
 * 収集ビーコンは `fixtures.ts` が遮断するので、このIDのヒットが実際に Google へ
 * 飛ぶことはない。
 *
 * ⚠️ CI では `.github/workflows/e2e.yml` の build step が同じ値を
 * `NEXT_PUBLIC_GA_ID` として渡している（`NEXT_PUBLIC_*` はビルド時に静的置換
 * されるため、`webServer.env` では `npm start` に効かない）。ずれると
 * 「`_ga_TEST1234567` を期待したのに別名が来た」という分かりにくい落ち方を
 * するので、`consentBootstrap.spec.ts` が読み込まれた gtag.js のURLと
 * 突き合わせて早期に気づけるようにしている。
 */
export const E2E_GA_MEASUREMENT_ID = 'G-TEST1234567';

/**
 * GA が置く Cookie の名前
 *
 * `_ga_<コンテナID>` のコンテナIDは測定IDから `G-` を除いた部分
 * （`G-TEST1234567` → `_ga_TEST1234567`）。
 */
export const GA_COOKIE_NAMES = [
  '_ga',
  `_ga_${E2E_GA_MEASUREMENT_ID.slice('G-'.length)}`,
].sort();
