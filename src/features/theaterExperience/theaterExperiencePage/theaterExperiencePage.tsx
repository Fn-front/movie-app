/**
 * TheaterExperiencePageコンポーネント
 * シアター体験機能の統合ページ
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { THEATER_MESSAGES } from '@/constants';

import type { FrequencyBand, TheaterSeat } from '../types';
import { useTheater } from '../hooks/useTheater';
import { useTheaters } from '../hooks/useTheaters';
import { useTheaterSelection } from '../hooks/useTheaterSelection';
import { useSeatSelection } from '../hooks/useSeatSelection';
import { useFieldOfView } from '../hooks/useFieldOfView';
import { useWebGL2Support } from '../hooks/useWebGL2Support';
import { useAudioShader } from '../hooks/useAudioShader';
import { TheaterCanvas } from '../component/theaterCanvas/theaterCanvas';
import { TheaterScene } from '../component/theaterScene/theaterScene';
import { SeatMeshes } from '../component/seatMeshes/seatMeshes';
import { ScreenMesh } from '../component/screenMesh/screenMesh';
import { AudioHeatmapPlane } from '../component/audioHeatmapPlane/audioHeatmapPlane';
import { SpeakerMeshes } from '../component/speakerMeshes/speakerMeshes';
import { SeatInfoPanel } from '../component/seatInfoPanel/seatInfoPanel';
import { SeatA11yList } from '../component/seatA11yList/seatA11yList';
import { FrequencySelector } from '../component/frequencySelector/frequencySelector';
import { HeatmapToggle } from '../component/heatmapToggle/heatmapToggle';
import { HeatmapLegend } from '../component/heatmapLegend/heatmapLegend';
import { UnsupportedBrowserNotice } from '../component/unsupportedBrowserNotice/unsupportedBrowserNotice';
import { TheaterSelector } from '../component/theaterSelector/theaterSelector';

import styles from './theaterExperiencePage.module.scss';

/** prefers-reduced-motion の判定 */
function useReducedMotion(): boolean {
  const [reduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  return reduced;
}

export interface TheaterExperiencePageProps {
  /** 初期表示する劇場slug（URLクエリ由来、未指定時は既定劇場にフォールバック） */
  initialSlug: string;
}

export const TheaterExperiencePage = memo<TheaterExperiencePageProps>(
  function TheaterExperiencePage({ initialSlug }) {
    const { slug, selectTheater } = useTheaterSelection(initialSlug);
    const {
      data: theaterList,
      error: theatersError,
      refetch: refetchTheaters,
    } = useTheaters();
    const { data: theaterDetail, isLoading, error } = useTheater(slug);
    const { selectedSeat, selectSeat, clearSelection } = useSeatSelection();
    // ポインタホバーとキーボードフォーカスは独立チャネルとして別々に保持し、
    // 強調対象は `hovered ?? focused` で導出する。単一状態にまとめると、片方の解除
    // （別席へのマウス移動など）がフォーカス中の強調を消してしまう（3D↔2D の desync）。
    const [hoveredSeatId, setHoveredSeatId] = useState<string | null>(null);
    const [focusedSeatId, setFocusedSeatId] = useState<string | null>(null);
    const [frequencyBand, setFrequencyBand] = useState<FrequencyBand>('mid');
    const [isHeatmapVisible, setIsHeatmapVisible] = useState(false);
    const { isSupported: isWebGL2Supported, isChecking } = useWebGL2Support();
    const reducedMotion = useReducedMotion();

    const theater = theaterDetail?.theater;
    // theaterDetail 未取得時の `[]` フォールバックを毎レンダー新参照にしないよう
    // useMemo で固定化する。これにより下流の useMemo の依存が安定する。
    const seats = useMemo(
      () => theaterDetail?.theater.seats ?? [],
      [theaterDetail],
    );
    const speakers = useMemo(
      () => theaterDetail?.theater.speakers ?? [],
      [theaterDetail],
    );
    const theaters = useMemo(() => theaterList?.theaters ?? [], [theaterList]);

    const fovMetrics = useFieldOfView(selectedSeat, theater);

    // 座席エリアの境界（傾斜床・段差LEDのサイズ算出用）
    const seatAreaBounds = useMemo(() => {
      if (seats.length === 0) {
        return {
          frontZ: 0,
          backZ: 0,
          maxY: 0,
          rowZs: [] as number[],
          rowYs: [] as number[],
          width: 0,
        };
      }
      const zValues = seats.map((s) => Number(s.position_z));
      const yValues = seats.map((s) => Number(s.position_y));
      const xValues = seats.map((s) => Number(s.position_x));

      // 列ラベル順に各列の代表 Z/Y を抽出（前→後）
      const byRow = new Map<string, { z: number; y: number }>();
      seats.forEach((s) => {
        if (!byRow.has(s.row_label)) {
          byRow.set(s.row_label, {
            z: Number(s.position_z),
            y: Number(s.position_y),
          });
        }
      });
      const sortedRows = Array.from(byRow.entries()).sort(
        ([, a], [, b]) => b.z - a.z,
      );
      const rowZs = sortedRows.map(([, v]) => v.z);
      const rowYs = sortedRows.map(([, v]) => v.y);

      return {
        frontZ: Math.max(...zValues),
        backZ: Math.min(...zValues),
        maxY: Math.max(...yValues),
        rowZs,
        rowYs,
        width: Math.max(...xValues) - Math.min(...xValues) + 0.6,
      };
    }, [seats]);

    // ヒートマップ表示範囲を客席エリアから算出
    // マージン 1m を加えつつ、部屋境界（後壁/前壁）を超えないようにクリップ
    const heatmapBounds = useMemo(() => {
      const roomWidth = theater?.room_width ?? 20;
      const roomDepth = theater?.room_depth ?? 25;
      const halfDepth = roomDepth / 2;
      if (seats.length === 0) {
        return { width: roomWidth, depth: roomDepth, centerZ: 0 };
      }
      const margin = 1;
      const zValues = seats.map((s) => Number(s.position_z));
      const seatMinZ = Math.min(...zValues);
      const seatMaxZ = Math.max(...zValues);
      // 後壁(-halfDepth)を超えない、スクリーン側壁(+halfDepth)を超えない
      const minZ = Math.max(seatMinZ - margin, -halfDepth + 0.1);
      const maxZ = Math.min(seatMaxZ + margin, halfDepth - 0.1);
      return {
        width: roomWidth,
        depth: maxZ - minZ,
        centerZ: (minZ + maxZ) / 2,
      };
    }, [seats, theater?.room_width, theater?.room_depth]);

    const audioUniforms = useAudioShader(
      speakers,
      frequencyBand,
      heatmapBounds.width,
      heatmapBounds.depth,
      1.2,
      heatmapBounds.centerZ,
    );

    const handleSeatClick = useCallback(
      (seat: TheaterSeat) => {
        selectSeat(seat);
      },
      [selectSeat],
    );

    const handleHoverSeat = useCallback((seatId: string | null) => {
      setHoveredSeatId(seatId);
    }, []);

    const handleFocusSeat = useCallback((seatId: string | null) => {
      setFocusedSeatId(seatId);
    }, []);

    // 強調対象: ポインタホバーを優先し、無ければキーボードフォーカス席
    const highlightedSeatId = hoveredSeatId ?? focusedSeatId;

    const handleTheaterChange = useCallback(
      (nextSlug: string) => {
        // 劇場を切り替えたら、旧劇場の座席選択（一人称視点）を解除して俯瞰に戻す
        selectTheater(nextSlug);
        clearSelection();
        // 旧劇場の座席を指していた強調（ホバー/フォーカス）も解除する
        setHoveredSeatId(null);
        setFocusedSeatId(null);
      },
      [selectTheater, clearSelection],
    );

    const handleRefetchTheaters = useCallback(() => {
      refetchTheaters();
    }, [refetchTheaters]);

    const handleFrequencyChange = useCallback((value: FrequencyBand) => {
      setFrequencyBand(value);
    }, []);

    const handleHeatmapVisibleChange = useCallback((visible: boolean) => {
      setIsHeatmapVisible(visible);
    }, []);

    const selectedSeatId = useMemo(
      () => selectedSeat?.id ?? null,
      [selectedSeat],
    );

    // ヘッダー（タイトル＋劇場セレクタ）はローディング/エラー時も表示し、
    // どの状態でも別の劇場へ切り替えられるようにする
    const header = (
      <header className={styles.c_theater_experience__header}>
        <div className={styles.c_theater_experience__heading}>
          <h1 className={styles.c_theater_experience__title}>シアター体験</h1>
          {theater && (
            <p className={styles.c_theater_experience__subtitle}>
              {theater.name}
            </p>
          )}
        </div>
        {theaters.length > 0 ? (
          <TheaterSelector
            theaters={theaters}
            value={slug}
            onValueChange={handleTheaterChange}
          />
        ) : theatersError ? (
          <div
            className={styles.c_theater_experience__selector_error}
            role='alert'
          >
            <span>劇場一覧の取得に失敗しました。</span>
            <button
              type='button'
              onClick={handleRefetchTheaters}
              className={styles.c_theater_experience__retry}
            >
              再試行
            </button>
          </div>
        ) : null}
      </header>
    );

    if (isLoading || isChecking) {
      return (
        <div className={styles.c_theater_experience}>
          {header}
          <div className={styles.c_theater_experience__loading}>
            <p>読み込み中...</p>
          </div>
        </div>
      );
    }

    if (error || !theater) {
      // 一覧が取れているのに該当slugが無い＝存在しない劇場（取得失敗と区別する）
      const notFound =
        theaters.length > 0 && !theaters.some((t) => t.slug === slug);
      return (
        <div className={styles.c_theater_experience}>
          {header}
          <div className={styles.c_theater_experience__error}>
            <p>
              {notFound
                ? `${THEATER_MESSAGES.NOT_FOUND}。上の劇場セレクタから選び直してください。`
                : `${THEATER_MESSAGES.FETCH_ERROR}。`}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.c_theater_experience}>
        {header}

        <div className={styles.c_theater_experience__main}>
          {/* 3Dビュー or フォールバック */}
          <div className={styles.c_theater_experience__canvas_area}>
            {isWebGL2Supported ? (
              <TheaterCanvas>
                <TheaterScene
                  roomWidth={theater.room_width}
                  roomDepth={theater.room_depth}
                  roomHeight={theater.room_height}
                  selectedSeat={selectedSeat}
                  theater={theater}
                  seatAreaFrontZ={seatAreaBounds.frontZ}
                  seatAreaBackZ={seatAreaBounds.backZ}
                  seatAreaMaxY={seatAreaBounds.maxY}
                  rowZs={seatAreaBounds.rowZs}
                  rowYs={seatAreaBounds.rowYs}
                  seatAreaWidth={seatAreaBounds.width}
                >
                  <SeatMeshes
                    seats={seats}
                    selectedSeatId={selectedSeatId}
                    highlightedSeatId={highlightedSeatId}
                    onSeatClick={handleSeatClick}
                    onHoverSeat={handleHoverSeat}
                  />
                  <ScreenMesh
                    width={theater.screen_width}
                    height={theater.screen_height}
                    centerX={theater.screen_center_x}
                    centerY={theater.screen_center_y}
                    centerZ={theater.screen_center_z}
                    reducedMotion={reducedMotion}
                  />
                  {speakers.length > 0 && (
                    <>
                      {/* 一人称視点時はスピーカーを非表示（視界の邪魔を防ぐ） */}
                      {!selectedSeat && <SpeakerMeshes speakers={speakers} />}
                      {isHeatmapVisible && (
                        <AudioHeatmapPlane
                          uniforms={audioUniforms}
                          frequencyBand={frequencyBand}
                          width={heatmapBounds.width}
                          depth={heatmapBounds.depth}
                          centerZ={heatmapBounds.centerZ}
                          slopeFrontZ={seatAreaBounds.frontZ}
                          slopeBackZ={seatAreaBounds.backZ}
                          slopeMaxHeight={seatAreaBounds.maxY}
                          reducedMotion={reducedMotion}
                        />
                      )}
                    </>
                  )}
                </TheaterScene>
              </TheaterCanvas>
            ) : (
              <UnsupportedBrowserNotice />
            )}
            {/* 座席選択中はメインビューが一人称に切り替わるので俯瞰へ戻すボタンを表示 */}
            {isWebGL2Supported && selectedSeat && (
              <button
                type='button'
                onClick={clearSelection}
                className={styles.c_theater_experience__back_to_overview}
              >
                ← 俯瞰に戻る
              </button>
            )}
          </div>

          {/* サイドパネル */}
          <aside className={styles.c_theater_experience__sidebar}>
            <HeatmapToggle
              visible={isHeatmapVisible}
              onVisibleChange={handleHeatmapVisibleChange}
            />
            <FrequencySelector
              value={frequencyBand}
              onValueChange={handleFrequencyChange}
            />
            {isHeatmapVisible && <HeatmapLegend />}
            <SeatInfoPanel
              seat={selectedSeat}
              fovMetrics={fovMetrics}
              theater={theater}
            />
          </aside>
        </div>

        {/* アクセシブルな座席一覧 */}
        <section className={styles.c_theater_experience__a11y_section}>
          <SeatA11yList
            seats={seats}
            theater={theater}
            selectedSeatId={selectedSeatId}
            highlightedSeatId={highlightedSeatId}
            onSelectSeat={handleSeatClick}
            onHoverSeat={handleHoverSeat}
            onFocusSeat={handleFocusSeat}
          />
        </section>
      </div>
    );
  },
);

TheaterExperiencePage.displayName = 'TheaterExperiencePage';
