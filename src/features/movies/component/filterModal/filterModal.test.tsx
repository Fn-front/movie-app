import { render, screen, fireEvent } from '@testing-library/react';

import { FilterModal } from './filterModal';
import type { FilterModalProps } from './filterModal';

// --- Helpers ---

const defaultProps: FilterModalProps = {
  open: true,
  onOpenChange: jest.fn(),
  genres: { 28: 'アクション', 12: 'アドベンチャー', 35: 'コメディ' },
  selectedGenreIds: [],
  selectedDateRange: {},
  isRevivalFilter: undefined,
  onApply: jest.fn(),
};

const renderFilterModal = (overrides?: Partial<FilterModalProps>) => {
  const props = { ...defaultProps, ...overrides };
  return render(<FilterModal {...props} />);
};

// --- Tests ---

describe('FilterModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('表示', () => {
    it('open=trueの場合タイトルが表示される', () => {
      renderFilterModal();
      expect(screen.getByText('フィルター')).toBeInTheDocument();
    });

    it('open=falseの場合コンテンツが表示されない', () => {
      renderFilterModal({ open: false });
      expect(screen.queryByText('公開日')).not.toBeInTheDocument();
      expect(screen.queryByText('ジャンル')).not.toBeInTheDocument();
    });

    it('セクションタイトルが表示される', () => {
      renderFilterModal();
      expect(screen.getByText('公開日')).toBeInTheDocument();
      expect(screen.getByText('リバイバル上映')).toBeInTheDocument();
      expect(screen.getByText('ジャンル')).toBeInTheDocument();
    });

    it('適用ボタンとクリアボタンが表示される', () => {
      renderFilterModal();
      expect(screen.getByText('適用')).toBeInTheDocument();
      expect(screen.getByText('クリア')).toBeInTheDocument();
    });
  });

  describe('ジャンルフィルター', () => {
    it('ジャンルのチェックボックスが表示される', () => {
      renderFilterModal();
      expect(screen.getByLabelText('アクション')).toBeInTheDocument();
      expect(screen.getByLabelText('アドベンチャー')).toBeInTheDocument();
      expect(screen.getByLabelText('コメディ')).toBeInTheDocument();
    });

    it('選択済みジャンルがチェックされている', () => {
      renderFilterModal({ selectedGenreIds: [28] });
      expect(screen.getByLabelText('アクション')).toBeChecked();
      expect(screen.getByLabelText('アドベンチャー')).not.toBeChecked();
    });

    it('チェックボックスをクリックで選択/解除できる', () => {
      renderFilterModal();
      const checkbox = screen.getByLabelText('アクション');

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('日付範囲フィルター', () => {
    it('日付入力が表示される', () => {
      renderFilterModal();
      expect(screen.getByLabelText('開始日')).toBeInTheDocument();
      expect(screen.getByLabelText('終了日')).toBeInTheDocument();
    });

    it('初期値が反映される', () => {
      renderFilterModal({
        selectedDateRange: { gte: '2026-03-01', lte: '2026-04-01' },
      });
      expect(screen.getByLabelText('開始日')).toHaveValue('2026-03-01');
      expect(screen.getByLabelText('終了日')).toHaveValue('2026-04-01');
    });

    it('日付を変更できる', () => {
      renderFilterModal();
      const startDate = screen.getByLabelText('開始日');

      fireEvent.change(startDate, { target: { value: '2026-05-01' } });
      expect(startDate).toHaveValue('2026-05-01');
    });

    it('終了日を変更できる', () => {
      renderFilterModal();
      const endDate = screen.getByLabelText('終了日');

      fireEvent.change(endDate, { target: { value: '2026-06-01' } });
      expect(endDate).toHaveValue('2026-06-01');
    });

    it('開始日を空にするとundefinedに設定される', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        selectedDateRange: { gte: '2026-03-01' },
      });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, undefined);
    });

    it('終了日を空にするとundefinedに設定される', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        selectedDateRange: { lte: '2026-04-01' },
      });

      fireEvent.change(screen.getByLabelText('終了日'), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, undefined);
    });

    it('終了日の変更が適用に反映される', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply });

      fireEvent.change(screen.getByLabelText('終了日'), {
        target: { value: '2026-08-01' },
      });
      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith(
        [],
        { lte: '2026-08-01' },
        undefined,
      );
    });
  });

  describe('リバイバルフィルター', () => {
    it('ラジオボタンが表示される', () => {
      renderFilterModal();
      expect(screen.getByLabelText('すべて')).toBeInTheDocument();
      expect(screen.getByLabelText('リバイバルのみ')).toBeInTheDocument();
      expect(screen.getByLabelText('リバイバル除外')).toBeInTheDocument();
    });

    it('デフォルトで「すべて」が選択されている', () => {
      renderFilterModal();
      expect(screen.getByLabelText('すべて')).toBeChecked();
    });

    it('isRevivalFilter=trueの場合「リバイバルのみ」が選択されている', () => {
      renderFilterModal({ isRevivalFilter: true });
      expect(screen.getByLabelText('リバイバルのみ')).toBeChecked();
    });

    it('isRevivalFilter=falseの場合「リバイバル除外」が選択されている', () => {
      renderFilterModal({ isRevivalFilter: false });
      expect(screen.getByLabelText('リバイバル除外')).toBeChecked();
    });

    it('ラジオボタンを切り替えられる', () => {
      renderFilterModal();

      fireEvent.click(screen.getByLabelText('リバイバルのみ'));
      expect(screen.getByLabelText('リバイバルのみ')).toBeChecked();
      expect(screen.getByLabelText('すべて')).not.toBeChecked();
    });

    it('「リバイバル除外」を選択して適用するとfalseが渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply });

      fireEvent.click(screen.getByLabelText('リバイバル除外'));
      expect(screen.getByLabelText('リバイバル除外')).toBeChecked();

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, false);
    });

    it('「リバイバルのみ」→「すべて」に戻すとundefinedが渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply, isRevivalFilter: true });

      expect(screen.getByLabelText('リバイバルのみ')).toBeChecked();

      fireEvent.click(screen.getByLabelText('すべて'));
      expect(screen.getByLabelText('すべて')).toBeChecked();

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, undefined);
    });
  });

  describe('ボタン操作', () => {
    it('適用ボタンクリックでonApplyが呼ばれる', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply });

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, undefined);
    });

    it('フィルター選択後に適用すると選択値が渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply, selectedGenreIds: [28] });

      fireEvent.click(screen.getByLabelText('リバイバルのみ'));
      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: '2026-05-01' },
      });

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([28], { gte: '2026-05-01' }, true);
    });

    it('クリアボタンで全フィルターがリセットされる', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        selectedGenreIds: [28],
        selectedDateRange: { gte: '2026-03-01' },
        isRevivalFilter: true,
      });

      expect(screen.getByLabelText('アクション')).toBeChecked();
      expect(screen.getByLabelText('開始日')).toHaveValue('2026-03-01');
      expect(screen.getByLabelText('リバイバルのみ')).toBeChecked();

      fireEvent.click(screen.getByText('クリア'));

      expect(screen.getByLabelText('アクション')).not.toBeChecked();
      expect(screen.getByLabelText('開始日')).toHaveValue('');
      expect(screen.getByLabelText('すべて')).toBeChecked();

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, undefined);
    });
  });
});
