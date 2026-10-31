/**
 * 原題提案の引き継ぎ（sessionStorage）
 *
 * 提案をクリックして遷移したときだけAI提案の再実行を抑えるため、候補を
 * sessionStorageへ保持する。どのクエリに対する候補かを併せて持たないと、
 * 別キーワードで検索しても「提案クリック由来」と誤判定され、AI提案が
 * 無効化されたまま無関係な候補が出続ける（#824）。
 */

import { TITLE_SUGGESTION } from '@/constants';

/**
 * sessionStorageに保持する原題提案
 */
export interface StoredSuggestion {
  /** 候補をクリックして遷移した先の検索キーワード */
  query: string;
  /** 引き継ぐ原題候補 */
  suggestions: string[];
}

/**
 * 現在のクエリに対する読み出し結果
 */
export interface SuggestionForQuery {
  /** 引き継ぐ候補。現在のクエリに対応しない保存値なら空配列 */
  suggestions: string[];
  /** 保存値が現在のクエリに対応しておらず、取り除くべきか */
  isStale: boolean;
}

/**
 * 保存値が現行フォーマットかを判定する
 *
 * 旧形式（裸の `string[]`）はデプロイをまたいで開かれたままのタブに残るため、
 * 無検証のキャストにせず必ずここで弾く。
 */
function isStoredSuggestion(value: unknown): value is StoredSuggestion {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.query === 'string' &&
    Array.isArray(candidate.suggestions) &&
    candidate.suggestions.every((item) => typeof item === 'string')
  );
}

/**
 * 保持された原題提案を読み出す
 *
 * `null` は保存なし、`'invalid'` は旧形式・壊れた値。
 */
function readStoredSuggestion(): StoredSuggestion | 'invalid' | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(TITLE_SUGGESTION.STORAGE_KEY);
  } catch {
    // Cookieブロック等でsessionStorage自体が使えない。引き継ぎは諦める
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredSuggestion(parsed) ? parsed : 'invalid';
  } catch {
    // JSONとして壊れている
    return 'invalid';
  }
}

/**
 * 現在のクエリに引き継ぐべき候補を読み出す（副作用なし）
 *
 * 取り除く処理はここでは行わない。描画中にsessionStorageを消すと、
 * `startTransition` やStrictModeで破棄されるレンダーでも消えてしまうため、
 * 呼び出し側のEffectで `clearStoredSuggestion()` を実行する。
 *
 * @param query - 現在の検索キーワード
 */
export function readSuggestionForQuery(query: string): SuggestionForQuery {
  const stored = readStoredSuggestion();

  if (stored === null) return { suggestions: [], isStale: false };
  if (stored === 'invalid') return { suggestions: [], isStale: true };
  if (stored.query !== query) return { suggestions: [], isStale: true };

  return { suggestions: stored.suggestions, isStale: false };
}

/**
 * 原題提案を保持する
 *
 * @param stored - 遷移先のクエリと引き継ぐ候補
 */
export function writeStoredSuggestion(stored: StoredSuggestion): void {
  try {
    sessionStorage.setItem(
      TITLE_SUGGESTION.STORAGE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // 保存できなくても遷移自体は成立する（遷移先でAI提案が走るだけ）
  }
}

/**
 * 保持された原題提案を取り除く
 */
export function clearStoredSuggestion(): void {
  try {
    sessionStorage.removeItem(TITLE_SUGGESTION.STORAGE_KEY);
  } catch {
    // 読み出しも同じ理由で失敗するため、残っていても実害は無い
  }
}
