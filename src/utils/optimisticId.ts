/**
 * 楽観アイテムの仮ID
 *
 * サーバーが行IDを採番するまでのあいだ、キャッシュに積む仮の値。
 * **書き込みAPIへ渡してはいけない。** 各 `[id]` ルートが `isValidUuid` で
 * 弾くため 400 になる（watchlist: #1194 / favorites: #1206）。
 *
 * 追加の `onSuccess` で実IDへ差し替えるが（#1152）、それは **POST の応答が
 * 返ったあと**。`onMutate` から `onSuccess` までの数百ミリ秒は仮IDのままで、
 * その間に削除や更新を押せてしまう。
 *
 * ⚠️ watchlist と favorites で**同じ接頭辞を共有する**。別々に持つと、
 * 片方だけ直したときにもう片方が同型の不具合を抱えたまま残る（実際そうなった）。
 */

/** 仮IDの接頭辞。判定と生成で同じ値を使う */
const OPTIMISTIC_ID_PREFIX = 'optimistic-';

/**
 * 仮IDを作る
 *
 * 同一ミリ秒の連続操作でも衝突しないよう `randomUUID` を使う。
 * 照会キャッシュの照合キーにもなるため、重複すると別の作品を差し替える。
 *
 * @returns 仮ID
 */
export function createOptimisticId(): string {
  return `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`;
}

/**
 * 仮IDかどうか
 *
 * 書き込みAPIを呼ぶ前のガードと、操作ボタンの無効化に使う。
 *
 * @param id - 行ID
 * @returns 仮IDなら true
 */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}
