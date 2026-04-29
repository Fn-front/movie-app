/**
 * TheaterExperiencePageコンポーネント
 * シアター体験機能の統合ページ
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import type { FrequencyBand, TheaterSeat } from '../types';
import { useTheater } from '../hooks/useTheater';
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
import { UnsupportedBrowserNotice } from '../component/unsupportedBrowserNotice/unsupportedBrowserNotice';

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
  /** 劇場slug */
  slug: string;
}

export const TheaterExperiencePage = memo<TheaterExperiencePageProps>(
  function TheaterExperiencePage({ slug }) {
    const { data: theaterDetail, isLoading, error } = useTheater(slug);
    const { selectedSeat, selectSeat, clearSelection } = useSeatSelection();
    const [frequencyBand, setFrequencyBand] = useState<FrequencyBand>('mid');
    const { isSupported: isWebGL2Supported, isChecking } = useWebGL2Support();
    const reducedMotion = useReducedMotion();

    const theater = theaterDetail?.theater;
    const seats = theaterDetail?.theater.seats ?? [];
    const speakers = theaterDetail?.theater.speakers ?? [];

    const fovMetrics = useFieldOfView(selectedSeat, theater);

    // ヒートマップ表示範囲を客席エリアから算出（マージン3m）
    const heatmapBounds = useMemo(() => {
      if (seats.length === 0) {
        return {
          width: theater?.room_width ?? 20,
          depth: theater?.room_depth ?? 25,
          centerZ: 0,
        };
      }
      const margin = 3;
      const zValues = seats.map((s) => s.position_z);
      const minZ = Math.min(...zValues) - margin;
      const maxZ = Math.max(...zValues) + margin;
      return {
        width: theater?.room_width ?? 20,
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

    const handleFrequencyChange = useCallback((value: FrequencyBand) => {
      setFrequencyBand(value);
    }, []);

    const selectedSeatId = useMemo(
      () => selectedSeat?.id ?? null,
      [selectedSeat],
    );

    if (isLoading || isChecking) {
      return (
        <div className={styles.c_theater_experience__loading}>
          <p>読み込み中...</p>
        </div>
      );
    }

    if (error || !theater) {
      return (
        <div className={styles.c_theater_experience__error}>
          <p>劇場データの取得に失敗しました。</p>
        </div>
      );
    }

    return (
      <div className={styles.c_theater_experience}>
        <header className={styles.c_theater_experience__header}>
          <h1 className={styles.c_theater_experience__title}>シアター体験</h1>
          <p className={styles.c_theater_experience__subtitle}>
            {theater.name}
          </p>
        </header>

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
                >
                  <SeatMeshes
                    seats={seats}
                    selectedSeatId={selectedSeatId}
                    onSeatClick={handleSeatClick}
                  />
                  <ScreenMesh
                    width={theater.screen_width}
                    height={theater.screen_height}
                    centerX={theater.screen_center_x}
                    centerY={theater.screen_center_y}
                    centerZ={theater.screen_center_z}
                  />
                  {speakers.length > 0 && (
                    <>
                      <SpeakerMeshes speakers={speakers} />
                      <AudioHeatmapPlane
                        uniforms={audioUniforms}
                        frequencyBand={frequencyBand}
                        width={heatmapBounds.width}
                        depth={heatmapBounds.depth}
                        centerZ={heatmapBounds.centerZ}
                        reducedMotion={reducedMotion}
                      />
                    </>
                  )}
                </TheaterScene>
              </TheaterCanvas>
            ) : (
              <UnsupportedBrowserNotice />
            )}
          </div>

          {/* サイドパネル */}
          <aside className={styles.c_theater_experience__sidebar}>
            <FrequencySelector
              value={frequencyBand}
              onValueChange={handleFrequencyChange}
            />
            <SeatInfoPanel
              seat={selectedSeat}
              fovMetrics={fovMetrics}
              theater={theater}
            />
          </aside>
        </div>

        {/* アクセシブルな座席一覧 */}
        <section className={styles.c_theater_experience__a11y_section}>
          {selectedSeat && (
            <button
              type='button'
              className={styles.c_theater_experience__clear_button}
              onClick={clearSelection}
            >
              選択を解除
            </button>
          )}
          <SeatA11yList
            seats={seats}
            theater={theater}
            selectedSeatId={selectedSeatId}
            onSelectSeat={handleSeatClick}
          />
        </section>
      </div>
    );
  },
);

TheaterExperiencePage.displayName = 'TheaterExperiencePage';
