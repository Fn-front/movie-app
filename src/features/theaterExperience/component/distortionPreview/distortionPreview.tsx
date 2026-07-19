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

/**
 * 固定の視野フレーム（人の快適視野の目安: 水平±70°, 垂直±45°）。
 * 台形をこの固定スケールで描くため、席ごとの見込み角の「大きさ」と位置、
 * アスペクト比が保たれる（前列＝大きく視界を占有、後列＝小さく中央寄り）。
 */
const HALF_FOV_X = (70 * Math.PI) / 180;
const HALF_FOV_Y = (45 * Math.PI) / 180;

/** 台形の輪郭・背景に対しコントラスト比 ≥3:1 を満たす暗背景（WCAG 1.4.11） */
const BG_COLOR = '#141414';

export interface DistortionPreviewProps {
  /** 選択中の座席 */
  seat: TheaterSeat;
  /** 劇場データ */
  theater: Theater;
  /** 追加クラス名 */
  className?: string;
}

/**
 * 座席視点の角度座標(rad)を固定FOVフレーム内のCanvas座標へ写す。
 * 独立正規化しないため、見込み角の大きさ（視界占有）とアスペクト比が保たれ、
 * 席ごとにスクリーンの見かけの大きさ・位置が変化する。
 */
function toCanvasPoint(p: Point2D): Point2D {
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const drawHalfW = CANVAS_WIDTH / 2 - PADDING;
  const drawHalfH = CANVAS_HEIGHT / 2 - PADDING;
  return {
    x: cx + (p.x / HALF_FOV_X) * drawHalfW,
    // 上向きの角度(スクリーンは目線より上)を画面の上方向へ
    y: cy - (p.y / HALF_FOV_Y) * drawHalfH,
  };
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

      // 背景を暗色で明示塗り（枠・台形のコントラストを保証）
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // 視野フレーム（固定FOVの枠）— 背景に対しコントラスト比 ≥3:1（WCAG 1.4.11）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        PADDING,
        PADDING,
        CANVAS_WIDTH - PADDING * 2,
        CANVAS_HEIGHT - PADDING * 2,
      );
      ctx.setLineDash([]);

      // 中央（正面）の十字ガイド
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, PADDING);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT - PADDING);
      ctx.moveTo(PADDING, CANVAS_HEIGHT / 2);
      ctx.lineTo(CANVAS_WIDTH - PADDING, CANVAS_HEIGHT / 2);
      ctx.stroke();

      // スクリーンの見え方（実際の見込み角サイズの台形。固定FOVスケールで描画）
      const pts = quad.map(toCanvasPoint);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();

      ctx.fillStyle = 'rgba(99, 102, 241, 0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.95)';
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
