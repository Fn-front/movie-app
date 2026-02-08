import { renderHook, act } from '@testing-library/react';
import { createPersistStore } from './createPersistStore';

interface TestState {
  count: number;
  name: string;
  increment: () => void;
  setName: (name: string) => void;
}

describe('createPersistStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ストアが正しく作成される', () => {
    const useTestStore = createPersistStore<TestState>(
      'test-persist-create',
      (set) => ({
        count: 0,
        name: 'initial',
        increment: () => set((state) => ({ count: state.count + 1 })),
        setName: (name: string) => set({ name }),
      }),
    );

    expect(useTestStore).toBeDefined();
    expect(typeof useTestStore).toBe('function');
    expect(typeof useTestStore.getState).toBe('function');
    expect(typeof useTestStore.setState).toBe('function');
    expect(typeof useTestStore.subscribe).toBe('function');
    expect(typeof useTestStore.persist).toBe('object');
  });

  it('localStorageに状態が保存される', async () => {
    const useTestStore = createPersistStore<TestState>(
      'test-persist-save',
      (set) => ({
        count: 0,
        name: 'initial',
        increment: () => set((state) => ({ count: state.count + 1 })),
        setName: (name: string) => set({ name }),
      }),
    );

    const { result } = renderHook(() => useTestStore());

    act(() => {
      result.current.increment();
    });

    // persistミドルウェアがlocalStorageに書き込むのを待つ
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stored = localStorage.getItem('test-persist-save');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.state.count).toBe(1);
  });

  it('persist.clearStorage()でストレージが破棄される', async () => {
    const useTestStore = createPersistStore<TestState>(
      'test-persist-clear',
      (set) => ({
        count: 0,
        name: 'initial',
        increment: () => set((state) => ({ count: state.count + 1 })),
        setName: (name: string) => set({ name }),
      }),
    );

    const { result } = renderHook(() => useTestStore());

    act(() => {
      result.current.increment();
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(localStorage.getItem('test-persist-clear')).not.toBeNull();

    act(() => {
      useTestStore.persist.clearStorage();
    });

    expect(localStorage.getItem('test-persist-clear')).toBeNull();
  });

  it('partializeオプションで永続化対象を選択できる', async () => {
    const useTestStore = createPersistStore<TestState>(
      'test-persist-partialize',
      (set) => ({
        count: 0,
        name: 'initial',
        increment: () => set((state) => ({ count: state.count + 1 })),
        setName: (name: string) => set({ name }),
      }),
      {
        partialize: (state) => ({ count: state.count }),
      },
    );

    const { result } = renderHook(() => useTestStore());

    act(() => {
      result.current.increment();
      result.current.setName('updated');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stored = localStorage.getItem('test-persist-partialize');
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    // countはpartializeに含まれるので保存される
    expect(parsed.state.count).toBe(1);
    // nameはpartializeに含まれないので保存されない
    expect(parsed.state.name).toBeUndefined();
  });
});
