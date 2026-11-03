/**
 * マージ規則のテスト
 *
 * 設計書 §4.4 の網羅表（23ケース）をそのまま表駆動で固定する。
 * この表は第3〜5版で繰り返し壊れた箇所なので、挙動を変えるときは
 * 必ず設計書の表も同時に直すこと。
 */

import {
  resolveConsentMerge,
  type ConsentMergeReason,
  type ConsentRecord,
  type LocalConsentRecord,
} from './resolveConsentMerge';

const V = 1; // currentVersion
const OLD = 0;
const FUTURE = 2;

const T1 = '2026-11-03T00:00:00.000Z';
const T2 = '2026-11-04T00:00:00.000Z';
const BROKEN = 'not-a-date';

const ME = 'user-me';
const OTHER = 'user-other';

/** 未決定の端末レコード（未決定は未保存で表現するため付随情報も空） */
const LOCAL_UNSET: LocalConsentRecord = {
  state: 'unset',
  at: null,
  owner: '',
  version: null,
};
const SERVER_UNSET: ConsentRecord = { state: 'unset', at: null, version: null };

interface Case {
  no: number;
  title: string;
  local: LocalConsentRecord;
  server: ConsentRecord;
  effectiveState: 'unset' | 'granted' | 'denied';
  /** null = 書かない / 'clear' = 消す / それ以外は書き込む内容 */
  localWrite: null | 'clear' | LocalConsentRecord;
  putBody: null | { cookieConsent: string; cookieConsentAt: string | null };
  reason: ConsentMergeReason;
}

const CASES: Case[] = [
  {
    no: 1,
    title: '両方とも未決定なら何もしない',
    local: LOCAL_UNSET,
    server: SERVER_UNSET,
    effectiveState: 'unset',
    localWrite: null,
    putBody: null,
    reason: 'undecided',
  },
  {
    no: 2,
    title: '端末が未決定ならサーバーの同意を降ろす',
    local: LOCAL_UNSET,
    server: { state: 'granted', at: T1, version: V },
    effectiveState: 'granted',
    localWrite: { state: 'granted', at: T1, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 3,
    title: '端末が未決定ならサーバーの拒否を降ろす',
    local: LOCAL_UNSET,
    server: { state: 'denied', at: T1, version: V },
    effectiveState: 'denied',
    localWrite: { state: 'denied', at: T1, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 4,
    title: '未認証で得た同意をログイン時にサーバーへ上げる',
    local: { state: 'granted', at: T1, owner: '', version: V },
    server: SERVER_UNSET,
    effectiveState: 'granted',
    localWrite: { state: 'granted', at: T1, owner: ME, version: V },
    putBody: { cookieConsent: 'granted', cookieConsentAt: T1 },
    reason: 'adopt-local',
  },
  {
    no: 5,
    title: '未認証で得た拒否をログイン時にサーバーへ上げる',
    local: { state: 'denied', at: T1, owner: '', version: V },
    server: SERVER_UNSET,
    effectiveState: 'denied',
    localWrite: { state: 'denied', at: T1, owner: ME, version: V },
    putBody: { cookieConsent: 'denied', cookieConsentAt: T1 },
    reason: 'adopt-local',
  },
  {
    no: 6,
    title: 'サーバーの方が新しければサーバーを採る',
    local: { state: 'granted', at: T1, owner: ME, version: V },
    server: { state: 'denied', at: T2, version: V },
    effectiveState: 'denied',
    localWrite: { state: 'denied', at: T2, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 7,
    title: '端末の撤回が新しければサーバーへ伝播する',
    local: { state: 'denied', at: T2, owner: ME, version: V },
    server: { state: 'granted', at: T1, version: V },
    effectiveState: 'denied',
    localWrite: null,
    putBody: { cookieConsent: 'denied', cookieConsentAt: T2 },
    reason: 'adopt-local',
  },
  {
    no: 8,
    title: '完全に一致していれば何も書かない（最頻ケース）',
    local: { state: 'granted', at: T1, owner: ME, version: V },
    server: { state: 'granted', at: T1, version: V },
    effectiveState: 'granted',
    localWrite: null,
    putBody: null,
    reason: 'in-sync',
  },
  {
    no: 9,
    title: '未認証で得た新しい同意は、所有者を付けつつサーバーも更新する',
    local: { state: 'granted', at: T2, owner: '', version: V },
    server: { state: 'denied', at: T1, version: V },
    effectiveState: 'granted',
    localWrite: { state: 'granted', at: T2, owner: ME, version: V },
    putBody: { cookieConsent: 'granted', cookieConsentAt: T2 },
    reason: 'adopt-local',
  },
  {
    no: 10,
    title: '他人の同意は端末から消し、自分の記録には書かない',
    local: { state: 'granted', at: T1, owner: OTHER, version: V },
    server: SERVER_UNSET,
    effectiveState: 'unset',
    localWrite: 'clear',
    putBody: null,
    reason: 'clear-foreign',
  },
  {
    no: 11,
    title: '他人の同意はサーバー値で上書きする',
    local: { state: 'granted', at: T1, owner: OTHER, version: V },
    server: { state: 'denied', at: T2, version: V },
    effectiveState: 'denied',
    localWrite: { state: 'denied', at: T2, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 12,
    title: '端末が旧版なら未決定として扱い、記録は消さない',
    local: { state: 'granted', at: T1, owner: ME, version: OLD },
    server: SERVER_UNSET,
    effectiveState: 'unset',
    localWrite: null,
    putBody: null,
    reason: 'stale-local',
  },
  {
    no: 13,
    title: 'サーバーだけ旧版なら、状態が同じでも版を更新するため送る',
    local: { state: 'granted', at: T1, owner: ME, version: V },
    server: { state: 'granted', at: T1, version: OLD },
    effectiveState: 'granted',
    localWrite: null,
    putBody: { cookieConsent: 'granted', cookieConsentAt: T1 },
    reason: 'adopt-local',
  },
  {
    no: 14,
    title: 'サーバーが未来版なら古い版で上書きしない',
    local: { state: 'granted', at: T1, owner: ME, version: V },
    server: { state: 'granted', at: T1, version: FUTURE },
    effectiveState: 'granted',
    localWrite: null,
    putBody: null,
    reason: 'skip-future-server',
  },
  {
    no: 15,
    title: '同時刻ならサーバーを採る',
    local: { state: 'granted', at: T1, owner: ME, version: V },
    server: { state: 'denied', at: T1, version: V },
    effectiveState: 'denied',
    localWrite: { state: 'denied', at: T1, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 16,
    title: '端末に日時が無ければ、日時を持つサーバーを採る',
    local: { state: 'granted', at: null, owner: ME, version: V },
    server: { state: 'granted', at: T1, version: V },
    effectiveState: 'granted',
    localWrite: { state: 'granted', at: T1, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 17,
    title: '端末の日時がパース不能なら日時なし扱いで、書き直して修復する',
    local: { state: 'granted', at: BROKEN, owner: ME, version: V },
    server: { state: 'denied', at: T1, version: V },
    effectiveState: 'denied',
    localWrite: { state: 'denied', at: T1, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 18,
    title: '値が同じでも所有者が違えば付け替えのために書く',
    local: { state: 'granted', at: T1, owner: '', version: V },
    server: { state: 'granted', at: T1, version: V },
    effectiveState: 'granted',
    localWrite: { state: 'granted', at: T1, owner: ME, version: V },
    putBody: null,
    reason: 'claim-owner',
  },
  {
    no: 19,
    title: '日時が欠けていても撤回は同意へ差し戻されない',
    local: { state: 'denied', at: null, owner: ME, version: V },
    server: { state: 'granted', at: T1, version: V },
    effectiveState: 'denied',
    localWrite: null,
    putBody: { cookieConsent: 'denied', cookieConsentAt: null },
    reason: 'adopt-local',
  },
  {
    no: 20,
    title: '版を上げたあと、別端末の再同意に追いつく',
    local: { state: 'granted', at: T1, owner: ME, version: OLD },
    server: { state: 'granted', at: T2, version: V },
    effectiveState: 'granted',
    localWrite: { state: 'granted', at: T2, owner: ME, version: V },
    putBody: null,
    reason: 'adopt-server',
  },
  {
    no: 21,
    title: 'サーバーだけ旧版で端末が無記録なら、再同意を求める',
    local: LOCAL_UNSET,
    server: { state: 'granted', at: T1, version: OLD },
    effectiveState: 'unset',
    localWrite: null,
    putBody: null,
    reason: 'undecided',
  },
  {
    no: 22,
    title: '端末が未来版（ロールバック時）なら未決定として扱う',
    local: { state: 'granted', at: T1, owner: ME, version: FUTURE },
    server: SERVER_UNSET,
    effectiveState: 'unset',
    localWrite: null,
    putBody: null,
    reason: 'stale-local',
  },
  {
    no: 23,
    title: 'サーバーの版が null（移行行）なら版を書きにいく',
    local: { state: 'granted', at: T1, owner: ME, version: V },
    server: { state: 'granted', at: T1, version: null },
    effectiveState: 'granted',
    localWrite: null,
    putBody: { cookieConsent: 'granted', cookieConsentAt: T1 },
    reason: 'adopt-local',
  },
];

describe('resolveConsentMerge', () => {
  describe('分岐表（設計書 §4.4）', () => {
    it.each(CASES)('ケース$no: $title', (testCase) => {
      const result = resolveConsentMerge({
        local: testCase.local,
        server: testCase.server,
        userId: ME,
        currentVersion: V,
      });

      expect(result.effectiveState).toBe(testCase.effectiveState);
      expect(result.reason).toBe(testCase.reason);
      expect(result.putBody).toEqual(testCase.putBody);

      if (testCase.localWrite === null) {
        expect(result.localWrite).toBeNull();
      } else if (testCase.localWrite === 'clear') {
        expect(result.localWrite).toEqual({ action: 'clear' });
      } else {
        expect(result.localWrite).toEqual({
          action: 'write',
          record: testCase.localWrite,
        });
      }
    });
  });

  describe('時刻の比較', () => {
    it('表記が違っても同一インスタントなら一致扱いにする', () => {
      // クライアントは toISOString() で "…Z"、PostgREST は "…+00:00" を返す。
      // 文字列比較だと辞書順で '+' < 'Z' となり「端末が新しい」と誤判定され、
      // 毎ページロードで PUT が飛び続ける
      const result = resolveConsentMerge({
        local: {
          state: 'granted',
          at: '2026-11-03T00:00:00.000Z',
          owner: ME,
          version: V,
        },
        server: {
          state: 'granted',
          at: '2026-11-03T00:00:00.000+00:00',
          version: V,
        },
        userId: ME,
        currentVersion: V,
      });

      expect(result.reason).toBe('in-sync');
      expect(result.localWrite).toBeNull();
      expect(result.putBody).toBeNull();
    });

    it('ミリ秒単位の差も新旧として扱う', () => {
      const result = resolveConsentMerge({
        local: {
          state: 'denied',
          at: '2026-11-03T00:00:00.002Z',
          owner: ME,
          version: V,
        },
        server: {
          state: 'granted',
          at: '2026-11-03T00:00:00.001Z',
          version: V,
        },
        userId: ME,
        currentVersion: V,
      });

      expect(result.effectiveState).toBe('denied');
    });
  });

  describe('事前条件', () => {
    it('userId が空文字なら throw する', () => {
      // owner==='' （未認証の操作）と区別できなくなるため
      expect(() =>
        resolveConsentMerge({
          local: LOCAL_UNSET,
          server: SERVER_UNSET,
          userId: '',
          currentVersion: V,
        }),
      ).toThrow('userId is required');
    });
  });

  describe('副作用を持たない', () => {
    it('引数のオブジェクトを変更しない', () => {
      const local: LocalConsentRecord = {
        state: 'granted',
        at: T1,
        owner: '',
        version: V,
      };
      const server: ConsentRecord = { state: 'denied', at: T2, version: V };

      resolveConsentMerge({ local, server, userId: ME, currentVersion: V });

      expect(local).toEqual({
        state: 'granted',
        at: T1,
        owner: '',
        version: V,
      });
      expect(server).toEqual({ state: 'denied', at: T2, version: V });
    });
  });
});
