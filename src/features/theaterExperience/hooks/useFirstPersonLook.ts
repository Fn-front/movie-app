/**
 * 一人称視点の視点操作フック（ドラッグ／キーボード／ホイール・ピンチ）
 *
 * 可変状態を **ref に持つ**のが要点。ポインタ移動のたびに setState すると
 * 劇場ページ全体が再レンダーされるため、値は ref で 3D 側（useFrame）へ渡し、
 * React の再レンダーを発生させない。
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';

import {
  DEFAULT_LOOK_OFFSET,
  DRAG_THRESHOLD_PX,
  applyDragDelta,
  applyKeyboardLook,
  applyPinchZoom,
  applyWheelZoom,
  type FirstPersonLookState,
  type LookOffset,
} from '../utils/firstPersonLook';

export type { FirstPersonLookState };

/** 操作領域に割り当てるイベントハンドラ */
export interface FirstPersonLookHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface UseFirstPersonLookReturn {
  /** 3Dカメラへ渡す視点状態（再レンダーを起こさないよう ref で共有する） */
  lookRef: RefObject<FirstPersonLookState>;
  /** 操作領域の要素に割り当てる ref（幅の取得と wheel の購読に使う） */
  containerRef: RefObject<HTMLDivElement | null>;
  /** 操作領域に割り当てるイベントハンドラ */
  handlers: FirstPersonLookHandlers;
  /** 視点の向きとズームを初期状態へ戻す */
  reset: () => void;
  /**
   * 直前のポインタ操作がドラッグだったか。
   * ドラッグ終了直後に発火するクリックを席替えとして扱わないために参照する
   * （次の pointerdown まで true のまま）。
   */
  isDraggingRef: RefObject<boolean>;
}

/** 追跡中のポインタ2点の距離。2点未満なら null */
function calcPinchDistance(
  pointers: Map<number, { x: number; y: number }>,
): number | null {
  if (pointers.size < 2) return null;
  const [a, b] = Array.from(pointers.values());
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * @param enabled 一人称視点のときだけ true。false の間は入力を受け付けない
 */
export function useFirstPersonLook(enabled: boolean): UseFirstPersonLookReturn {
  const lookRef = useRef<FirstPersonLookState>({
    ...DEFAULT_LOOK_OFFSET,
    basePitch: 0,
    resetToken: 0,
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  /** 押下中のポインタ（ピンチ判定のため複数を追跡する） */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  /** 1本指ドラッグの起点。しきい値判定に使う */
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  /** 直前のピンチ距離 */
  const pinchDistanceRef = useRef<number | null>(null);

  const setOffset = useCallback((next: LookOffset) => {
    const state = lookRef.current;
    state.yaw = next.yaw;
    state.pitch = next.pitch;
    state.zoom = next.zoom;
  }, []);

  const reset = useCallback(() => {
    const state = lookRef.current;
    state.yaw = DEFAULT_LOOK_OFFSET.yaw;
    state.pitch = DEFAULT_LOOK_OFFSET.pitch;
    state.zoom = DEFAULT_LOOK_OFFSET.zoom;
    state.resetToken += 1;
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const pointers = pointersRef.current;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // 新しい操作の開始。直前のドラッグによるクリック抑止はここで解除する
      isDraggingRef.current = false;
      if (pointers.size === 1) {
        dragStartRef.current = { x: event.clientX, y: event.clientY };
      } else {
        // 2本目以降はピンチへ移行する（回転は止める）
        dragStartRef.current = null;
        pinchDistanceRef.current = calcPinchDistance(pointers);
      }
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      const pointers = pointersRef.current;
      const previous = pointers.get(event.pointerId);
      // 押していない状態の移動（ホバー）は視点を動かさない
      if (!previous) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size >= 2) {
        const distance = calcPinchDistance(pointers);
        const last = pinchDistanceRef.current;
        if (distance !== null && last !== null && last > 0) {
          setOffset(applyPinchZoom(lookRef.current, distance / last));
        }
        pinchDistanceRef.current = distance;
        // ピンチ直後のクリックも席替えとして扱わない
        isDraggingRef.current = true;
        return;
      }

      const start = dragStartRef.current;
      if (!start) return;

      if (!isDraggingRef.current) {
        const moved = Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y,
        );
        // しきい値未満の微小なブレは「クリック（席替え）」として扱う
        if (moved < DRAG_THRESHOLD_PX) return;
        isDraggingRef.current = true;
        // 操作領域の外へ出ても追従させる（捕捉できない環境でも操作自体は続く）
        const element = containerRef.current;
        if (element && typeof element.setPointerCapture === 'function') {
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
            // 捕捉不可でもドラッグは継続できるため握りつぶす
          }
        }
      }

      setOffset(
        applyDragDelta(
          lookRef.current,
          event.clientX - previous.x,
          event.clientY - previous.y,
          containerRef.current?.clientWidth ?? 0,
          lookRef.current.basePitch,
        ),
      );
    },
    [enabled, setOffset],
  );

  const endPointer = useCallback((event: PointerEvent<HTMLElement>) => {
    const pointers = pointersRef.current;
    pointers.delete(event.pointerId);
    const element = containerRef.current;
    if (element && typeof element.releasePointerCapture === 'function') {
      try {
        element.releasePointerCapture(event.pointerId);
      } catch {
        // 捕捉していなければ解放も不要
      }
    }
    if (pointers.size < 2) pinchDistanceRef.current = null;
    if (pointers.size === 1) {
      // ピンチの片方を離した場合、残った指を起点にドラッグへ戻す
      const [remaining] = Array.from(pointers.values());
      dragStartRef.current = { ...remaining };
    } else if (pointers.size === 0) {
      dragStartRef.current = null;
    }
    // isDraggingRef は次の pointerdown まで保持する（直後のクリック抑止のため）
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      const next = applyKeyboardLook(
        lookRef.current,
        event.key,
        lookRef.current.basePitch,
      );
      // 対象外のキーはページの既定動作（Tab移動等）を妨げない
      if (!next) return;
      // 矢印キーでのページスクロールを止める
      event.preventDefault();
      setOffset(next);
    },
    [enabled, setOffset],
  );

  /*
    wheel だけは React の合成イベントを使えない。React は wheel を passive で
    購読するため preventDefault が効かず、ズームと同時にページがスクロールする。
  */
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !enabled) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setOffset(applyWheelZoom(lookRef.current, event.deltaY));
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [enabled, setOffset]);

  /*
    一人称の出入りで視点を持ち越さない。操作途中で視点が切り替わった場合に
    ポインタ追跡が残らないよう、ここで一緒に片付ける。
  */
  useEffect(() => {
    pointersRef.current.clear();
    dragStartRef.current = null;
    pinchDistanceRef.current = null;
    isDraggingRef.current = false;
    reset();
  }, [enabled, reset]);

  const handlers = useMemo<FirstPersonLookHandlers>(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onKeyDown,
    }),
    [onPointerDown, onPointerMove, endPointer, onKeyDown],
  );

  return useMemo(
    () => ({ lookRef, containerRef, handlers, reset, isDraggingRef }),
    [handlers, reset],
  );
}
