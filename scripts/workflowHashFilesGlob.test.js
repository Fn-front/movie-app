/**
 * ワークフローの `hashFiles()` が意図した範囲を見ているかの検査（#1082）
 *
 * `**` は**パスセグメント全体として書いたときだけ**「任意の深さ」を意味する。
 * `'**.ts'` は1セグメント内のパターンなので、**リポジトリ直下にしか当たらない**。
 *
 *     hashFiles('**.[jt]s', '**.[jt]sx')   ← 直下の5ファイルだけ
 *     hashFiles('**\/*.ts')                ← 任意の深さ
 *
 * これが `.next/cache` のキーに入っていたため、`src/` を100ファイル以上
 * 書き換えてもキーが変わらず、無関係なブランチが同じアーカイブを
 * 共有していた（実測: `feature/sp-bottom-nav` と
 * `feature/movie-detail-route-phase2` が同一キー）。
 *
 * ⚠️ **間違っていても何も起きない**のが厄介なところ。ビルドは通るし
 * キャッシュもヒットするので、キーの式を読み違えたまま CI の調査を
 * 進めてしまう（#787 / #1080 で実際に前提を誤った）。
 * grep で機械的に止める。
 */

const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const WORKFLOW_DIR = join(__dirname, '..', '.github', 'workflows');

/**
 * `hashFiles(...)` の中に書かれたグロブを1つずつ取り出す
 *
 * ⚠️ **コメント行は除く。** 「以前はこう書いていた」と悪い例を残した
 * コメントまで拾うと、直したあとも落ち続ける（実際に踏んだ）。
 * 行頭が `#` の行だけを落とす。`uses:` 行末の `# ratchet:` のような
 * 行内コメントに `hashFiles(` は出てこないので、これで足りる
 */
function extractHashFilesGlobs(content) {
  const live = content
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  const globs = [];
  // hashFiles('a', 'b') / hashFiles("a") の引数部分をまとめて拾う
  for (const call of live.matchAll(/hashFiles\(([^)]*)\)/g)) {
    for (const quoted of call[1].matchAll(/['"]([^'"]*)['"]/g)) {
      globs.push(quoted[1]);
    }
  }
  return globs;
}

/**
 * 「任意の深さ」のつもりで書かれていない `**` を含むか
 *
 * セグメント全体が `**` なら正しい（`**​/*.ts` / `src/**​/*.ts`）。
 * `**.ts` や `a**b` のように他の文字と同じセグメントにある `**` は、
 * 実質 `*` と同じで1階層しか見ない
 */
function hasNonSegmentDoubleStar(glob) {
  return glob
    .split('/')
    .some((segment) => segment.includes('**') && segment !== '**');
}

const workflowFiles = readdirSync(WORKFLOW_DIR).filter((f) =>
  /\.ya?ml$/.test(f),
);

describe('hashFiles() のグロブ', () => {
  it('検査対象のワークフローが存在する', () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it.each(workflowFiles)(
    '%s: `**` をセグメント全体として書いている',
    (file) => {
      const globs = extractHashFilesGlobs(
        readFileSync(join(WORKFLOW_DIR, file), 'utf8'),
      );
      /*
        ⚠️ Jest の `expect` は Playwright と違って第2引数のメッセージを
        受け取らない（`Expect takes at most one argument.` で落ちる）。
        直し方が分かる文字列を**比較する値そのもの**に入れる
      */
      const broken = globs
        .filter(hasNonSegmentDoubleStar)
        .map(
          (glob) =>
            `${file}: '${glob}' は直下しか見ない。任意の深さを見たいなら ` +
            "'**' を単独のセグメントにすること（例: '**/*.ts'）",
        );

      expect(broken).toEqual([]);
    },
  );
});

describe('hasNonSegmentDoubleStar', () => {
  it.each([
    ['**.ts', true],
    ['**.[jt]sx', true],
    ['a**b/*.ts', true],
    ['**/*.ts', false],
    ['src/**/*.tsx', false],
    ['**/package-lock.json', false],
    ['package-lock.json', false],
  ])('%s → %s', (glob, expected) => {
    expect(hasNonSegmentDoubleStar(glob)).toBe(expected);
  });
});

describe('extractHashFilesGlobs', () => {
  it('1回の呼び出しの複数引数を取り出す', () => {
    expect(
      extractHashFilesGlobs("key: ${{ hashFiles('a/**/*.ts', 'b/**/*.js') }}"),
    ).toEqual(['a/**/*.ts', 'b/**/*.js']);
  });

  it('同じ行に複数の呼び出しがあっても取り出す', () => {
    expect(
      extractHashFilesGlobs(
        "${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('src/**/*.ts') }}",
      ),
    ).toEqual(['**/package-lock.json', 'src/**/*.ts']);
  });

  it('hashFiles が無ければ空', () => {
    expect(extractHashFilesGlobs('key: ${{ runner.os }}-node')).toEqual([]);
  });

  // #1082 の修正コメントが「以前は `hashFiles('**.[jt]s')` だった」と
  // 悪い例を残しているため、ここを外すと直したあとも落ち続ける
  it('コメント行の例は拾わない', () => {
    expect(
      extractHashFilesGlobs(
        [
          "      # 以前は hashFiles('**.[jt]s', '**.[jt]sx') が付いていた",
          "      key: ${{ hashFiles('**/package-lock.json') }}",
        ].join('\n'),
      ),
    ).toEqual(['**/package-lock.json']);
  });
});
