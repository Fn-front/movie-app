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
 * HTMLタグを除去する
 *
 * `<` を見つけたら対応する `>` までを捨てる。`>` が見つからない場合は
 * `<` だけを捨てて走査を続ける。**戻り値に `<` は残らない。**
 *
 * ⚠️ **正規表現（`/<[^>]*>/g`）で書かないこと。** 挙動は同じだが、CodeQL の
 *    `js/incomplete-multi-character-sanitization`（high）が「多文字を一度だけ
 *    置換するサニタイザ」として high で指摘する。`a<script` のように閉じ `>` が
 *    無い入力で `<script` が残るのがその理由。
 *
 *    ルール本文が示す代替（`/<|>/g` で1文字ずつ落とす）は、タグの中身が本文に
 *    残るため使えない（`<a href="x">題名</a>` → `a href="x"題名/a`）。
 *    `sanitize-html` の導入は「不要な外部依存を追加しない」方針に反する。
 *    そこで置換ではなく走査にして、構造ごと解消している。
 *
 * 入れ子でもタグは組み上がらない。`A<<b>script>B` は最初の `<` から
 * 最初の `>` までを捨てて `Ascript>B` になる（PR #837 で実測した挙動と同じ）。
 */
function stripHtmlTags(raw: string): string {
  let result = '';
  let index = 0;

  while (index < raw.length) {
    if (raw[index] !== '<') {
      result += raw[index];
      index += 1;
      continue;
    }

    const closingIndex = raw.indexOf('>', index + 1);

    // 閉じ `>` が無いタグは `<` だけ捨てて中身はテキストとして残す
    index = closingIndex === -1 ? index + 1 : closingIndex + 1;
  }

  return result;
}

/**
 * HTMLタグとエンティティを除去してテキストを取得
 *
 * ⚠️ 連続空白は畳まない。呼び出し側で必要に応じて行うこと。ここで畳むと
 *    `fetchEigaOscarAwards` の既存の抽出結果が変わる。
 */
export function cleanHtmlText(raw: string): string {
  return decodeHtmlEntities(
    stripHtmlTags(raw)
      .replace(/&nbsp;/g, '')
      .trim(),
  );
}
