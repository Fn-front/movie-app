/**
 * PostgREST の `max_rows` に黙って切られないよう、ページ単位で読み切る（#1274）
 *
 * ## なぜ要るか
 *
 * PostgREST は `max_rows`（本プロジェクトは 1000 / `supabase/config.toml`）を
 * 超える結果を**エラーも truncation フラグも返さずに打ち切る**。絞り込み無しで
 * `select()` すると、1001件目以降が静かに消える。
 *
 * 件数が少ないうちは症状が出ないため、**閾値を超えたことに気づけない**。
 * このリポジトリは同じ罠を #829（favorites/lookup）と #1145（watchlist/lookup）で
 * 既に2回踏んでいる。
 *
 * ⚠️ `favorites/lookup` と `watchlist/lookup` はこのヘルパーより前に個別対応
 * したため、同じループを手書きで持っている。挙動は同じ。新しく書く場所では
 * こちらを使うこと。
 */

/** 1ページぶんの問い合わせ結果のうち、ここで見るぶんだけ */
export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

export interface FetchAllPagesOptions<T> {
  /** 1ページの件数。PostgREST の `max_rows` を超えない値にすること */
  pageSize: number;
  /**
   * 読むページ数の上限
   *
   * 暴走を止めるための保険。到達したら警告を出して打ち切る
   */
  maxPages: number;
  /** 警告ログの識別子（例: `dismissed-movies`） */
  label: string;
  /**
   * 1ページを取る問い合わせ
   *
   * ⚠️ **安定した並び順を必ず指定すること。** 並びが不定だと、ページを
   * またいで同じ行が重複したり抜けたりする
   */
  query: (from: number, to: number) => PromiseLike<PageResult<T>>;
}

/**
 * ページ単位で全件読み切る
 *
 * @throws 問い合わせがエラーを返した場合（呼び出し側で握るかはそちらの判断）
 */
export async function fetchAllPages<T>({
  pageSize,
  maxPages,
  label,
  query,
}: FetchAllPagesOptions<T>): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await query(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    rows.push(...(data ?? []));

    // 要求した件数に満たなければ最後のページ
    if ((data?.length ?? 0) < pageSize) {
      return rows;
    }
  }

  // 上限まで読み切った。これ以上は読まないが、黙って切るのではなく
  // 気づけるようにしておく（現実的な利用では到達しない）
  console.warn(`[${label}] 取得上限に到達した count=${rows.length}`);

  return rows;
}
