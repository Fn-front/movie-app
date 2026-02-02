---
name: test
description: Create test code with Jest and React Testing Library
disable-model-invocation: true
argument-hint: <targetFile>
---

# テストコード作成スキル

このスキルは、Jest + React Testing Libraryを使ったテストコードを作成します。

## 必須要件

### 技術スタック

- **Jest**: テストランナー
- **React Testing Library**: Reactコンポーネントテスト
- **@testing-library/jest-dom**: カスタムマッチャー
- **@testing-library/user-event**: ユーザーイベントシミュレーション

### テスト原則

- **ユーザー視点**: ユーザーが操作する方法でテスト
- **実装詳細に依存しない**: stateやpropsではなく、UIの動作をテスト
- **アクセシビリティ**: role、labelでクエリ
- **非同期処理**: waitFor、findByを使用

## ファイル構成

```
src/components/<componentName>/
├── <componentName>.tsx
├── <componentName>.test.tsx    # テストファイル
└── __mocks__/                  # モック（必要な場合）
    └── data.ts
```

## コンポーネントテストテンプレート

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { <ComponentName> } from './<componentName>';

describe('<ComponentName>', () => {
  it('正しくレンダリングされる', () => {
    render(<<ComponentName> />);

    expect(screen.getByRole('heading', { name: 'タイトル' })).toBeInTheDocument();
  });

  it('ボタンクリックでハンドラーが呼ばれる', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

    render(<<ComponentName> onClick={handleClick} />);

    const button = screen.getByRole('button', { name: 'クリック' });
    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('入力値が正しく表示される', async () => {
    const user = userEvent.setup();

    render(<<ComponentName> />);

    const input = screen.getByLabelText('メールアドレス');
    await user.type(input, 'test@example.com');

    expect(input).toHaveValue('test@example.com');
  });
});
```

## クエリ優先順位

### 1. アクセシビリティクエリ（推奨）

```typescript
// getByRole - 最優先
screen.getByRole('button', { name: '送信' });
screen.getByRole('heading', { name: 'タイトル' });
screen.getByRole('textbox', { name: 'メールアドレス' });

// getByLabelText - フォーム要素
screen.getByLabelText('メールアドレス');

// getByPlaceholderText
screen.getByPlaceholderText('メールアドレスを入力');

// getByText
screen.getByText('ようこそ');

// getByDisplayValue
screen.getByDisplayValue('現在の値');
```

### 2. セマンティッククエリ

```typescript
// getByAltText - 画像
screen.getByAltText('映画ポスター');

// getByTitle
screen.getByTitle('ヘルプ');
```

### 3. テストIDクエリ（最終手段）

```typescript
// getByTestId - 他の方法がない場合のみ
screen.getByTestId('custom-element');

// コンポーネント側
<div data-testid="custom-element">コンテンツ</div>
```

## クエリバリエーション

```typescript
// getBy* - 要素が存在することを期待、なければエラー
screen.getByRole('button');

// queryBy* - 要素が存在しないことを確認
expect(screen.queryByRole('button')).not.toBeInTheDocument();

// findBy* - 非同期、要素が表示されるまで待機
await screen.findByRole('button');

// getAllBy* - 複数要素
const buttons = screen.getAllByRole('button');
expect(buttons).toHaveLength(3);
```

## ユーザーイベント

```typescript
import userEvent from '@testing-library/user-event';

describe('ユーザーインタラクション', () => {
  it('クリックイベント', async () => {
    const user = userEvent.setup();
    render(<Button onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
  });

  it('テキスト入力', async () => {
    const user = userEvent.setup();
    render(<Input />);

    await user.type(screen.getByRole('textbox'), 'Hello');
  });

  it('キーボード操作', async () => {
    const user = userEvent.setup();
    render(<Component />);

    await user.keyboard('{Enter}');
    await user.keyboard('{Escape}');
  });

  it('セレクト選択', async () => {
    const user = userEvent.setup();
    render(<Select />);

    await user.selectOptions(
      screen.getByRole('combobox'),
      'option-value'
    );
  });

  it('チェックボックス', async () => {
    const user = userEvent.setup();
    render(<Checkbox />);

    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});
```

## 非同期処理

```typescript
import { render, screen, waitFor } from '@testing-library/react';

describe('非同期処理', () => {
  it('データ読み込み後に表示される', async () => {
    render(<AsyncComponent />);

    // findBy - 要素が表示されるまで待機
    expect(await screen.findByText('データ')).toBeInTheDocument();
  });

  it('ローディング状態を確認', async () => {
    render(<AsyncComponent />);

    // 最初はローディング表示
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();

    // データ読み込み後はローディング非表示
    await waitFor(() => {
      expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    });
  });

  it('エラー状態を確認', async () => {
    // APIをモックしてエラーを返す
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('API Error'));

    render(<AsyncComponent />);

    expect(await screen.findByText('エラーが発生しました')).toBeInTheDocument();
  });
});
```

## モック

### API モック

```typescript
// グローバルfetchをモック
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: 'mock data' }),
  })
) as jest.Mock;

// テスト後にクリーンアップ
afterEach(() => {
  jest.restoreAllMocks();
});
```

### Next.js Router モック

```typescript
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/current-path',
  useSearchParams: () => new URLSearchParams(),
}));
```

### NextAuth モック

```typescript
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: { id: '1', email: 'test@example.com' },
    },
    status: 'authenticated',
  }),
}));
```

## カスタムフックテスト

```typescript
import { renderHook, act } from '@testing-library/react';
import { useCustomHook } from './useCustomHook';

describe('useCustomHook', () => {
  it('初期値が正しい', () => {
    const { result } = renderHook(() => useCustomHook());

    expect(result.current.value).toBe(0);
  });

  it('incrementで値が増える', () => {
    const { result } = renderHook(() => useCustomHook());

    act(() => {
      result.current.increment();
    });

    expect(result.current.value).toBe(1);
  });

  it('非同期処理が正しく動作する', async () => {
    const { result } = renderHook(() => useCustomHook());

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.data).toBeDefined();
  });
});
```

## API Routeテスト

```typescript
import { POST } from './route';

describe('/api/example', () => {
  it('正常なリクエストで成功レスポンスを返す', async () => {
    const request = new Request('http://localhost:3000/api/example', {
      method: 'POST',
      body: JSON.stringify({ data: 'test' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('不正なリクエストでエラーを返す', async () => {
    const request = new Request('http://localhost:3000/api/example', {
      method: 'POST',
      body: JSON.stringify({ invalid: 'data' }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
```

## アクセシビリティテスト

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('アクセシビリティ', () => {
  it('アクセシビリティ違反がない', async () => {
    const { container } = render(<Component />);
    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});
```

## スナップショットテスト

```typescript
describe('スナップショット', () => {
  it('UIが変更されていない', () => {
    const { container } = render(<Component />);

    expect(container).toMatchSnapshot();
  });
});
```

## カバレッジ目標

```json
// jest.config.js
{
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/*.stories.{ts,tsx}"
  ],
  "coverageThresholds": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

## テストパターン

### フォームテスト

```typescript
it('フォーム送信が正しく動作する', async () => {
  const user = userEvent.setup();
  const handleSubmit = jest.fn();

  render(<Form onSubmit={handleSubmit} />);

  // 入力
  await user.type(screen.getByLabelText('メールアドレス'), 'test@example.com');
  await user.type(screen.getByLabelText('パスワード'), 'Password123');

  // 送信
  await user.click(screen.getByRole('button', { name: '送信' }));

  // バリデーション成功を確認
  expect(handleSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'Password123',
  });
});
```

### エラー表示テスト

```typescript
it('バリデーションエラーが表示される', async () => {
  const user = userEvent.setup();

  render(<Form />);

  // 空のまま送信
  await user.click(screen.getByRole('button', { name: '送信' }));

  // エラーメッセージ確認
  expect(
    await screen.findByText('メールアドレスを入力してください')
  ).toBeInTheDocument();
});
```

## 参考ドキュメント

- `.claude/documents/roadmap.md` - テスト戦略

## 使用例

```bash
# コンポーネントテスト
/test src/components/movieCard/movieCard.tsx

# カスタムフックテスト
/test src/hooks/useMovieData.ts

# API Routeテスト
/test src/app/api/movies/route.ts
```
