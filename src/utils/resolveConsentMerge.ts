/**
 * 端末とサーバーの同意レコードをマージする純関数
 *
 * 副作用を持たない。localStorage も読まず、引数で受け取った値だけで決める。
 * 呼び出し側（useConsentServerSync）が結果を localStorage と PUT へ反映する。
 *
 * 分岐は docs/superpowers/specs/2026-11-03-ga4-cookie-consent-design.md §4.4 の
 * 網羅表（23ケース）で固定してある。挙動を変えるときは必ず表も直すこと。
 */

import type { ConsentValue } from '@/constants/user';

/** 同意レコード（サーバー側はこの形） */
export interface ConsentRecord {
  state: ConsentValue;
  /** ISO 8601。不明なら null */
  at: string | null;
  version: number | null;
}

/** 端末側は所有者を持つ */
export interface LocalConsentRecord extends ConsentRecord {
  /** 操作時のユーザーID。未ログイン時の操作は空文字 */
  owner: string;
}

/** 結論に至った理由。テストと障害調査のために返す */
export type ConsentMergeReason =
  /** 有効なレコードが無い */
  | 'undecided'
  /** 端末もサーバーも採用値と一致。何も書かない */
  | 'in-sync'
  /** サーバー値を端末へ降ろす */
  | 'adopt-server'
  /** 端末値をサーバーへ上げる */
  | 'adopt-local'
  /** 値は一致。所有者だけ現ユーザーへ付け替える */
  | 'claim-owner'
  /** 他人のレコードを端末から消す */
  | 'clear-foreign'
  /** 端末が現行版でない。消さずに未決定として扱う */
  | 'stale-local'
  /** サーバーが未来版。古い版で上書きしない */
  | 'skip-future-server';

export type ConsentLocalWrite =
  | { action: 'write'; record: LocalConsentRecord }
  | { action: 'clear' };

export interface ConsentMergeResult {
  /** UI と gtag が従う値 */
  effectiveState: ConsentValue;
  /** localStorage への反映。null なら触らない */
  localWrite: ConsentLocalWrite | null;
  /** PUT のボディ。null なら送らない */
  putBody: {
    cookieConsent: ConsentValue;
    cookieConsentAt: string | null;
  } | null;
  reason: ConsentMergeReason;
}

export interface ResolveConsentMergeParams {
  local: LocalConsentRecord;
  server: ConsentRecord;
  /** 現在のログインユーザーID。空文字は呼び出し側の誤り */
  userId: string;
  currentVersion: number;
}

/**
 * 時刻をエポック値へ変換する（比較は必ずこれを通す）
 *
 * 文字列のまま比較してはいけない。クライアントは `…Z`、PostgREST は
 * `…+00:00` を返すため、同一時刻でも不一致になる。しかも辞書順では
 * '+'(0x2B) < 'Z'(0x5A) なので「端末のほうが新しい」と誤判定し、
 * 毎ページロードで PUT が飛び続ける。
 */
function toEpoch(at: string | null): number | null {
  if (at === null) return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

export function resolveConsentMerge({
  local,
  server,
  userId,
  currentVersion,
}: ResolveConsentMergeParams): ConsentMergeResult {
  // owner==='' （未認証の操作）と区別できなくなるため、空のIDは誤り
  if (userId === '') {
    throw new Error('resolveConsentMerge: userId is required');
  }

  // 1. 端末レコードの有効性を判定する（localStorage は書き換えない）
  const isForeign = local.owner !== '' && local.owner !== userId;
  const isStaleLocal =
    local.state !== 'unset' && local.version !== currentVersion;
  const effectiveLocal =
    local.state === 'unset' || isForeign || isStaleLocal ? null : local;

  // 2. サーバーレコードの有効性を判定する
  const isFutureServer =
    server.version !== null && server.version > currentVersion;
  const effectiveServer =
    server.state === 'unset' || server.version !== currentVersion
      ? null
      : server;

  // 3. 採用値を決める
  let adopted: ConsentRecord | null;
  if (!effectiveLocal && !effectiveServer) {
    adopted = null;
  } else if (!effectiveLocal) {
    adopted = effectiveServer;
  } else if (!effectiveServer) {
    adopted = effectiveLocal;
  } else {
    const le = toEpoch(effectiveLocal.at);
    const se = toEpoch(effectiveServer.at);
    if (le !== null && se !== null && le !== se) {
      adopted = le > se ? effectiveLocal : effectiveServer;
    } else if (
      effectiveLocal.state === 'denied' &&
      effectiveServer.state !== 'denied'
    ) {
      // 時刻で決着しないとき（同値・片方null・双方null・パース不能）は
      // denied を採る。日時が欠けている／壊れているだけで撤回が同意へ
      // 差し戻されるのを防ぐ
      adopted = effectiveLocal;
    } else if (
      effectiveServer.state === 'denied' &&
      effectiveLocal.state !== 'denied'
    ) {
      adopted = effectiveServer;
    } else if (le !== null && se === null) {
      adopted = effectiveLocal;
    } else if (se !== null && le === null) {
      adopted = effectiveServer;
    } else {
      adopted = effectiveServer;
    }
  }

  // 4. UI と gtag が従う値
  const effectiveState: ConsentValue = adopted ? adopted.state : 'unset';

  // 5. localStorage への書き込み
  let localWrite: ConsentLocalWrite | null = null;
  if (adopted === null) {
    // 他人のレコードだけ消す。旧版は記録として残す
    if (isForeign) localWrite = { action: 'clear' };
  } else {
    // 日時がパース不能なら、値が実質同じでも書き直して修復する
    const atBroken = local.at !== null && toEpoch(local.at) === null;
    const same =
      adopted.state === local.state &&
      toEpoch(adopted.at) === toEpoch(local.at) &&
      adopted.version === local.version &&
      local.owner === userId &&
      !atBroken;
    if (!same) {
      localWrite = { action: 'write', record: { ...adopted, owner: userId } };
    }
  }

  // 6. PUT
  // 日時の差だけでは送らない。サーバーは状態が変わらない PUT で日時を
  // 更新しないため、日時で送ると「送ってもサーバー値が変わらない」→
  // 毎ロード PUT という非収束になる
  let putBody: ConsentMergeResult['putBody'] = null;
  if (adopted !== null && !isFutureServer) {
    const sameAsServer =
      adopted.state === server.state && adopted.version === server.version;
    if (!sameAsServer) {
      putBody = { cookieConsent: adopted.state, cookieConsentAt: adopted.at };
    }
  }

  // 7. 理由（出力3列からは一意に決まらないので中間変数から決める）
  let reason: ConsentMergeReason;
  if (adopted === null) {
    reason = isForeign
      ? 'clear-foreign'
      : isStaleLocal
        ? 'stale-local'
        : 'undecided';
  } else if (isFutureServer) {
    reason = 'skip-future-server';
  } else if (localWrite === null && putBody === null) {
    reason = 'in-sync';
  } else if (
    localWrite !== null &&
    putBody === null &&
    adopted.state === local.state &&
    adopted.version === local.version &&
    local.owner !== userId
  ) {
    reason = 'claim-owner';
  } else if (adopted === effectiveServer) {
    reason = 'adopt-server';
  } else {
    reason = 'adopt-local';
  }

  return { effectiveState, localWrite, putBody, reason };
}
