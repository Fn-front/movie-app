/**
 * axe の incomplete（needs review）のうち、どれを許容するかの判定
 *
 * Playwright に依存しない純粋なロジックだけを置く。
 * ここを `helpers.ts` から分けているのは、`helpers.ts` が
 * `@playwright/test` を読み込むため Jest（jsdom）から import できないため。
 */

/** axe の incomplete ノード（判定に使う部分だけ） */
export interface IncompleteNode {
  /** 対象のCSSセレクタ。iframe 内は入れ子の配列になる */
  target: unknown;
  any?: ReadonlyArray<{ data?: unknown }>;
  all?: ReadonlyArray<{ data?: unknown }>;
  none?: ReadonlyArray<{ data?: unknown }>;
}

/** axe の incomplete 1件（判定に使う部分だけ） */
export interface IncompleteResult {
  id: string;
  nodes: readonly IncompleteNode[];
}

/**
 * incomplete を許容する条件
 *
 * 文字列を渡すとそのルールの incomplete を丸ごと許容する。
 * オブジェクトで条件を付けると、条件に合うノードだけを許容し、
 * 同じルールでも別の原因で出たものは落とす。
 */
export type AllowedIncomplete =
  | string
  | {
      /** 許容するルールID */
      id: string;
      /** axe の messageKey がこれと一致するノードだけ許容する */
      messageKey?: string;
      /** 対象セレクタにこの文字列を含むノードだけ許容する */
      targetIncludes?: string;
    };

/** 許容条件からルールIDを取り出す */
function ruleIdOf(allowance: AllowedIncomplete): string {
  return typeof allowance === 'string' ? allowance : allowance.id;
}

/** ノードが持つ messageKey をすべて集める */
function messageKeysOf(node: IncompleteNode): string[] {
  return [...(node.any ?? []), ...(node.all ?? []), ...(node.none ?? [])]
    .map(
      (check) =>
        (check.data as { messageKey?: unknown } | undefined)?.messageKey,
    )
    .filter((key): key is string => typeof key === 'string');
}

/** target を1本の文字列に潰す（iframe 内の入れ子にも対応する） */
function targetTextOf(node: IncompleteNode): string {
  return JSON.stringify(node.target ?? '');
}

/** ノードが許容条件に合うか */
function isAllowed(
  node: IncompleteNode,
  allowance: AllowedIncomplete,
): boolean {
  if (typeof allowance === 'string') return true;

  if (
    allowance.messageKey !== undefined &&
    !messageKeysOf(node).includes(allowance.messageKey)
  ) {
    return false;
  }

  if (
    allowance.targetIncludes !== undefined &&
    !targetTextOf(node).includes(allowance.targetIncludes)
  ) {
    return false;
  }

  return true;
}

/**
 * 許容条件に合わない incomplete だけを残す
 *
 * ノード単位で絞るため、同じルールでも「許容したい事情のもの」と
 * 「そうでないもの」が混ざっている場合に後者だけを残せる。
 */
export function filterUnexpectedIncomplete<T extends IncompleteResult>(
  incomplete: readonly T[],
  allowed: readonly AllowedIncomplete[],
): T[] {
  return incomplete
    .map((result) => {
      const allowances = allowed.filter((a) => ruleIdOf(a) === result.id);
      if (allowances.length === 0) return result;

      return {
        ...result,
        nodes: result.nodes.filter(
          (node) => !allowances.some((a) => isAllowed(node, a)),
        ),
      };
    })
    .filter((result) => result.nodes.length > 0);
}
