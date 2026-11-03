/**
 * スクレイピングしたHTML断片をテキストへ均すユーティリティ
 *
 * eiga.com の賞ページ用パーサ（`fetchEigaOscarAwards` /
 * `fetchEigaGoldenGlobes`）が共有する。ページのレイアウトは賞で違うが、
 * タグ除去とエンティティ復号の扱いは共通のため。
 */

/**
 * 名前付きHTMLエンティティの対応表
 *
 * `&nbsp;` は含めない。`cleanHtmlText` がデコード前に削除しており、
 * ここで空白へ変換すると挙動が変わるため。
 */
const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Unicode のコードポイントの上限 */
const MAX_CODE_POINT = 0x10ffff;

/**
 * コードポイントを文字へ変換する。範囲外なら元の表記をそのまま返す
 *
 * `String.fromCodePoint` は範囲外の値で例外を投げる。スクレイピング対象の
 * 不正なマークアップで同期処理全体を落とさないため、ここで吸収する。
 */
function fromCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0) return fallback;
  if (codePoint > MAX_CODE_POINT) return fallback;

  return String.fromCodePoint(codePoint);
}

/**
 * HTMLエンティティをデコードする
 *
 * **1回の走査で完結させる**こと。段階的に置換すると二重にデコードしてしまう。
 * 例えば数値参照を先に処理してから `&amp;` を `&` に変える実装では、
 * `&amp;lt;` が `&lt;`（文字列としての "&lt;"）ではなく `<` になる。
 *
 * `String.prototype.replace` は置換結果を再走査しないため、全パターンを
 * 1つの正規表現で受ければ各エンティティはちょうど1回だけデコードされる。
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g,
    (matched, decimal?: string, hex?: string, name?: string) => {
      if (decimal !== undefined) {
        return fromCodePoint(Number(decimal), matched);
      }

      if (hex !== undefined) {
        return fromCodePoint(parseInt(hex, 16), matched);
      }

      // 未知の名前付きエンティティは元の文字列のまま残す（壊さない）
      return NAMED_HTML_ENTITIES[name!.toLowerCase()] ?? matched;
    },
  );
}

/**
 * HTMLタグとエンティティを除去してテキストを取得
 *
 * タグ除去は1回の置換で完結する。`[^>]*` が各 `<` から最初の `>` までを貪欲に
 * 消すため、`>` が後続する `<` は必ず同じ走査で一緒に消費される。走査後に残る
 * `<` には後続の `>` が無く、`A<<b>script>B` のような入れ子でもタグが組み上がって
 * 残ることはない（`Ascript>B` になる）。繰り返し適用しても結果は変わらないため
 * ループは設けない。
 *
 * ⚠️ **残った `<` も落とす。** `a<script` のように閉じ `>` が無い入力では
 *    タグ除去の正規表現が一致せず、`<script` が出力に残る。この関数の戻り値は
 *    プレーンテキストとして扱われる前提なので、markup の開始記号を残さない。
 *    CodeQL の `js/incomplete-multi-character-sanitization` が指摘するのもここ。
 *
 * ⚠️ **落とすのは `decodeHtmlEntities` より前。** 順序を逆にすると
 *    `&lt;` 由来の正当な `<` まで消える。
 *
 * ⚠️ 連続空白は畳まない。呼び出し側で必要に応じて行うこと。ここで畳むと
 *    `fetchEigaOscarAwards` の既存の抽出結果が変わる。
 */
export function cleanHtmlText(raw: string): string {
  return decodeHtmlEntities(
    raw
      .replace(/<[^>]*>/g, '')
      .replace(/</g, '')
      .replace(/&nbsp;/g, '')
      .trim(),
  );
}
