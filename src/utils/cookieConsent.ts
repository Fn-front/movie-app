/**
 * Cookie同意レコードの永続化
 *
 * localStorage を唯一の真実源とし、ログイン中のみサーバーへ同期する
 * （同期は useConsentServerSync の責務。ここには持たない）。
 * SSR 安全（window/localStorage 未定義でも動作する）。
 *
 * レコードは4つのキーに分かれる。1本のJSONにしないのは、layout.tsx の
 * <head> インラインスクリプトが JSON.parse を挟まずに同期読みできるように
 * するため。
 */

import {
  COOKIE_CONSENT_VALUES,
  COOKIE_CONSENT_VERSION,
  type ConsentValue,
} from '@/constants/user';
import { STORAGE_KEYS } from '@/constants/common';

/** 同意レコードの変更をインスタンス/タブ間で同期するためのカスタムイベント名 */
export const COOKIE_CONSENT_CHANGE_EVENT = 'movie-app:cookie-consent-change';

/** 端末に保存された同意レコード */
export interface LocalConsentRecord {
  state: ConsentValue;
  /** 同意／撤回した日時（ISO 8601）。不明なら null */
  at: string | null;
  /** 操作時のログインユーザーID。未ログイン時の操作は空文字 */
  owner: string;
  /** 操作時のポリシー版。不明・不正なら null */
  version: number | null;
}

/** localStorage へ安全にアクセスする（プライベートモード等で throw しうる） */
function readKey(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // 書き込めない環境では同意を保持できない。未決定として扱われる
  }
}

/** 購読者へ変更を通知する（同一タブ向け。別タブには storage イベントが届く） */
function notifyChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGE_EVENT));
}

/**
 * 保存された同意状態を読む（版は見ない）
 *
 * 版を加味した「UIが従うべき状態」は getEffectiveConsentState を使うこと。
 */
export function getStoredConsentState(): ConsentValue {
  const value = readKey(STORAGE_KEYS.COOKIE_CONSENT);
  // 未決定は未保存で表現するため 'unset' は保存されない。
  // 壊れた値で同意済み扱いにしないよう、既知の2値以外はすべて未決定に倒す
  return value === 'granted' || value === 'denied' ? value : 'unset';
}

/**
 * 版を加味した同意状態を返す
 *
 * 現行版でない同意は「未決定」として扱い、バナーを再表示させる。
 * 記録自体は消さない（再同意で上書きされるまで旧版の記録として残る）。
 */
export function getEffectiveConsentState(): ConsentValue {
  const state = getStoredConsentState();
  if (state === 'unset') return 'unset';
  return getStoredConsentVersion() === COOKIE_CONSENT_VERSION ? state : 'unset';
}

/** 保存された同意日時を読む（未保存・空文字は null） */
export function getStoredConsentAt(): string | null {
  const value = readKey(STORAGE_KEYS.COOKIE_CONSENT_AT);
  return value === null || value === '' ? null : value;
}

/** 保存された所有者（ユーザーID）を読む。未ログイン時の操作は空文字 */
export function getStoredConsentOwner(): string {
  return readKey(STORAGE_KEYS.COOKIE_CONSENT_OWNER) ?? '';
}

/**
 * 保存された版を読む
 *
 * localStorage は文字列しか持てないため数値へ正規化する。解釈できない値は
 * null にして「版違い」として扱わせる。
 * なお layout.tsx の <head> スクリプトだけは同期読みの都合でこの関数を
 * 通さず、生文字列と String(COOKIE_CONSENT_VERSION) を比較する。
 */
export function getStoredConsentVersion(): number | null {
  const value = readKey(STORAGE_KEYS.COOKIE_CONSENT_VERSION);
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** 4キーをまとめて読む */
export function getStoredConsentRecord(): LocalConsentRecord {
  return {
    state: getStoredConsentState(),
    at: getStoredConsentAt(),
    owner: getStoredConsentOwner(),
    version: getStoredConsentVersion(),
  };
}

/**
 * 同意レコードを書き込む
 *
 * 書き込み順は owner → version → at → state に固定する。setItem は4回に
 * 分かれて原子的でないため、中間状態を別タブが観測しうる。この順序なら
 * 中間状態は「新しい付随情報 + 古い状態」になり、読み手は常に状態キーを
 * 基準に判断できる（状態キーがコミット点）。
 *
 * 4キーすべてを確定させる。null はキーを消す。「null ならスキップ」に
 * すると、他人のレコードを上書きするときに他人の日時が端末に残る。
 */
export function writeConsentRecord(record: LocalConsentRecord): void {
  writeKey(STORAGE_KEYS.COOKIE_CONSENT_OWNER, record.owner);
  writeKey(
    STORAGE_KEYS.COOKIE_CONSENT_VERSION,
    record.version === null ? null : String(record.version),
  );
  writeKey(STORAGE_KEYS.COOKIE_CONSENT_AT, record.at);
  // 未決定は未保存で表現する
  writeKey(
    STORAGE_KEYS.COOKIE_CONSENT,
    record.state === 'unset' ? null : record.state,
  );
  notifyChange();
}

/**
 * 同意レコードを消す
 *
 * 消去順は書き込みと逆（state → at → version → owner）。書き込みと同じ順で
 * 消すと、一瞬 "state=granted かつ owner=''" が観測され、マージ規則が
 * 「未認証時の同意＝有効」と判定して他人の同意を現在のユーザーのサーバー行へ
 * 書き込んでしまう。
 */
export function clearConsentRecord(): void {
  writeKey(STORAGE_KEYS.COOKIE_CONSENT, null);
  writeKey(STORAGE_KEYS.COOKIE_CONSENT_AT, null);
  writeKey(STORAGE_KEYS.COOKIE_CONSENT_VERSION, null);
  writeKey(STORAGE_KEYS.COOKIE_CONSENT_OWNER, null);
  notifyChange();
}

/**
 * ログイン中に行われた同意レコードだけを消す（ログアウト時に呼ぶ）
 *
 * 未認証時の同意（owner が空文字）は端末の匿名利用者の意思なので残す。
 * ログイン中の同意を残すと、ログアウトした端末を未認証の第三者が使ったときに
 * 前の利用者の同意がそのまま適用される（<head> スクリプトは認証状態を
 * 同期読みできないため、React 側で補正しても一瞬の窓が残る）。
 *
 * signOut は window.location.href による完全遷移なので、React の effect で
 * 遷移を観測する前にドキュメントが破棄される。必ず signOut の「直前」に
 * 同期的に呼ぶこと。
 *
 * @returns 消したかどうか（呼び出し側が _ga Cookie 削除の要否を判断する）
 */
export function clearOwnedConsent(): boolean {
  if (getStoredConsentOwner() === '') return false;
  clearConsentRecord();
  return true;
}

/**
 * 利用者の操作を記録する
 *
 * @param state  granted / denied
 * @param userId 操作時のログインユーザーID。未ログインなら空文字
 * @param nowIso 同意日時。省略時は現在時刻
 */
export function recordConsentDecision(
  state: Extract<ConsentValue, 'granted' | 'denied'>,
  userId: string,
  nowIso: string = new Date().toISOString(),
): void {
  writeConsentRecord({
    state,
    at: nowIso,
    owner: userId,
    version: COOKIE_CONSENT_VERSION,
  });
}

/**
 * 同意状態の変更を購読する
 *
 * 同一タブはカスタムイベント、別タブは storage イベントで届く
 * （storage は書き込んだタブ自身には発火しないので二重にならない）。
 * storage は状態キーの変化だけをトリガにする。付随情報だけの変更で
 * 再レンダリングしても意味がないため。
 */
export function subscribeConsent(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEYS.COOKIE_CONSENT) return;
    onStoreChange();
  };
  window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', handleStorage);
  };
}

/** API へ送れる値かどうか（'unknown' を混入させないための絞り込み） */
export function isConsentValue(value: unknown): value is ConsentValue {
  return (COOKIE_CONSENT_VALUES as readonly unknown[]).includes(value);
}
