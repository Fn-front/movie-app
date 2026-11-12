/**
 * @modal スロットの「当たらなかったとき」
 *
 * パラレルルートは、**ソフト遷移でスロットに当たらなくなっても直前の中身を
 * 出し続ける**（`node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/parallel-routes.md` の Modals 節）。`default.tsx` は
 * ハードナビゲーション用で、この場合は効かない。
 *
 * そのため、モーダルから別ページへリンクで出ると映画詳細が遷移先に
 * 被さったまま残る。実測で `/movies/[id]` のモーダル → キャスト →
 * `/person/[id]` が再現した。null を返すルートを全URLに用意して閉じる。
 *
 * ⚠️ `(.)movies/[id]` の割り込みはこれより優先されるので、モーダル表示は
 * 奪われない。
 */
export default function ModalCatchAll() {
  return null;
}
