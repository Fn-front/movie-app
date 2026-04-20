/**
 * TheaterExperiencePage コンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

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
  useAudioShader: jest.fn(() => ({})),
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

import { useTheater } from '../hooks/useTheater';
import { useWebGL2Support } from '../hooks/useWebGL2Support';

import { TheaterExperiencePage } from './theaterExperiencePage';

const mockUseTheater = useTheater as jest.Mock;
const mockUseWebGL2Support = useWebGL2Support as jest.Mock;

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
      },
    ],
  },
};

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
  });

  it('読み込み中はローディング表示', () => {
    mockUseTheater.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    render(<TheaterExperiencePage slug='standard-medium' />);

    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('エラー時はエラーメッセージ表示', () => {
    mockUseTheater.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('fetch failed'),
    });

    render(<TheaterExperiencePage slug='standard-medium' />);

    expect(
      screen.getByText('劇場データの取得に失敗しました。'),
    ).toBeInTheDocument();
  });

  it('正常時はタイトルと劇場名が表示される', () => {
    render(<TheaterExperiencePage slug='standard-medium' />);

    expect(screen.getByText('シアター体験')).toBeInTheDocument();
    expect(
      screen.getByText('スタンダードシアター（中型）'),
    ).toBeInTheDocument();
  });

  it('WebGL2対応環境では3Dキャンバスが表示される', () => {
    render(<TheaterExperiencePage slug='standard-medium' />);

    expect(screen.getByTestId('theater-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('unsupported-notice')).not.toBeInTheDocument();
  });

  it('WebGL2非対応環境ではフォールバック表示', () => {
    mockUseWebGL2Support.mockReturnValue({
      isSupported: false,
      isChecking: false,
    });

    render(<TheaterExperiencePage slug='standard-medium' />);

    expect(screen.getByTestId('unsupported-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('theater-canvas')).not.toBeInTheDocument();
  });

  it('座席一覧が表示される', () => {
    render(<TheaterExperiencePage slug='standard-medium' />);

    expect(screen.getByTestId('seat-a11y-list')).toBeInTheDocument();
  });

  it('周波数セレクターが表示される', () => {
    render(<TheaterExperiencePage slug='standard-medium' />);

    expect(screen.getByTestId('frequency-selector')).toBeInTheDocument();
  });
});
