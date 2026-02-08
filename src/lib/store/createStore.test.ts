import { renderHook, act } from '@testing-library/react';
import { createStore } from './createStore';

interface TestState {
  count: number;
  increment: () => void;
  decrement: () => void;
}

describe('createStore', () => {
  it('ストアが正しく作成される', () => {
    const useTestStore = createStore<TestState>('test-create', (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
      decrement: () => set((state) => ({ count: state.count - 1 })),
    }));

    expect(useTestStore).toBeDefined();
    expect(typeof useTestStore).toBe('function');
    expect(typeof useTestStore.getState).toBe('function');
    expect(typeof useTestStore.setState).toBe('function');
    expect(typeof useTestStore.subscribe).toBe('function');
  });

  it('初期状態が正しい', () => {
    const useTestStore = createStore<TestState>('test-initial', (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
      decrement: () => set((state) => ({ count: state.count - 1 })),
    }));

    const { result } = renderHook(() => useTestStore());

    expect(result.current.count).toBe(0);
    expect(typeof result.current.increment).toBe('function');
    expect(typeof result.current.decrement).toBe('function');
  });

  it('アクションで状態が更新される', () => {
    const useTestStore = createStore<TestState>('test-action', (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 })),
      decrement: () => set((state) => ({ count: state.count - 1 })),
    }));

    const { result } = renderHook(() => useTestStore());

    act(() => {
      result.current.increment();
    });
    expect(result.current.count).toBe(1);

    act(() => {
      result.current.increment();
    });
    expect(result.current.count).toBe(2);

    act(() => {
      result.current.decrement();
    });
    expect(result.current.count).toBe(1);
  });

  it('複数のストアが独立して動作する', () => {
    interface CounterA {
      value: number;
      add: () => void;
    }

    interface CounterB {
      value: number;
      add: () => void;
    }

    const useStoreA = createStore<CounterA>('store-a', (set) => ({
      value: 10,
      add: () => set((state) => ({ value: state.value + 1 })),
    }));

    const useStoreB = createStore<CounterB>('store-b', (set) => ({
      value: 100,
      add: () => set((state) => ({ value: state.value + 10 })),
    }));

    const { result: resultA } = renderHook(() => useStoreA());
    const { result: resultB } = renderHook(() => useStoreB());

    expect(resultA.current.value).toBe(10);
    expect(resultB.current.value).toBe(100);

    act(() => {
      resultA.current.add();
    });

    expect(resultA.current.value).toBe(11);
    expect(resultB.current.value).toBe(100);

    act(() => {
      resultB.current.add();
    });

    expect(resultA.current.value).toBe(11);
    expect(resultB.current.value).toBe(110);
  });
});
