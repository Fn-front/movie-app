/**
 * useFirstPersonLook フック テスト
 */

import type { KeyboardEvent, PointerEvent } from 'react';
import { act, renderHook } from '@testing-library/react';

import {
  DRAG_THRESHOLD_PX,
  MAX_TOTAL_PITCH_RAD,
  MAX_ZOOM,
} from '../utils/firstPersonLook';

import { useFirstPersonLook } from './useFirstPersonLook';

const VIEWPORT_WIDTH = 800;

/** clientWidth を持つ操作領域の代役 */
function createContainer(): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: VIEWPORT_WIDTH });
  return element;
}

function pointerEvent(
  pointerId: number,
  clientX: number,
  clientY: number,
): PointerEvent<HTMLElement> {
  return { pointerId, clientX, clientY } as PointerEvent<HTMLElement>;
}

function keyEvent(key: string): KeyboardEvent<HTMLElement> & {
  preventDefault: jest.Mock;
} {
  return {
    key,
    preventDefault: jest.fn(),
  } as unknown as KeyboardEvent<HTMLElement> & {
    preventDefault: jest.Mock;
  };
}

/**
 * ポインタ捕捉に対応した操作領域。
 * jsdom は setPointerCapture / releasePointerCapture を実装しないため自前で生やす。
 */
function createCapturingContainer(behavior: 'ok' | 'throw' = 'ok') {
  const element = createContainer();
  const setPointerCapture = jest.fn(() => {
    if (behavior === 'throw') throw new Error('capture unavailable');
  });
  const releasePointerCapture = jest.fn(() => {
    if (behavior === 'throw') throw new Error('release unavailable');
  });
  Object.assign(element, { setPointerCapture, releasePointerCapture });
  return { element, setPointerCapture, releasePointerCapture };
}

/** 操作領域を割り当てたうえで一人称を有効にしたフックを返す */
function renderEnabledHook(container: HTMLDivElement = createContainer()) {
  const view = renderHook(
    ({ enabled }: { enabled: boolean }) => useFirstPersonLook(enabled),
    { initialProps: { enabled: false } },
  );
  view.result.current.containerRef.current = container;
  act(() => view.rerender({ enabled: true }));
  return { ...view, container };
}

describe('useFirstPersonLook', () => {
  describe('ドラッグ操作', () => {
    it('しきい値を超えて動かすと視点が回る', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(pointerEvent(1, 200, 160));
      });

      expect(lookRef.current.yaw).toBeGreaterThan(0);
      expect(lookRef.current.pitch).toBeGreaterThan(0);
      expect(result.current.isDraggingRef.current).toBe(true);
    });

    it('しきい値未満の移動では回らず、クリック（席替え）として扱う', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(
          pointerEvent(1, 100 + DRAG_THRESHOLD_PX - 1, 100),
        );
        handlers.onPointerUp(pointerEvent(1, 100 + DRAG_THRESHOLD_PX - 1, 100));
      });

      expect(lookRef.current.yaw).toBe(0);
      expect(result.current.isDraggingRef.current).toBe(false);
    });

    it('ドラッグ判定は指を離した後も次の押下まで保持する（直後のクリックを抑止）', () => {
      const { result } = renderEnabledHook();
      const { handlers, isDraggingRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(pointerEvent(1, 300, 100));
        handlers.onPointerUp(pointerEvent(1, 300, 100));
      });
      expect(isDraggingRef.current).toBe(true);

      act(() => handlers.onPointerDown(pointerEvent(1, 300, 100)));
      expect(isDraggingRef.current).toBe(false);
    });

    it('押していない状態の移動（ホバー）では回らない', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => handlers.onPointerMove(pointerEvent(1, 400, 400)));

      expect(lookRef.current.yaw).toBe(0);
      expect(lookRef.current.pitch).toBe(0);
    });

    it('基準の見上げ角と合算して上下の可動域を制限する', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;
      lookRef.current.basePitch = 20 * (Math.PI / 180);

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(pointerEvent(1, 100, 100000));
      });

      expect(lookRef.current.pitch).toBeCloseTo(
        MAX_TOTAL_PITCH_RAD - lookRef.current.basePitch,
        6,
      );
    });

    it('pointercancel でもポインタ追跡が片付く', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(pointerEvent(1, 300, 100));
        handlers.onPointerCancel(pointerEvent(1, 300, 100));
      });
      const yawAfterCancel = lookRef.current.yaw;

      // 追跡が残っていれば、押していないのに動いてしまう
      act(() => handlers.onPointerMove(pointerEvent(1, 500, 100)));
      expect(lookRef.current.yaw).toBe(yawAfterCancel);
    });

    it('ドラッグ開始でポインタを捕捉し、終了で解放する（領域外へ出ても追従させる）', () => {
      const { element, setPointerCapture, releasePointerCapture } =
        createCapturingContainer();
      const { result } = renderEnabledHook(element);
      const { handlers } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        // しきい値未満では捕捉しない（クリックの可能性が残っているため）
        handlers.onPointerMove(pointerEvent(1, 102, 100));
      });
      expect(setPointerCapture).not.toHaveBeenCalled();

      act(() => handlers.onPointerMove(pointerEvent(1, 300, 100)));
      expect(setPointerCapture).toHaveBeenCalledWith(1);

      act(() => handlers.onPointerUp(pointerEvent(1, 300, 100)));
      expect(releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('ポインタ捕捉に失敗してもドラッグは継続できる', () => {
      const { element } = createCapturingContainer('throw');
      const { result } = renderEnabledHook(element);
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(pointerEvent(1, 300, 100));
        handlers.onPointerUp(pointerEvent(1, 300, 100));
      });

      expect(lookRef.current.yaw).toBeGreaterThan(0);
    });

    it('一人称でないときは操作を受け付けない', () => {
      const container = createContainer();
      const { result } = renderHook(() => useFirstPersonLook(false));
      result.current.containerRef.current = container;

      act(() => {
        result.current.handlers.onPointerDown(pointerEvent(1, 100, 100));
        result.current.handlers.onPointerMove(pointerEvent(1, 400, 100));
      });

      expect(result.current.lookRef.current.yaw).toBe(0);
    });
  });

  describe('ピンチ操作', () => {
    it('2本指を広げるとズームインし、視点は回らない', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerDown(pointerEvent(2, 200, 100));
        // 2点間距離を 100 → 200 に広げる
        handlers.onPointerMove(pointerEvent(2, 300, 100));
      });

      expect(lookRef.current.zoom).toBeCloseTo(2, 6);
      expect(lookRef.current.yaw).toBe(0);
    });

    it('片方の指を離すと、残った指でのドラッグに戻る', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerDown(pointerEvent(2, 200, 100));
        handlers.onPointerUp(pointerEvent(2, 200, 100));
        handlers.onPointerMove(pointerEvent(1, 300, 100));
      });

      expect(lookRef.current.yaw).toBeGreaterThan(0);
    });

    it('2本指を狭めるとズームアウトする', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerDown(pointerEvent(2, 300, 100));
        handlers.onPointerMove(pointerEvent(2, 200, 100));
      });

      expect(lookRef.current.zoom).toBeLessThan(1);
    });
  });

  describe('キーボード操作', () => {
    it('矢印キーで視点が回り、ページスクロールを止める', () => {
      const { result } = renderEnabledHook();
      const event = keyEvent('ArrowRight');

      act(() => result.current.handlers.onKeyDown(event));

      expect(result.current.lookRef.current.yaw).toBeLessThan(0);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('プラスキーでズームインする', () => {
      const { result } = renderEnabledHook();

      act(() => result.current.handlers.onKeyDown(keyEvent('+')));

      expect(result.current.lookRef.current.zoom).toBeGreaterThan(1);
    });

    it('対象外のキーは既定動作を妨げない', () => {
      const { result } = renderEnabledHook();
      const event = keyEvent('Tab');

      act(() => result.current.handlers.onKeyDown(event));

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(result.current.lookRef.current.yaw).toBe(0);
    });
  });

  describe('ホイール操作', () => {
    it('ホイールでズームし、ページスクロールを止める', () => {
      const { result, container } = renderEnabledHook();
      const event = new WheelEvent('wheel', { deltaY: -200, cancelable: true });

      act(() => {
        container.dispatchEvent(event);
      });

      expect(result.current.lookRef.current.zoom).toBeGreaterThan(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('上限を超えてズームインしない', () => {
      const { result, container } = renderEnabledHook();

      act(() => {
        for (let i = 0; i < 50; i++) {
          container.dispatchEvent(new WheelEvent('wheel', { deltaY: -200 }));
        }
      });

      expect(result.current.lookRef.current.zoom).toBe(MAX_ZOOM);
    });

    it('一人称を抜けるとホイールの購読を解除する', () => {
      const { result, container, rerender } = renderEnabledHook();

      act(() => rerender({ enabled: false }));
      act(() => {
        container.dispatchEvent(new WheelEvent('wheel', { deltaY: -200 }));
      });

      expect(result.current.lookRef.current.zoom).toBe(1);
    });
  });

  describe('リセット', () => {
    it('向きとズームを初期状態へ戻し、カメラ側へ通知する', () => {
      const { result } = renderEnabledHook();
      const { handlers, lookRef, reset } = result.current;
      const tokenBefore = lookRef.current.resetToken;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(pointerEvent(1, 300, 300));
        handlers.onKeyDown(keyEvent('+'));
      });
      expect(lookRef.current.yaw).not.toBe(0);

      act(() => reset());

      expect(lookRef.current.yaw).toBe(0);
      expect(lookRef.current.pitch).toBe(0);
      expect(lookRef.current.zoom).toBe(1);
      expect(lookRef.current.resetToken).toBeGreaterThan(tokenBefore);
    });

    it('一人称を抜けると視点を持ち越さない', () => {
      const { result, rerender } = renderEnabledHook();
      const { handlers, lookRef } = result.current;

      act(() => {
        handlers.onPointerDown(pointerEvent(1, 100, 100));
        handlers.onPointerMove(pointerEvent(1, 300, 300));
      });
      expect(lookRef.current.yaw).not.toBe(0);

      act(() => rerender({ enabled: false }));

      expect(lookRef.current.yaw).toBe(0);
      expect(lookRef.current.zoom).toBe(1);
    });
  });
});
