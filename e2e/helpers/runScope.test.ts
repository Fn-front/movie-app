/**
 * run スコープ識別子の単体テスト（#793）
 *
 * 値はモジュール読み込み時に環境変数から確定するため、各ケースで
 * `jest.isolateModules` を使って読み込み直す。
 */

type RunScopeModule = typeof import('./runScope');

/** 指定した環境変数のもとで runScope を読み込み直す */
function loadRunScope(env: Record<string, string>): RunScopeModule {
  const original = { ...process.env };

  delete process.env.E2E_RUN_ID;
  delete process.env.GITHUB_RUN_ID;
  delete process.env.GITHUB_RUN_ATTEMPT;
  Object.assign(process.env, env);

  let loaded: RunScopeModule;
  jest.isolateModules(() => {
    loaded = require('./runScope') as RunScopeModule;
  });

  process.env = original;

  return loaded!;
}

describe('E2E_RUN_ID', () => {
  it('E2E_RUN_ID が指定されていればそれを使う', () => {
    const { E2E_RUN_ID } = loadRunScope({ E2E_RUN_ID: 'mybranch1' });

    expect(E2E_RUN_ID).toBe('mybranch1');
  });

  it('CI では GITHUB_RUN_ID と GITHUB_RUN_ATTEMPT から導出する', () => {
    const { E2E_RUN_ID } = loadRunScope({
      GITHUB_RUN_ID: '12345678901',
      GITHUB_RUN_ATTEMPT: '2',
    });

    expect(E2E_RUN_ID).toBe('12345678901x2');
  });

  it('再実行（GITHUB_RUN_ATTEMPT 違い）では別のIDになる', () => {
    const first = loadRunScope({
      GITHUB_RUN_ID: '12345678901',
      GITHUB_RUN_ATTEMPT: '1',
    });
    const second = loadRunScope({
      GITHUB_RUN_ID: '12345678901',
      GITHUB_RUN_ATTEMPT: '2',
    });

    expect(first.E2E_RUN_ID).not.toBe(second.E2E_RUN_ID);
  });

  it('GITHUB_RUN_ATTEMPT が無ければ 1 とみなす', () => {
    const { E2E_RUN_ID } = loadRunScope({ GITHUB_RUN_ID: '99' });

    expect(E2E_RUN_ID).toBe('99x1');
  });

  it('CI 以外では local になる', () => {
    const { E2E_RUN_ID } = loadRunScope({});

    expect(E2E_RUN_ID).toBe('local');
  });

  it('メールアドレスに入れられない文字は落とす', () => {
    // ブランチ名をそのまま渡すような使い方でも、識別子として壊れない
    const { E2E_RUN_ID } = loadRunScope({ E2E_RUN_ID: 'fix/e2e @run#1' });

    expect(E2E_RUN_ID).toBe('fixe2erun1');
  });

  it('英数字が1文字も無い指定は local にフォールバックする', () => {
    const { E2E_RUN_ID } = loadRunScope({ E2E_RUN_ID: '///' });

    expect(E2E_RUN_ID).toBe('local');
  });
});

describe('runScopedEmail', () => {
  it('run IDを接尾辞に付けたメールアドレスを返す', () => {
    const { runScopedEmail } = loadRunScope({ E2E_RUN_ID: 'run1' });

    expect(runScopedEmail('e2e-two-factor')).toBe(
      'e2e-two-factor-run1@example.com',
    );
  });

  it('run が違えば別のメールアドレスになる', () => {
    const first = loadRunScope({ E2E_RUN_ID: 'run1' });
    const second = loadRunScope({ E2E_RUN_ID: 'run2' });

    expect(first.runScopedEmail('e2e-shared')).not.toBe(
      second.runScopedEmail('e2e-shared'),
    );
  });

  it('後片付け用の like パターンが、生成したメールに一致する形になる', () => {
    const { runScopedEmail, RUN_EMAIL_LIKE_PATTERN } = loadRunScope({
      E2E_RUN_ID: 'run1',
    });
    const email = runScopedEmail('e2e-shared');

    // PostgREST の `*` を正規表現に読み替えて一致を確かめる
    const matcher = new RegExp(
      `^${RUN_EMAIL_LIKE_PATTERN.split('*').join('.*')}$`,
    );
    expect(email).toMatch(matcher);
  });
});

describe('RUN_CLIENT_IP', () => {
  it('プライベートアドレス（10.0.0.0/8）のIPv4を返す', () => {
    const { RUN_CLIENT_IP } = loadRunScope({ E2E_RUN_ID: 'run1' });

    expect(RUN_CLIENT_IP).toMatch(/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    // getClientIp の isIpLike（各オクテットが255以下）を満たすこと
    for (const octet of RUN_CLIENT_IP.split('.')) {
      expect(Number(octet)).toBeLessThanOrEqual(255);
    }
  });

  it('同じ run IDなら同じIPになる（プロセスをまたいでも一致する）', () => {
    const first = loadRunScope({ E2E_RUN_ID: 'run1' });
    const second = loadRunScope({ E2E_RUN_ID: 'run1' });

    expect(first.RUN_CLIENT_IP).toBe(second.RUN_CLIENT_IP);
  });

  it('run が違えば別のIPになる', () => {
    const first = loadRunScope({ E2E_RUN_ID: 'run1' });
    const second = loadRunScope({ E2E_RUN_ID: 'run2' });

    expect(first.RUN_CLIENT_IP).not.toBe(second.RUN_CLIENT_IP);
  });
});

describe('runScopedMovieId', () => {
  it('movie_cache.id の INTEGER 上限に収まり、実在のTMDb ID領域と重ならない', () => {
    const { runScopedMovieId } = loadRunScope({ E2E_RUN_ID: 'run1' });
    const id = runScopedMovieId(0);

    expect(id).toBeGreaterThanOrEqual(1_900_000_000);
    expect(id).toBeLessThanOrEqual(2_147_483_647);
  });

  it('offset ごとに別のIDを返す', () => {
    const { runScopedMovieId } = loadRunScope({ E2E_RUN_ID: 'run1' });

    expect(runScopedMovieId(1)).not.toBe(runScopedMovieId(2));
  });

  it('run が違えばID領域が重ならない', () => {
    const first = loadRunScope({ E2E_RUN_ID: 'run1' });
    const second = loadRunScope({ E2E_RUN_ID: 'run2' });

    const a = first.runScopedMovieIdRange();
    const b = second.runScopedMovieIdRange();

    expect(a.min > b.max || b.min > a.max).toBe(true);
  });

  it('範囲外の offset は RangeError にする（他 run の領域を踏むのを防ぐ）', () => {
    const { runScopedMovieId } = loadRunScope({ E2E_RUN_ID: 'run1' });

    expect(() => runScopedMovieId(-1)).toThrow(RangeError);
    expect(() => runScopedMovieId(100)).toThrow(RangeError);
    expect(() => runScopedMovieId(1.5)).toThrow(RangeError);
  });
});

describe('runScopedMovieIdRange', () => {
  it('runScopedMovieId が返す値をすべて含む', () => {
    const { runScopedMovieId, runScopedMovieIdRange } = loadRunScope({
      E2E_RUN_ID: 'run1',
    });
    const { min, max } = runScopedMovieIdRange();

    expect(runScopedMovieId(0)).toBe(min);
    expect(runScopedMovieId(99)).toBe(max);
  });
});

/**
 * CI のシャード分割（#834）
 *
 * `.github/workflows/e2e.yml` は `--shard` でジョブを分け、各ジョブへ
 * `<run_id>x<attempt>s<shard>` という E2E_RUN_ID を渡す。シャードは同じ run の
 * 中の別ジョブなので、既定の導出（GITHUB_RUN_ID × GITHUB_RUN_ATTEMPT）のままだと
 * 全シャードが同値になる。さらに setup / cleanup プロジェクトはシャードごとに
 * 走るため、先に終わったシャードの teardown が実行中の他シャードのデータを消す。
 *
 * 識別子がシャード間で分離されていることを、ここで回帰テストする。
 */
describe('シャード分割した run スコープ', () => {
  /** ワークフローと同じ組み立て方で E2E_RUN_ID を作る */
  const shardRunId = (shard: number) => `39622116175x1s${shard}`;

  /** 設定中の分割数ぶんの runScope を読み込む */
  const loadShards = () =>
    [1, 2, 3, 4].map((shard) =>
      loadRunScope({ E2E_RUN_ID: shardRunId(shard) }),
    );

  it('シャードごとに別の run IDになり、24文字の上限にも収まる', () => {
    const ids = loadShards().map((shard) => shard.E2E_RUN_ID);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      // sanitizeRunId に落とされる文字が混ざっていないこと
      expect(id).toMatch(/^39622116175x1s\d+$/);
      expect(id.length).toBeLessThanOrEqual(24);
    }
  });

  it('専用ユーザーのメールアドレスがシャード間で衝突しない', () => {
    const emails = loadShards().map((shard) =>
      shard.runScopedEmail('e2e-shared'),
    );

    expect(new Set(emails).size).toBe(emails.length);
  });

  it('後片付けの like パターンが自分のシャードのユーザーだけに一致する', () => {
    const shards = loadShards();

    shards.forEach((shard, index) => {
      // PostgREST の `*` を正規表現に読み替える
      const matcher = new RegExp(
        `^${shard.RUN_EMAIL_LIKE_PATTERN.split('*').join('.*')}$`,
      );

      shards.forEach((other, otherIndex) => {
        expect(matcher.test(other.runScopedEmail('e2e-shared'))).toBe(
          index === otherIndex,
        );
      });
    });
  });

  it('送信元IPがシャード間で衝突しない（レート制限カウンタを食い合わない）', () => {
    const ips = loadShards().map((shard) => shard.RUN_CLIENT_IP);

    expect(new Set(ips).size).toBe(ips.length);
  });

  it('movie_cache のID領域がシャード間で重ならない', () => {
    const ranges = loadShards().map((shard) => shard.runScopedMovieIdRange());

    ranges.forEach((range, index) => {
      ranges.slice(index + 1).forEach((other) => {
        expect(range.min > other.max || other.min > range.max).toBe(true);
      });
    });
  });
});
