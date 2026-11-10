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
  releaseType: 'theatrical',
  timeFrame: 'upcoming',
  selectedWatchProviderIds: [],
  selectedOfferTypes: [],
  selectedRegions: [],
  onApply: jest.fn(),
};

const renderFilterModal = (overrides?: Partial<FilterModalProps>) => {
  const props = { ...defaultProps, ...overrides };
  return render(<FilterModal {...props} />);
};

/**
 * 「今日」を固定する
 *
 * 公開日で選べる範囲は `new Date()` から算出されるため、固定しないと
 * 日が変わるたびにテストの意味が変わる（#994）
 */
const TODAY = '2026-06-15T09:00:00+09:00';

/** 固定した「今日」を基準にした日付（劇場×公開予定の範囲は 06-15 〜 09-15） */
const DATES = {
  today: '2026-06-15',
  withinUpcoming: '2026-07-01',
  afterUpcomingMax: '2026-10-01',
  past: '2026-01-01',
} as const;

// --- Tests ---

describe('FilterModal', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    jest.setSystemTime(new Date(TODAY));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

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

      fireEvent.change(startDate, { target: { value: DATES.withinUpcoming } });
      expect(startDate).toHaveValue(DATES.withinUpcoming);
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
      expect(onApply).toHaveBeenCalledWith([], {}, undefined, [], [], []);
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
      expect(onApply).toHaveBeenCalledWith([], {}, undefined, [], [], []);
    });

    it('終了日の変更が適用に反映される', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply });

      fireEvent.change(screen.getByLabelText('終了日'), {
        target: { value: DATES.withinUpcoming },
      });
      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith(
        [],
        { lte: DATES.withinUpcoming },
        undefined,
        [],
        [],
        [],
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
      expect(onApply).toHaveBeenCalledWith([], {}, false, [], [], []);
    });

    it('「リバイバルのみ」→「すべて」に戻すとundefinedが渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply, isRevivalFilter: true });

      expect(screen.getByLabelText('リバイバルのみ')).toBeChecked();

      fireEvent.click(screen.getByLabelText('すべて'));
      expect(screen.getByLabelText('すべて')).toBeChecked();

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, undefined, [], [], []);
    });
  });

  describe('配信サービスフィルター', () => {
    const streamingProps = { releaseType: 'streaming' as const };

    it('劇場公開タブでは表示されない', () => {
      // movie_cache の streaming 行にしか入らないため、選んでも必ず0件になる
      renderFilterModal();

      expect(screen.queryByText('配信サービス')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Netflix')).not.toBeInTheDocument();
    });

    it('ストリーミングタブで表示される', () => {
      renderFilterModal(streamingProps);

      expect(screen.getByText('配信サービス')).toBeInTheDocument();
      expect(screen.getByLabelText('Netflix')).toBeInTheDocument();
      expect(screen.getByLabelText('U-NEXT')).toBeInTheDocument();
    });

    it('選択済みのプロバイダーがチェックされている', () => {
      renderFilterModal({
        ...streamingProps,
        selectedWatchProviderIds: [8],
      });

      expect(screen.getByLabelText('Netflix')).toBeChecked();
      expect(screen.getByLabelText('U-NEXT')).not.toBeChecked();
    });

    it('プロバイダーを選択して適用すると渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ ...streamingProps, onApply });

      fireEvent.click(screen.getByLabelText('Netflix'));
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).toHaveBeenCalledWith([], {}, undefined, [8], [], []);
    });

    it('提供形態のラジオが表示され既定は「すべて」', () => {
      renderFilterModal(streamingProps);

      expect(screen.getByLabelText('見放題のみ')).toBeInTheDocument();
      expect(screen.getByLabelText('レンタル・購入のみ')).toBeInTheDocument();
      // リバイバルの「すべて」と2つになるため、両方が既定で選択されていることを見る
      const allRadios = screen.getAllByLabelText('すべて');
      expect(allRadios).toHaveLength(2);
      for (const radio of allRadios) {
        expect(radio).toBeChecked();
      }
    });

    it('「見放題のみ」を選んで適用するとflatrateが渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ ...streamingProps, onApply });

      fireEvent.click(screen.getByLabelText('見放題のみ'));
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).toHaveBeenCalledWith(
        [],
        {},
        undefined,
        [],
        ['flatrate'],
        [],
      );
    });

    it('「レンタル・購入のみ」を選ぶとrent/buyが渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ ...streamingProps, onApply });

      fireEvent.click(screen.getByLabelText('レンタル・購入のみ'));
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).toHaveBeenCalledWith(
        [],
        {},
        undefined,
        [],
        ['rent', 'buy'],
        [],
      );
    });

    it('クリアで配信サービスの選択も解除される', () => {
      renderFilterModal({
        ...streamingProps,
        selectedWatchProviderIds: [8],
        selectedOfferTypes: ['flatrate'],
      });

      expect(screen.getByLabelText('Netflix')).toBeChecked();

      fireEvent.click(screen.getByText('クリア'));

      expect(screen.getByLabelText('Netflix')).not.toBeChecked();
      expect(screen.getByLabelText('見放題のみ')).not.toBeChecked();
    });
  });

  describe('ボタン操作', () => {
    it('適用ボタンクリックでonApplyが呼ばれる', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply });

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith([], {}, undefined, [], [], []);
    });

    it('フィルター選択後に適用すると選択値が渡される', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply, selectedGenreIds: [28] });

      fireEvent.click(screen.getByLabelText('リバイバルのみ'));
      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.withinUpcoming },
      });

      fireEvent.click(screen.getByText('適用'));
      expect(onApply).toHaveBeenCalledWith(
        [28],
        { gte: DATES.withinUpcoming },
        true,
        [],
        [],
        [],
      );
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
      expect(onApply).toHaveBeenCalledWith([], {}, undefined, [], [], []);
    });
  });

  describe('地域セクション', () => {
    it('3つの地域チェックボックスを表示する', () => {
      renderFilterModal();

      expect(
        screen.getByRole('checkbox', { name: '韓国' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: '中華圏' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: 'タイ・インド' }),
      ).toBeInTheDocument();
    });

    it('既定ではすべて未選択', () => {
      renderFilterModal({ selectedRegions: [] });

      expect(screen.getByRole('checkbox', { name: '韓国' })).not.toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: '中華圏' }),
      ).not.toBeChecked();
      expect(
        screen.getByRole('checkbox', { name: 'タイ・インド' }),
      ).not.toBeChecked();
    });

    it('選択済みの地域はチェックされる', () => {
      renderFilterModal({ selectedRegions: ['korea'] });

      expect(screen.getByRole('checkbox', { name: '韓国' })).toBeChecked();
    });

    it('チェックして適用すると地域が onApply に渡る', () => {
      const onApply = jest.fn();
      renderFilterModal({ onApply });

      fireEvent.click(screen.getByRole('checkbox', { name: '中華圏' }));
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).toHaveBeenCalledWith(
        [],
        {},
        undefined,
        [],
        [],
        ['chinese'],
      );
    });

    it('クリアで地域の選択も解除される', () => {
      renderFilterModal({ selectedRegions: ['korea'] });

      fireEvent.click(screen.getByText('クリア'));

      expect(screen.getByRole('checkbox', { name: '韓国' })).not.toBeChecked();
    });

    it('劇場公開タブでも地域セクションを表示する', () => {
      renderFilterModal({ releaseType: 'theatrical' });

      expect(
        screen.getByRole('checkbox', { name: '韓国' }),
      ).toBeInTheDocument();
    });

    it('配信タブでも地域セクションを表示する', () => {
      renderFilterModal({ releaseType: 'streaming' });

      expect(
        screen.getByRole('checkbox', { name: 'タイ・インド' }),
      ).toBeInTheDocument();
    });
  });

  // そのタブでは必ず0件になる日付まで選べていた（#994）。
  // min/max はピッカーを制限するだけなので、適用時の検証と併せて見る
  describe('公開日で選べる範囲', () => {
    /** 固定した「今日」= 2026-06-15 */
    it('劇場×公開予定は今日から3ヶ月先までに制限される', () => {
      renderFilterModal({ releaseType: 'theatrical', timeFrame: 'upcoming' });

      expect(screen.getByLabelText('開始日')).toHaveAttribute(
        'min',
        '2026-06-15',
      );
      expect(screen.getByLabelText('終了日')).toHaveAttribute(
        'max',
        '2026-09-15',
      );
    });

    // 母集団は TMDb の now_playing 由来で取得時に日付範囲を指定していない。
    // ロングラン・リバイバルは公開日が古くなるため下限を付けない
    it('劇場×公開中は上限のみ今日に制限され、下限は付かない', () => {
      renderFilterModal({
        releaseType: 'theatrical',
        timeFrame: 'now_showing',
      });

      expect(screen.getByLabelText('開始日')).not.toHaveAttribute('min');
      expect(screen.getByLabelText('終了日')).toHaveAttribute(
        'max',
        '2026-06-15',
      );
    });

    it('配信×配信中は今日の2ヶ月前から今日までに制限される', () => {
      renderFilterModal({
        releaseType: 'streaming',
        timeFrame: 'now_showing',
      });

      expect(screen.getByLabelText('開始日')).toHaveAttribute(
        'min',
        '2026-04-15',
      );
      expect(screen.getByLabelText('終了日')).toHaveAttribute(
        'max',
        '2026-06-15',
      );
    });

    // このタブの日付は劇場公開日に効き、サーバー側に丸めが無い。
    // 過去日も契約上は有効なので制約を付けられない
    it('配信×配信予定は制限されない', () => {
      renderFilterModal({ releaseType: 'streaming', timeFrame: 'upcoming' });

      const startDate = screen.getByLabelText('開始日');
      const endDate = screen.getByLabelText('終了日');

      expect(startDate).not.toHaveAttribute('min');
      expect(startDate).not.toHaveAttribute('max');
      expect(endDate).not.toHaveAttribute('min');
      expect(endDate).not.toHaveAttribute('max');
    });

    it('開始日を選ぶと終了日の下限がそこまで引き上がる', () => {
      renderFilterModal({ releaseType: 'theatrical', timeFrame: 'upcoming' });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: '2026-08-01' },
      });

      expect(screen.getByLabelText('終了日')).toHaveAttribute(
        'min',
        '2026-08-01',
      );
    });

    it('終了日を選ぶと開始日の上限がそこまで引き下がる', () => {
      renderFilterModal({ releaseType: 'theatrical', timeFrame: 'upcoming' });

      fireEvent.change(screen.getByLabelText('終了日'), {
        target: { value: '2026-07-01' },
      });

      expect(screen.getByLabelText('開始日')).toHaveAttribute(
        'max',
        '2026-07-01',
      );
    });
  });

  // グレーアウトだけでは理由が伝わらない（WCAG 3.3.2）
  describe('制約の理由の説明', () => {
    it.each([
      [
        '劇場×公開予定',
        'theatrical' as const,
        'upcoming' as const,
        'このタブは今日以降に公開される作品のみです。',
      ],
      [
        '劇場×公開中',
        'theatrical' as const,
        'now_showing' as const,
        'このタブは公開中の作品のみです。',
      ],
      [
        '配信×配信中',
        'streaming' as const,
        'now_showing' as const,
        'このタブは直近2ヶ月に公開された配信中の作品です。',
      ],
    ])('%s で説明を出す', (_label, releaseType, timeFrame, hint) => {
      renderFilterModal({ releaseType, timeFrame });

      expect(screen.getByText(hint)).toBeInTheDocument();
    });

    it('制限の無い配信×配信予定では説明を出さない', () => {
      renderFilterModal({ releaseType: 'streaming', timeFrame: 'upcoming' });

      expect(screen.queryByText(/このタブは/)).not.toBeInTheDocument();
    });

    it('説明が日付入力に aria-describedby で紐づく', () => {
      renderFilterModal({ releaseType: 'theatrical', timeFrame: 'upcoming' });

      const hintId = screen.getByText(
        'このタブは今日以降に公開される作品のみです。',
      ).id;

      expect(screen.getByLabelText('開始日')).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining(hintId),
      );
      expect(screen.getByLabelText('終了日')).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining(hintId),
      );
    });
  });

  // min/max は手入力を強制しない（入力は <form> の外、「適用」も素の button）。
  // jsdom も強制しないため、適用時の検証で止める（#994）
  describe('範囲外を適用したとき', () => {
    it('範囲より前の開始日は適用されずエラーが出る', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        releaseType: 'theatrical',
        timeFrame: 'upcoming',
      });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.past },
      });
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        '選べる期間の外の日付が入力されています。',
      );
    });

    it('範囲より後の終了日は適用されずエラーが出る', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        releaseType: 'theatrical',
        timeFrame: 'upcoming',
      });

      fireEvent.change(screen.getByLabelText('終了日'), {
        target: { value: DATES.afterUpcomingMax },
      });
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('開始日が終了日より後なら適用されずエラーが出る', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        releaseType: 'theatrical',
        timeFrame: 'now_showing',
      });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: '2026-06-10' },
      });
      fireEvent.change(screen.getByLabelText('終了日'), {
        target: { value: '2026-06-01' },
      });
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        '終了日は開始日以降の日付を指定してください。',
      );
    });

    it('エラー時は日付入力に aria-invalid が付く', () => {
      renderFilterModal({ releaseType: 'theatrical', timeFrame: 'upcoming' });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.past },
      });
      fireEvent.click(screen.getByText('適用'));

      expect(screen.getByLabelText('開始日')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(screen.getByLabelText('終了日')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('入力し直すとエラーが消える', () => {
      renderFilterModal({ releaseType: 'theatrical', timeFrame: 'upcoming' });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.past },
      });
      fireEvent.click(screen.getByText('適用'));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.withinUpcoming },
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('クリアするとエラーも消える', () => {
      renderFilterModal({ releaseType: 'theatrical', timeFrame: 'upcoming' });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.past },
      });
      fireEvent.click(screen.getByText('適用'));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      fireEvent.click(screen.getByText('クリア'));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // 制限の無いタブでは過去日も有効。デグレさせない
    it('配信×配信予定では過去日でも適用できる', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        releaseType: 'streaming',
        timeFrame: 'upcoming',
      });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.past },
      });
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('劇場×公開中では過去日でも適用できる', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        releaseType: 'theatrical',
        timeFrame: 'now_showing',
      });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.past },
      });
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).toHaveBeenCalled();
    });

    it('範囲内なら従来どおり適用できる', () => {
      const onApply = jest.fn();
      renderFilterModal({
        onApply,
        releaseType: 'theatrical',
        timeFrame: 'upcoming',
      });

      fireEvent.change(screen.getByLabelText('開始日'), {
        target: { value: DATES.withinUpcoming },
      });
      fireEvent.click(screen.getByText('適用'));

      expect(onApply).toHaveBeenCalledWith(
        [],
        { gte: DATES.withinUpcoming },
        undefined,
        [],
        [],
        [],
      );
    });
  });
});
