---
name: custom-hook
description: Create a custom React hook following project conventions
disable-model-invocation: true
argument-hint: <hookName>
---

# カスタムフック作成スキル

このスキルは、プロジェクトのコーディング規約に従ってカスタムフックを作成します。

## 必須要件

### アーキテクチャ原則

- **単一責任**: 1つのフックは1つの責務
- **useCallback必須**: すべてのハンドラー関数をメモ化
- **useMemo活用**: 計算コストの高い処理をメモ化
- **エラーハンドリング**: try-catchでエラーを適切に処理
- **命名規則**: `use<HookName>` (lowerCamelCase)

## ファイル構成

### コンポーネント固有のフック

```
src/components/<componentName>/
└── hooks/
    └── use<HookName>.ts
```

### 共通フック

```
src/hooks/
└── use<HookName>.ts
```

## カスタムフックテンプレート

### 基本構造

```typescript
import { useCallback, useMemo, useState } from 'react';

interface Use<HookName>Props {
  // フックが受け取るprops
}

interface Use<HookName>Return {
  // フックが返す値の型
}

export const use<HookName> = (props: Use<HookName>Props): Use<HookName>Return => {
  // ステート管理
  const [state, setState] = useState<Type>(initialValue);

  // イベントハンドラー（useCallbackでメモ化）
  const handleAction = useCallback(() => {
    // ハンドラーロジック
  }, [/* dependencies */]);

  // 計算値（useMemoでメモ化）
  const computedValue = useMemo(() => {
    // 計算ロジック
  }, [/* dependencies */]);

  return {
    state,
    handleAction,
    computedValue,
  };
};
```

## よくあるパターン

### データフェッチングフック

```typescript
import { useCallback, useEffect, useState } from 'react';

interface UseMovieDataProps {
  movieId: string;
}

interface UseMovieDataReturn {
  movie: Movie | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useMovieData = ({ movieId }: UseMovieDataProps): UseMovieDataReturn => {
  const [movie, setMovie] = useState<Movie | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMovie = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/movies/${movieId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch movie');
      }

      const data = await response.json();
      setMovie(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      console.error('Failed to fetch movie:', err);
    } finally {
      setIsLoading(false);
    }
  }, [movieId]);

  useEffect(() => {
    fetchMovie();
  }, [fetchMovie]);

  const refetch = useCallback(async () => {
    await fetchMovie();
  }, [fetchMovie]);

  return {
    movie,
    isLoading,
    error,
    refetch,
  };
};
```

### フォーム管理フック

```typescript
import { useCallback, useState } from 'react';

interface UseFormProps<T> {
  initialValues: T;
  onSubmit: (values: T) => Promise<void>;
}

interface UseFormReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  handleChange: (field: keyof T, value: any) => void;
  handleSubmit: () => Promise<void>;
  resetForm: () => void;
}

export const useForm = <T extends Record<string, any>>({
  initialValues,
  onSubmit,
}: UseFormProps<T>): UseFormReturn<T> => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback((field: keyof T, value: any) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const handleSubmit = useCallback(async () => {
    try {
      setIsSubmitting(true);
      await onSubmit(values);
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, onSubmit]);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
  }, [initialValues]);

  return {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
    resetForm,
  };
};
```

### トースト通知フック

```typescript
import { useCallback, useState } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UseToastReturn {
  toasts: Toast[];
  showToast: (message: string, type: Toast['type']) => void;
  dismissToast: (id: string) => void;
}

export const useToast = (): UseToastReturn => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type']) => {
    const id = Math.random().toString(36).substring(7);

    setToasts((prev) => [...prev, { id, message, type }]);

    // 5秒後に自動削除
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return {
    toasts,
    showToast,
    dismissToast,
  };
};
```

### ローカルストレージフック

```typescript
import { useCallback, useEffect, useState } from 'react';

export const useLocalStorage = <T>(
  key: string,
  initialValue: T
): [T, (value: T) => void, () => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Failed to read from localStorage:', error);
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T) => {
      try {
        setStoredValue(value);
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error('Failed to write to localStorage:', error);
      }
    },
    [key]
  );

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
};
```

### 無限スクロールフック

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseInfiniteScrollProps<T> {
  fetchData: (page: number) => Promise<T[]>;
  initialPage?: number;
}

interface UseInfiniteScrollReturn<T> {
  data: T[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  observerTarget: React.RefObject<HTMLDivElement>;
}

export const useInfiniteScroll = <T>({
  fetchData,
  initialPage = 1,
}: UseInfiniteScrollProps<T>): UseInfiniteScrollReturn<T> => {
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    try {
      setIsLoading(true);
      const newData = await fetchData(page);

      if (newData.length === 0) {
        setHasMore(false);
      } else {
        setData((prev) => [...prev, ...newData]);
        setPage((prev) => prev + 1);
      }
    } catch (error) {
      console.error('Failed to load more data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchData, page, isLoading, hasMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMore) {
          loadMore();
        }
      },
      { threshold: 1.0 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [loadMore, isLoading, hasMore]);

  return {
    data,
    isLoading,
    hasMore,
    loadMore,
    observerTarget,
  };
};
```

### デバウンスフック

```typescript
import { useEffect, useState } from 'react';

export const useDebounce = <T>(value: T, delay: number = 500): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
};
```

### メディアクエリフック

```typescript
import { useEffect, useState } from 'react';

export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    media.addEventListener('change', listener);

    return () => {
      media.removeEventListener('change', listener);
    };
  }, [query]);

  return matches;
};

// 使用例
const isMobile = useMediaQuery('(max-width: 768px)');
```

## エラーハンドリング

```typescript
export const useAsyncData = <T>(fetcher: () => Promise<T>) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await fetcher();

        if (isMounted) {
          setData(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
          console.error('Failed to fetch data:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [fetcher]);

  return { data, error, isLoading };
};
```

## パフォーマンス最適化

### useCallback必須

```typescript
// ✅ OK: useCallbackでメモ化
const handleClick = useCallback(() => {
  // ハンドラーロジック
}, [/* dependencies */]);

// ❌ NG: メモ化なし（毎回新しい関数が作成される）
const handleClick = () => {
  // ハンドラーロジック
};
```

### useMemo活用

```typescript
// ✅ OK: 計算コストの高い処理をメモ化
const filteredData = useMemo(() => {
  return data.filter(item => item.active);
}, [data]);

// ❌ NG: 毎回計算される
const filteredData = data.filter(item => item.active);
```

## 型定義

```typescript
// Props型を明示的に定義
interface UseMovieProps {
  movieId: string;
}

// Return型を明示的に定義
interface UseMovieReturn {
  movie: Movie | null;
  isLoading: boolean;
  error: Error | null;
}

// ジェネリクスを活用
export const useData = <T>(fetcher: () => Promise<T>) => {
  // ...
};
```

## 参考ドキュメント

- `.claude/documents/architecture.md` - カスタムフック設計

## 使用例

```bash
# データフェッチングフック
/custom-hook useMovieData

# フォーム管理フック
/custom-hook useForm

# トースト通知フック
/custom-hook useToast
```
