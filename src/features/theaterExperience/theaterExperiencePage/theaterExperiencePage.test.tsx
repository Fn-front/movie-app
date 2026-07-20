/**
 * TheaterExperiencePage コンポーネント テスト
 */

import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// matchMedia モック（jsdom未実装）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// フックモック
jest.mock('../hooks/useTheater', () => ({
  useTheater: jest.fn(),
}));
jest.mock('../hooks/useTheaters', () => ({
  useTheaters: jest.fn(),
}));
jest.mock('../hooks/useTheaterSelection', () => ({
  useTheaterSelection: jest.fn(),
}));
jest.mock('../hooks/useSeatSelection', () => ({
  useSeatSelection: jest.fn(() => ({
    selectedSeat: null,
    selectSeat: jest.fn(),
    clearSelection: jest.fn(),
  })),
}));
jest.mock('../hooks/useFieldOfView', () => ({
  useFieldOfView: jest.fn(() => null),
}));
jest.mock('../hooks/useWebGL2Support', () => ({
  useWebGL2Support: jest.fn(() => ({
    isSupported: true,
    isChecking: false,
  })),
}));
jest.mock('../hooks/useAudioShader', () => ({
  useAudioShader: jest.fn(() => ({
    uSpeakerData: { value: null },
    uSpeakerCount: { value: 0 },
    uFrequency: { value: 1000 },
    uAbsorption: { value: 0.001 },
    uTime: { value: 0 },
    uRoomSize: { value: [20, 25] },
    uRoomOffset: { value: [-10, -12.5] },
    uSliceY: { value: 1.2 },
    uSliceAlpha: { value: 0.85 },
  })),
}));

// コンポーネントモック
jest.mock('../component/theaterCanvas/theaterCanvas', () => ({
  TheaterCanvas: jest.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid='theater-canvas'>{children}</div>
  )),
}));
jest.mock('../component/theaterScene/theaterScene', () => ({
  TheaterScene: jest.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid='theater-scene'>{children}</div>
  )),
}));
jest.mock('../component/seatMeshes/seatMeshes', () => ({
  SeatMeshes: jest.fn(() => <div data-testid='seat-meshes' />),
}));
jest.mock('../component/screenMesh/screenMesh', () => ({
  ScreenMesh: jest.fn(() => <div data-testid='screen-mesh' />),
}));
jest.mock('../component/speakerMeshes/speakerMeshes', () => ({
  SpeakerMeshes: jest.fn(() => <div data-testid='speaker-meshes' />),
}));
jest.mock('../component/audioHeatmapPlane/audioHeatmapPlane', () => ({
  AudioHeatmapPlane: jest.fn(() => <div data-testid='heatmap' />),
}));
jest.mock('../component/seatInfoPanel/seatInfoPanel', () => ({
  SeatInfoPanel: jest.fn(() => <div data-testid='seat-info-panel' />),
}));
jest.mock('../component/seatA11yList/seatA11yList', () => ({
  SeatA11yList: jest.fn(() => <div data-testid='seat-a11y-list' />),
}));
jest.mock('../component/frequencySelector/frequencySelector', () => ({
  FrequencySelector: jest.fn(() => <div data-testid='frequency-selector' />),
}));
jest.mock(
  '../component/unsupportedBrowserNotice/unsupportedBrowserNotice',
  () => ({
    UnsupportedBrowserNotice: jest.fn(() => (
      <div data-testid='unsupported-notice' />
    )),
  }),
);
jest.mock('../component/theaterSelector/theaterSelector', () => ({
  TheaterSelector: jest.fn(
    ({
      theaters,
      value,
      onValueChange,
    }: {
      theaters: { slug: string; name: string }[];
      value: string;
      onValueChange: (slug: string) => void;
    }) => (
      <select
        data-testid='theater-selector'
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {theaters.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.name}
          </option>
        ))}
      </select>
    ),
  ),
}));

import { useTheater } from '../hooks/useTheater';
import { useTheaters } from '../hooks/useTheaters';
import { useTheaterSelection } from '../hooks/useTheaterSelection';
import { useWebGL2Support } from '../hooks/useWebGL2Support';
import { useSeatSelection } from '../hooks/useSeatSelection';
import { SeatMeshes } from '../component/seatMeshes/seatMeshes';
import { SeatA11yList } from '../component/seatA11yList/seatA11yList';

import { TheaterExperiencePage } from './theaterExperiencePage';

const mockUseTheater = useTheater as jest.Mock;
const mockUseTheaters = useTheaters as jest.Mock;
const mockUseTheaterSelection = useTheaterSelection as jest.Mock;
const mockUseWebGL2Support = useWebGL2Support as jest.Mock;
const mockSeatMeshes = SeatMeshes as unknown as jest.Mock;
const mockSeatA11yList = SeatA11yList as unknown as jest.Mock;

/** モック子コンポーネントに最後に渡された props を取得する */
const lastProps = (m: jest.Mock) => m.mock.calls[m.mock.calls.length - 1][0];
const mockUseSeatSelection = useSeatSelection as jest.Mock;

const mockTheaterDetail = {
  theater: {
    id: 'uuid-1',
    name: 'スタンダードシアター（中型）',
    slug: 'standard-medium',
    format: 'standard' as const,
    room_width: 20,
    room_depth: 25,
    room_height: 8,
    screen_width: 14,
    screen_height: 6,
    screen_center_x: 0,
    screen_center_y: 4,
    screen_center_z: 12.5,
    audio_layout: 'atmos_9_1_6' as const,
    seats: [
      {
        id: 'seat-1',
        row_label: 'A',
        seat_number: 1,
        position_x: 0,
        position_y: 0,
        position_z: 5,
        seat_type: 'standard',
      },
    ],
    speakers: [
      {
        id: 'sp-1',
        channel: 'L',
        position_x: -5,
        position_y: 2,
        position_z: 10,
        power_watts: 100,
        direction_x: -0.41,
        direction_y: -0.21,
        direction_z: -0.89,
        directivity_alpha: 0.5,
      },
    ],
  },
};

const mockTheaters = [
  {
    id: 'uuid-1',
    name: 'スタンダードシアター（中型）',
    slug: 'standard-medium',
    format: 'standard' as const,
    audio_layout: 'atmos_9_1_6' as const,
  },
  {
    id: 'uuid-2',
    name: 'IMAX シアター',
    slug: 'imax-gt',
    format: 'imax' as const,
    audio_layout: 'atmos_9_1_6' as const,
  },
];

describe('TheaterExperiencePage', () => {
  beforeEach(() => {
    mockUseTheater.mockReturnValue({
      data: mockTheaterDetail,
      isLoading: false,
      error: null,
    });
    mockUseWebGL2Support.mockReturnValue({
      isSupported: true,
      isChecking: false,
    });
    mockUseTheaters.mockReturnValue({
      data: { theaters: mockTheaters },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseTheaterSelection.mockReturnValue({
      slug: 'standard-medium',
      selectTheater: jest.fn(),
    });
  });

  it('読み込み中はローディング表示', () => {
    mockUseTheater.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<TheaterExperiencePage initialSlug='standard-medium' />);

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('エラー時はエラーメッセージ表示', () => {
    mockUseTheater.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('fetch failed'),
    });

    render(<TheaterExperiencePage initialSlug='standard-medium' />);

    expect(
      screen.getByText('劇場データの取得に失敗しました。'),
    ).toBeInTheDocument();
  });

  it('正常時はタイトルと劇場名が表示される', () => {
    render(<TheaterExperiencePage initialSlug='standard-medium' />);

    expect(screen.getByText('シアター体験')).toBeInTheDocument();
    // 同名の劇場がセレクタの<option>にも現れるため、サブタイトル<p>に限定して検証
    expect(
      screen.getByText('スタンダードシアター（中型）', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('WebGL2対応環境では3Dキャンバスが表示される', () => {
    render(<TheaterExperiencePage initialSlug='standard-medium' />);

    expect(screen.getByTestId('theater-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('unsupported-notice')).not.toBeInTheDocument();
  });

  it('WebGL2非対応環境ではフォールバック表示', () => {
    mockUseWebGL2Support.mockReturnValue({
      isSupported: false,
      isChecking: false,
    });

    render(<TheaterExperiencePage initialSlug='standard-medium' />);

    expect(screen.getByTestId('unsupported-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('theater-canvas')).not.toBeInTheDocument();
  });

  it('座席一覧が表示される', () => {
    render(<TheaterExperiencePage initialSlug='standard-medium' />);

    expect(screen.getByTestId('seat-a11y-list')).toBeInTheDocument();
  });

  it('周波数セレクターが表示される', () => {
    render(<TheaterExperiencePage initialSlug='standard-medium' />);

    expect(screen.getByTestId('frequency-selector')).toBeInTheDocument();
  });

  describe('劇場セレクタ', () => {
    it('劇場一覧が取得できたらセレクタを表示する', () => {
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(screen.getByTestId('theater-selector')).toBeInTheDocument();
    });

    it('劇場一覧が空のときはセレクタを表示しない', () => {
      mockUseTheaters.mockReturnValue({
        data: { theaters: [] },
        isLoading: false,
        error: null,
      });

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(screen.queryByTestId('theater-selector')).not.toBeInTheDocument();
    });

    it('ローディング中でもセレクタは表示され続ける', () => {
      mockUseTheater.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(screen.getByTestId('theater-selector')).toBeInTheDocument();
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('エラー時でもセレクタは表示され続ける', () => {
      mockUseTheater.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('fetch failed'),
      });

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(screen.getByTestId('theater-selector')).toBeInTheDocument();
      expect(
        screen.getByText('劇場データの取得に失敗しました。'),
      ).toBeInTheDocument();
    });

    it('劇場一覧の取得失敗時はエラー＋再試行を表示する', async () => {
      const refetch = jest.fn();
      mockUseTheaters.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('list fetch failed'),
        refetch,
      });
      const user = userEvent.setup();

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(
        screen.getByText('劇場一覧の取得に失敗しました。'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '再試行' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('劇場を切り替えると selectTheater と clearSelection が呼ばれる', async () => {
      const selectTheater = jest.fn();
      const clearSelection = jest.fn();
      mockUseTheaterSelection.mockReturnValueOnce({
        slug: 'standard-medium',
        selectTheater,
      });
      mockUseSeatSelection.mockReturnValueOnce({
        selectedSeat: null,
        selectSeat: jest.fn(),
        clearSelection,
      });
      const user = userEvent.setup();

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      await user.selectOptions(
        screen.getByTestId('theater-selector'),
        'imax-gt',
      );

      expect(selectTheater).toHaveBeenCalledWith('imax-gt');
      expect(clearSelection).toHaveBeenCalledTimes(1);
    });
  });

  describe('座席の相互ハイライト（ホバー/フォーカス連動）', () => {
    it('初期は強調なしで、3D/2D 双方に highlightedSeatId=null が渡る', () => {
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBeNull();
      expect(lastProps(mockSeatA11yList).highlightedSeatId).toBeNull();
    });

    it('ホバーはフォーカスより優先され、ホバー解除でフォーカス席に戻る（片方の解除で消えない）', () => {
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      // キーボードフォーカス（2Dリスト）→ 3D/2D が focus 席で強調
      act(() => lastProps(mockSeatA11yList).onFocusSeat('focus-seat'));
      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBe('focus-seat');
      expect(lastProps(mockSeatA11yList).highlightedSeatId).toBe('focus-seat');

      // 3Dホバー（別席）→ ホバーが優先される
      act(() => lastProps(mockSeatMeshes).onHoverSeat('hover-seat'));
      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBe('hover-seat');
      expect(lastProps(mockSeatA11yList).highlightedSeatId).toBe('hover-seat');

      // ホバー解除 → フォーカス席へ戻る（null にはならない＝チャネル分離）
      act(() => lastProps(mockSeatMeshes).onHoverSeat(null));
      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBe('focus-seat');
    });

    it('劇場を切り替えると強調（ホバー/フォーカス）がリセットされる', () => {
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      // ホバーとフォーカスを両方付与（ホバー優先で hover-seat が強調される）。
      // 両チャネルを立てることで、切替時の hovered/focused 双方のリセット漏れを検出する。
      act(() => lastProps(mockSeatA11yList).onFocusSeat('focus-seat'));
      act(() => lastProps(mockSeatMeshes).onHoverSeat('hover-seat'));
      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBe('hover-seat');

      act(() => {
        fireEvent.change(screen.getByTestId('theater-selector'), {
          target: { value: 'imax-gt' },
        });
      });

      // ホバー・フォーカス両チャネルが解除される
      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBeNull();
      expect(lastProps(mockSeatA11yList).highlightedSeatId).toBeNull();
    });

    it('席を選択（一人称遷移）するとホバー/フォーカス強調がリセットされる（stale漏れ防止）', () => {
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      // 俯瞰でホバー＋フォーカスを付与（ホバー優先で hover-seat 強調）
      act(() => lastProps(mockSeatA11yList).onFocusSeat('focus-seat'));
      act(() => lastProps(mockSeatMeshes).onHoverSeat('hover-seat'));
      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBe('hover-seat');

      // 3D席を静止クリック→一人称。R3Fは onPointerOut を発火しないため、
      // 選択時に明示リセットしないと stale hover が残りキーボード強調をマスクする。
      act(() => lastProps(mockSeatMeshes).onSeatClick({ id: 'seat-x' }));

      expect(lastProps(mockSeatMeshes).highlightedSeatId).toBeNull();
      expect(lastProps(mockSeatA11yList).highlightedSeatId).toBeNull();
    });
  });

  describe('slug伝播・存在しない劇場', () => {
    it('選択中のslugでuseTheaterが呼ばれる（slug伝播）', () => {
      mockUseTheaterSelection.mockReturnValue({
        slug: 'imax-gt',
        selectTheater: jest.fn(),
      });

      render(<TheaterExperiencePage initialSlug='imax-gt' />);

      expect(mockUseTheater).toHaveBeenCalledWith('imax-gt');
    });

    it('一覧に無いslugのエラー時は「見つかりません」を表示する', () => {
      mockUseTheaterSelection.mockReturnValue({
        slug: 'unknown-hall',
        selectTheater: jest.fn(),
      });
      mockUseTheater.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('not found'),
      });

      render(<TheaterExperiencePage initialSlug='unknown-hall' />);

      expect(
        screen.getByText(/指定された劇場が見つかりません/),
      ).toBeInTheDocument();
    });
  });

  describe('ヒートマップ表示切替', () => {
    it('初期状態ではヒートマップは描画されない', () => {
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(screen.queryByTestId('heatmap')).not.toBeInTheDocument();
    });

    it('「表示」を押すとヒートマップが描画される', async () => {
      const user = userEvent.setup();
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      await user.click(
        screen.getByRole('radio', { name: 'ヒートマップを表示' }),
      );

      expect(screen.getByTestId('heatmap')).toBeInTheDocument();
    });

    it('「非表示」を押すとヒートマップが消える', async () => {
      const user = userEvent.setup();
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      await user.click(
        screen.getByRole('radio', { name: 'ヒートマップを表示' }),
      );
      expect(screen.getByTestId('heatmap')).toBeInTheDocument();

      await user.click(
        screen.getByRole('radio', { name: 'ヒートマップを非表示' }),
      );

      expect(screen.queryByTestId('heatmap')).not.toBeInTheDocument();
    });
  });

  describe('一人称視点時の振る舞い', () => {
    const selectedSeat = mockTheaterDetail.theater.seats[0];

    it('座席未選択時はスピーカーが描画される', () => {
      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(screen.getByTestId('speaker-meshes')).toBeInTheDocument();
    });

    it('座席選択時はスピーカーが非表示になる', () => {
      mockUseSeatSelection.mockReturnValueOnce({
        selectedSeat,
        selectSeat: jest.fn(),
        clearSelection: jest.fn(),
      });

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(screen.queryByTestId('speaker-meshes')).not.toBeInTheDocument();
    });

    it('座席選択時は俯瞰に戻るボタンが表示される', () => {
      mockUseSeatSelection.mockReturnValueOnce({
        selectedSeat,
        selectSeat: jest.fn(),
        clearSelection: jest.fn(),
      });

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      expect(
        screen.getByRole('button', { name: '← 俯瞰に戻る' }),
      ).toBeInTheDocument();
    });

    it('俯瞰に戻るボタンで clearSelection が呼ばれる', async () => {
      const clearSelection = jest.fn();
      mockUseSeatSelection.mockReturnValueOnce({
        selectedSeat,
        selectSeat: jest.fn(),
        clearSelection,
      });
      const user = userEvent.setup();

      render(<TheaterExperiencePage initialSlug='standard-medium' />);

      await user.click(screen.getByRole('button', { name: '← 俯瞰に戻る' }));

      expect(clearSelection).toHaveBeenCalledTimes(1);
    });

    it('俯瞰に戻ると一人称中に付いたホバー/フォーカス強調がリセットされる', async () => {
      // 再レンダーをまたいで selectedSeat を維持するため persistent モックを使い、
      // テスト後に既定（selectedSeat=null）へ復元してリークを防ぐ。
      mockUseSeatSelection.mockReturnValue({
        selectedSeat,
        selectSeat: jest.fn(),
        clearSelection: jest.fn(),
      });
      const user = userEvent.setup();

      try {
        render(<TheaterExperiencePage initialSlug='standard-medium' />);

        // 一人称中でも2Dリストのホバーは連動する
        act(() => lastProps(mockSeatA11yList).onHoverSeat('hover-seat'));
        expect(lastProps(mockSeatA11yList).highlightedSeatId).toBe(
          'hover-seat',
        );

        await user.click(screen.getByRole('button', { name: '← 俯瞰に戻る' }));

        expect(lastProps(mockSeatA11yList).highlightedSeatId).toBeNull();
      } finally {
        mockUseSeatSelection.mockReturnValue({
          selectedSeat: null,
          selectSeat: jest.fn(),
          clearSelection: jest.fn(),
        });
      }
    });
  });
});
