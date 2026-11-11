/**
 * オーバーレイをブラウザ履歴に載せるフック
 *
 * ダイアログやドロワーは履歴に載っていないと、戻る操作で「閉じる」のではなく
 * ページごと離脱してしまう（#1026）。Android の戻るジェスチャーはオーバーレイを
 * 閉じる第一の手段なので、スマホで特に影響が大きい。
 *
 * 開いているあいだだけ履歴エントリを1つ積み、戻るでそれが外れたら閉じる。
 * URL は変えない。オーバーレイを共有・ブックマーク可能にするのは別の話で、
 * それには URL を持つルート（intercepting route 等）への作り替えが要る。
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 履歴エントリに載せる所有者トークンのキー。
 *
 * 真偽値だと「誰かのオーバーレイが積んだ」ことしか分からず、入れ子では
 * **他人のエントリを自分のものとして畳んでしまう**（例: 映画詳細の上で
 * 評価モーダルを開き、評価モーダルを閉じずに詳細を × で閉じると、
 * 詳細が評価モーダルのエントリを消す）。エントリごとに一意の値を入れ、
 * 「最前面が自分のものか」を厳密に判定する。
 *
 * ルーターが遷移すると state ごと差し替わるため、遷移に伴う close で
 * 間違って `history.back()` して遷移を取り消すことも防げる。
 */
const OVERLAY_STATE_KEY = '__overlayHistory';

let nextOverlayToken = 0;

/** エントリ固有のトークンを採番する（`crypto` に依存しない） */
function createOverlayToken(): string {
  nextOverlayToken += 1;
  return `overlay-${nextOverlayToken}`;
}

/** 開いているオーバーレイ。末尾が最前面 */
interface OverlayEntry {
  close: () => void;
  /** 戻る操作で外れたか（× やEscで閉じた場合と区別する） */
  popped: boolean;
}

const openOverlays: OverlayEntry[] = [];

let isListening = false;

/**
 * 自分が積んだエントリを畳むために呼んだ `history.back()` のうち、
 * まだ popstate が届いていない数。
 *
 * `history.back()` は**非同期**なので、入れ子のときに残っているリスナーが
 * その popstate を拾い、「ユーザーが戻った」と誤解して別のオーバーレイ
 * （＝外側）を閉じてしまう。自分で起こした分はここで数えて読み飛ばす。
 *
 * 「popstate が来ずカウンタが詰まる」心配は要らない。畳むのは
 * 最前面が**自分のトークンを持つエントリ**のときだけで、それは
 * `pushState` で作った同一ドキュメント・同一URLのエントリなので、
 * 必ず1つ前が存在し `back()` が空振りしない。
 */
let pendingSelfBacks = 0;

/**
 * 閉じたオーバーレイが残した、まだ畳んでいないエントリのトークン。
 *
 * **`history.back()` を即座に呼んではいけない。** back は非同期で、
 * 呼んでから解決するまでの間に `pushState` されたエントリは捨てられる。
 * 「閉じるのと同時に別のオーバーレイが開く」経路（ドロワー → ログイン誘導、
 * ドロワー → 公開カレンダー、カレンダー → 映画詳細）では、React が
 * **cleanup を先に、新しい effect を後に**走らせるため、素直に畳むと
 * 新しいオーバーレイのエントリが消える。戻るとページごと離脱してしまい、
 * #1026 が直した問題がそのまま戻る（実測で確認）。
 *
 * そこで畳むのを1マイクロタスク遅らせる。その間に新しいオーバーレイが
 * 開いたら、そちらが**このエントリを引き継ぐ**（下記 `adoptPendingEntry`）。
 * 引き継がれなければ予定どおり畳む。
 */
const pendingFolds: string[] = [];

/**
 * 畳む予定のエントリを引き継ぐ。
 *
 * 引き継げた場合は `true` を返す。呼び出し側は `pushState` せず、
 * `replaceState` で自分のトークンに書き換えるだけでよい
 */
function adoptPendingEntry(): boolean {
  if (pendingFolds.pop() === undefined) {
    return false;
  }

  // 予約していた戻り1回分を返上する
  pendingSelfBacks -= 1;
  return true;
}

/** 引き継がれなかったエントリを畳む */
function flushPendingFolds(): void {
  while (pendingFolds.length > 0) {
    const token = pendingFolds.pop();

    // 最前面が当のエントリでなければ触らない。ルーターが遷移した後か、
    // 別のオーバーレイが上に積まれている
    if (window.history.state?.[OVERLAY_STATE_KEY] !== token) {
      pendingSelfBacks -= 1;
      continue;
    }

    window.history.back();

    // back は非同期。この時点では最前面がまだ変わっていないので、
    // 残りのトークンを続けて判定しても正しく比較できない。
    // 1コミットで2つ以上のオーバーレイが畳まれる経路は無い
    break;
  }

  // 畳まなかったぶんの予約を返上する
  pendingSelfBacks -= pendingFolds.length;
  pendingFolds.length = 0;
}

/**
 * 戻る操作で最前面のオーバーレイだけを閉じる。
 *
 * 入れ子（映画詳細の上に予告動画）のとき、各フックが個別に popstate を
 * 購読すると全部が同時に閉じてしまう。購読はモジュールで1つだけ持ち、
 * スタックの最後だけに伝える。
 */
function handlePopState(): void {
  if (pendingSelfBacks > 0) {
    // 自分が畳むために起こした戻り。オーバーレイには伝えない。
    // 最後の1つを消化し終え、開いているオーバーレイも無ければ購読を外す
    // （cleanup 側は未着の戻りがあるあいだ外さずに残している）
    pendingSelfBacks -= 1;
    stopListening();
    return;
  }

  const top = openOverlays[openOverlays.length - 1];

  if (!top) {
    return;
  }

  top.popped = true;
  top.close();
}

function startListening(): void {
  if (isListening) {
    return;
  }

  window.addEventListener('popstate', handlePopState);
  isListening = true;
}

/**
 * 購読を外す。
 *
 * 自分で起こした戻りが未着のあいだは外さない。外すと popstate を
 * 読み飛ばせず、`pendingSelfBacks` が減らないまま次の戻るを飲み込む。
 */
function stopListening(): void {
  if (!isListening || openOverlays.length > 0 || pendingSelfBacks > 0) {
    return;
  }

  window.removeEventListener('popstate', handlePopState);
  isListening = false;
}

/**
 * 自分が積んだエントリを畳む予定に入れる。
 *
 * 実際に畳むのはマイクロタスクの後。同じコミットで開く
 * オーバーレイがあれば、そちらが引き継いで畳まれない
 */
function scheduleFold(token: string): void {
  pendingFolds.push(token);
  // 実際に back を呼ぶのは後だが、予約はここで立てる。
  // そうしないと stopListening() が「自分の戻りは未着なし」と誤認して
  // 購読を外し、後から届く popstate を読み飛ばせなくなる
  pendingSelfBacks += 1;
  queueMicrotask(flushPendingFolds);
}

/** {@link useOverlayHistory} の戻り値 */
export interface OverlayHistoryHandlers {
  /**
   * オーバーレイの中から画面遷移するとき、`push` ではなく `replace` を使うか。
   *
   * 自分のエントリが積まれているあいだだけ `true`。そこから `push` すると
   * **エントリが遷移の下に埋まり、戻るが空振りする**（#1043）。`replace` なら
   * 自分のエントリが遷移に置き換わり、戻ると元のページへ出られる。
   *
   * ⚠️ `open` と同値にしてはいけない。エントリが無いときに `replace` すると
   * 置き換わるのは**利用者の実ページのエントリ**で、履歴が1つ失われる。
   *
   * @example
   * ```tsx
   * <Link href={href} replace={shouldReplaceNavigation}>…</Link>
   * ```
   */
  shouldReplaceNavigation: boolean;
  /**
   * 「閉じるのと同時に router で URL を変える」ことを伝える。
   *
   * 畳む処理（`history.back()`）は**非同期**なので、閉じた直後に
   * `router.replace` が走る経路では back が後から届いてその更新を
   * 取り消してしまう（フィルターの「適用」で実測）。
   *
   * 既定は「閉じたら畳む」なので、**この経路だけ**明示的に申告すること。
   * 呼ぶのは router を呼ぶ直前。
   */
  notifyNavigating: () => void;
}

/**
 * オーバーレイの開閉をブラウザ履歴に同期する。
 *
 * @param open オーバーレイが開いているか
 * @param onClose 戻る操作で閉じるときに呼ばれる。呼び出し側は `open` を false にすること
 * @returns オーバーレイ内からの遷移の仕方
 *
 * @example
 * ```tsx
 * const { shouldReplaceNavigation } = useOverlayHistory(open, handleClose);
 * ```
 */
export function useOverlayHistory(
  open: boolean,
  onClose: () => void,
): OverlayHistoryHandlers {
  /**
   * 自分のエントリが実際に積まれているか。
   *
   * `open` では代用できない。effect が走る前や、履歴を扱えない環境では
   * 開いていてもエントリが無い
   */
  const [hasEntry, setHasEntry] = useState(false);

  // onClose の参照が変わるたびに履歴を積み直さないよう、ref 経由で読む
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /**
   * 閉じるのと同時にルーターが URL を変えるか。
   *
   * トークン一致の判定だけでは足りない。`router.replace` は cleanup の
   * **後**に history へ適用されるため、cleanup の時点では自分のエントリが
   * まだ最前面に見える（実測）。そのまま畳むと、後から届く back が
   * replace を打ち消す
   */
  const navigatingRef = useRef(false);

  const notifyNavigating = useCallback(() => {
    navigatingRef.current = true;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    navigatingRef.current = false;

    const entry: OverlayEntry = {
      close: () => onCloseRef.current(),
      popped: false,
    };
    const token = createOverlayToken();

    openOverlays.push(entry);
    startListening();

    // 直前に閉じたオーバーレイのエントリがまだ畳まれずに残っていれば、
    // 新しく積まずにそれを引き継ぐ。積んでしまうと、畳むための
    // 非同期の back がこちらのエントリを巻き添えにする（#1043）
    const nextState = {
      ...window.history.state,
      [OVERLAY_STATE_KEY]: token,
    };

    if (adoptPendingEntry()) {
      window.history.replaceState(nextState, '', window.location.href);
    } else {
      window.history.pushState(nextState, '', window.location.href);
    }

    /*
      エントリを積んだ事実を描画へ反映するには、ここで state を更新するしか
      ない。描画中に history は触れないし、ref では再描画が起きないため
      `<Link replace={…}>` に正しい値が渡らない。`open` で代用すると、
      エントリが無いときに replace して利用者の実ページを消す（#1043）
    */
    /* eslint-disable react-hooks/set-state-in-effect */
    setHasEntry(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      /* eslint-disable react-hooks/set-state-in-effect */
      setHasEntry(false);
      /* eslint-enable react-hooks/set-state-in-effect */

      const index = openOverlays.indexOf(entry);

      if (index !== -1) {
        openOverlays.splice(index, 1);
      }

      // 畳むかどうかを先に決める。判断材料は2つだけ。
      //
      // - popped: 戻るで外れた分。ここで畳むと1つ余計に戻ってしまう
      // - トークン一致: 最前面が自分のエントリであること。
      //   一致しないのは「入れ子の内側が畳まずに残した」か
      //   「ルーターが遷移して state ごと差し替わった」場合で、
      //   畳むと他人のエントリや遷移を消してしまう
      //
      // 以前は「ユーザーが閉じたときだけ」という条件も課していたが、
      // アプリ側が open を false にする閉じ方（フィルターの適用、ナビ
      // リンク、評価モーダルの登録…）でエントリが残り、戻るが空振り
      // した（#1043）。遷移の取り消しはトークン一致の判定で防げるため、
      // 閉じ方では分けない
      const shouldFold =
        !entry.popped &&
        !navigatingRef.current &&
        window.history.state?.[OVERLAY_STATE_KEY] === token;

      if (shouldFold) {
        scheduleFold(token);
      }

      // 購読の解除は畳む判断の後。先に外すと、自分で起こした戻りの
      // popstate を読み飛ばせず、次の戻るを飲み込んでしまう
      stopListening();
    };
  }, [open]);

  return { shouldReplaceNavigation: hasEntry, notifyNavigating };
}
