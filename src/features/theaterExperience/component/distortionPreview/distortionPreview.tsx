/**
 * DistortionPreviewコンポーネント
 * 2D Canvasで座席視点からのスクリーン台形歪みをプレビュー
 */

'use client';

import { memo, useRef, useEffect, useMemo } from 'react';

import { cn } from '@/utils/cn';

import type { TheaterSeat, Theater } from '../../types';
import { projectScreenQuad, type Point2D } from '../../utils/fieldOfView';

import styles from './distortionPreview.module.scss';

const CANVAS_WIDTH = 200;
const CANVAS_HEIGHT = 140;
const PADDING = 20;

export interface DistortionPreviewProps {
  /** 選択中の座席 */
  seat: TheaterSeat;
  /** 劇場データ */
  theater: Theater;
  /** 追加クラス名 */
  className?: string;
}

/**
 * Point2D配列を Canvas描画域にフィットさせる
 */
function normalizeQuad(
  quad: [Point2D, Point2D, Point2D, Point2D],
): [Point2D, Point2D, Point2D, Point2D] {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const drawW = CANVAS_WIDTH - PADDING * 2;
  const drawH = CANVAS_HEIGHT - PADDING * 2;

  return quad.map((p) => ({
    x: PADDING + ((p.x - minX) / rangeX) * drawW,
    y: PADDING + ((p.y - minY) / rangeY) * drawH,
  })) as [Point2D, Point2D, Point2D, Point2D];
}

export const DistortionPreview = memo<DistortionPreviewProps>(
  function DistortionPreview({ seat, theater, className }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const quad = useMemo(
      () =>
        projectScreenQuad(
          {
            x: seat.position_x,
            y: seat.position_y + 1.2,
            z: seat.position_z,
          },
          {
            width: theater.screen_width,
            height: theater.screen_height,
            center_x: theater.screen_center_x,
            center_y: theater.screen_center_y,
            center_z: theater.screen_center_z,
          },
        ),
      [seat, theater],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 理想的な矩形（参考用）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        PADDING,
        PADDING,
        CANVAS_WIDTH - PADDING * 2,
        CANVAS_HEIGHT - PADDING * 2,
      );
      ctx.setLineDash([]);

      // 台形（実際の見え方）
      const normalized = normalizeQuad(quad);
      ctx.beginPath();
      ctx.moveTo(normalized[0].x, normalized[0].y);
      ctx.lineTo(normalized[1].x, normalized[1].y);
      ctx.lineTo(normalized[2].x, normalized[2].y);
      ctx.lineTo(normalized[3].x, normalized[3].y);
      ctx.closePath();

      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }, [quad]);

    return (
      <div className={cn(styles.c_distortion_preview, className)}>
        <span className={styles.c_distortion_preview__label}>
          スクリーンの見え方
        </span>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={styles.c_distortion_preview__canvas}
          aria-label='スクリーン歪みプレビュー'
          role='img'
        />
      </div>
    );
  },
);

DistortionPreview.displayName = 'DistortionPreview';
