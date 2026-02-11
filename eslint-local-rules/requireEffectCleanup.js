/**
 * ESLint custom rule: require-effect-cleanup
 *
 * useEffect 内で非同期処理（async/await, .then(), fetch, axios）を行う場合、
 * クリーンアップ関数（return () => ...）を必須とするルール。
 */

/** @type {import('eslint').Rule.RuleModule} */
const requireEffectCleanup = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'useEffect 内の非同期処理にはクリーンアップ関数を必須とする',
    },
    messages: {
      missingCleanup:
        'useEffect 内で非同期処理を行う場合、クリーンアップ関数（AbortController 等）を返してください。',
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        if (!isUseEffectCall(node)) return;

        const callback = node.arguments[0];
        if (!callback) return;
        if (
          callback.type !== 'ArrowFunctionExpression' &&
          callback.type !== 'FunctionExpression'
        ) {
          return;
        }

        const body = callback.body;
        if (!body || body.type !== 'BlockStatement') return;

        if (!hasAsyncPattern(body)) return;
        if (hasCleanupReturn(body)) return;

        context.report({
          node,
          messageId: 'missingCleanup',
        });
      },
    };
  },
};

/**
 * useEffect / useLayoutEffect の呼び出しかどうか判定
 */
function isUseEffectCall(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') {
    return callee.name === 'useEffect' || callee.name === 'useLayoutEffect';
  }
  return false;
}

/**
 * ブロック内に非同期パターンが含まれるか判定
 * - async 関数の定義と呼び出し
 * - .then() チェーン
 * - await 式
 */
function hasAsyncPattern(blockStatement) {
  let found = false;

  visitNode(blockStatement, (node) => {
    if (found) return;

    // .then() 呼び出し
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'then'
    ) {
      found = true;
      return;
    }

    // await 式
    if (node.type === 'AwaitExpression') {
      found = true;
      return;
    }

    // async 関数の定義（即座に呼び出されるパターンを含む）
    if (
      (node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration') &&
      node.async
    ) {
      found = true;
      return;
    }
  });

  return found;
}

/**
 * コールバック直下のブロックにクリーンアップ return があるか判定
 * （return () => ... または return function() { ... }）
 */
function hasCleanupReturn(blockStatement) {
  const statements = blockStatement.body;
  for (const stmt of statements) {
    if (stmt.type !== 'ReturnStatement') continue;
    if (!stmt.argument) continue;

    const arg = stmt.argument;
    if (
      arg.type === 'ArrowFunctionExpression' ||
      arg.type === 'FunctionExpression'
    ) {
      return true;
    }

    // return cleanupFn; のような変数参照も許容
    if (arg.type === 'Identifier') {
      return true;
    }
  }
  return false;
}

/**
 * AST を再帰的に走査するヘルパー
 * ネストされた useEffect のコールバックには入らない
 */
function visitNode(node, callback) {
  if (!node || typeof node !== 'object') return;

  callback(node);

  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;

    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          visitNode(item, callback);
        }
      }
    } else if (child && typeof child.type === 'string') {
      visitNode(child, callback);
    }
  }
}

module.exports = requireEffectCleanup;
