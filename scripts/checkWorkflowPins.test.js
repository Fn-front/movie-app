/**
 * checkWorkflowPins テスト
 */

const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  extractUsesRef,
  isPinned,
  findViolations,
  checkWorkflowDir,
} = require('./checkWorkflowPins');

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

describe('extractUsesRef', () => {
  it('uses: の値を取り出す', () => {
    expect(extractUsesRef(`      - uses: actions/checkout@${SHA}`)).toBe(
      `actions/checkout@${SHA}`,
    );
  });

  it('リスト記号が無い書き方でも取り出す', () => {
    expect(extractUsesRef(`        uses: actions/checkout@${SHA}`)).toBe(
      `actions/checkout@${SHA}`,
    );
  });

  it('クォートを外す', () => {
    expect(extractUsesRef(`        uses: 'actions/checkout@${SHA}'`)).toBe(
      `actions/checkout@${SHA}`,
    );
    expect(extractUsesRef(`        uses: "actions/checkout@${SHA}"`)).toBe(
      `actions/checkout@${SHA}`,
    );
  });

  // 行末の `# ratchet:actions/checkout@v7.0.1` を残すと、注釈側のタグを
  // 参照と誤認して「固定されていない」と必ず誤検知する
  it('行末のratchet注釈を落とす', () => {
    expect(
      extractUsesRef(
        `        uses: 'actions/checkout@${SHA}' # ratchet:actions/checkout@v7.0.1`,
      ),
    ).toBe(`actions/checkout@${SHA}`);
  });

  it('uses: 以外の行はnullを返す', () => {
    expect(extractUsesRef('      - name: checkout')).toBeNull();
    expect(extractUsesRef('        run: npm run lint')).toBeNull();
    expect(extractUsesRef('')).toBeNull();
  });

  // `with:` の中の値などに uses という文字が出ても拾わない
  it('行頭以外のusesは拾わない', () => {
    expect(extractUsesRef('          key: what-uses: this')).toBeNull();
  });
});

describe('isPinned', () => {
  it('40桁のコミットSHAは固定とみなす', () => {
    expect(isPinned(`actions/checkout@${SHA}`)).toBe(true);
  });

  it('サブディレクトリ付きの参照も見る', () => {
    expect(isPinned(`owner/repo/path/to/action@${SHA}`)).toBe(true);
    expect(isPinned('owner/repo/path/to/action@v1')).toBe(false);
  });

  it('タグ・ブランチ参照は固定とみなさない', () => {
    expect(isPinned('actions/checkout@v4')).toBe(false);
    expect(isPinned('actions/checkout@main')).toBe(false);
  });

  it('短縮SHA（7桁等）は固定とみなさない', () => {
    // 短縮SHAは将来の衝突で別コミットを指しうる
    expect(isPinned('actions/checkout@3d3c42e')).toBe(false);
  });

  it('大文字混じりのSHAは固定とみなさない', () => {
    // Git のSHA表記は小文字。大文字が混じるのは手書きの疑いがある
    expect(isPinned(`actions/checkout@${SHA.toUpperCase()}`)).toBe(false);
  });

  it('@が無い参照は固定とみなさない', () => {
    expect(isPinned('actions/checkout')).toBe(false);
  });

  // ローカル参照はSHAを書けない。改ざんの経路にもならないので対象外
  it('ローカルの再利用ワークフローは対象外', () => {
    expect(isPinned('./.github/workflows/gemini-review.yml')).toBe(true);
  });

  it('Dockerイメージ参照は対象外', () => {
    expect(isPinned('docker://alpine:3.20')).toBe(true);
  });
});

describe('findViolations', () => {
  it('固定されていない行だけをファイル名・行番号付きで返す', () => {
    const content = [
      'jobs:',
      '  build:',
      '    steps:',
      `      - uses: actions/checkout@${SHA}`,
      '      - uses: actions/setup-node@v4',
      '      - run: npm ci',
      '      - uses: owner/other@main',
    ].join('\n');

    expect(findViolations('build.yml', content)).toEqual([
      { file: 'build.yml', line: 5, ref: 'actions/setup-node@v4' },
      { file: 'build.yml', line: 7, ref: 'owner/other@main' },
    ]);
  });

  it('全て固定されていれば空配列を返す', () => {
    const content = `      - uses: actions/checkout@${SHA}`;

    expect(findViolations('build.yml', content)).toEqual([]);
  });

  it('uses: が1つも無くても落ちない', () => {
    expect(findViolations('build.yml', 'name: x\non: push\n')).toEqual([]);
  });
});

describe('checkWorkflowDir', () => {
  /** 一時ディレクトリにワークフローを並べる */
  function createWorkflowDir(files) {
    const dir = mkdtempSync(join(tmpdir(), 'workflow-pins-'));
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
    return dir;
  }

  it('.yml と .yaml の両方を検査する', () => {
    const dir = createWorkflowDir({
      'a.yml': '      - uses: actions/setup-node@v4',
      'b.yaml': '      - uses: owner/repo@main',
    });

    expect(checkWorkflowDir(dir)).toEqual([
      { file: 'a.yml', line: 1, ref: 'actions/setup-node@v4' },
      { file: 'b.yaml', line: 1, ref: 'owner/repo@main' },
    ]);
  });

  it('ワークフロー以外のファイルは無視する', () => {
    const dir = createWorkflowDir({
      'README.md': '      - uses: actions/setup-node@v4',
      'a.yml': `      - uses: actions/checkout@${SHA}`,
    });

    expect(checkWorkflowDir(dir)).toEqual([]);
  });

  // このリポジトリ自身が通ることを担保する。
  // 通らなくなったら、それはこのスクリプトが直すべき対象を見つけた状態
  it('リポジトリ本体の .github/workflows が全て固定されている', () => {
    expect(checkWorkflowDir()).toEqual([]);
  });
});
