/**
 * 受賞作品の手動同期のバリデーションスキーマ
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import { z } from 'zod';

import {
  AWARD_SYNC_MIN_YEAR,
  SYNCABLE_AWARD_NAMES,
  type SyncableAwardName,
} from '@/constants/awardSync';

const awardNameTuple = SYNCABLE_AWARD_NAMES as [
  SyncableAwardName,
  ...SyncableAwardName[],
];

/**
 * 同期リクエスト
 *
 * 年の上限は「当年+1」。授賞式が翌年初頭に行われる賞（ゴールデングローブは
 * 1月）があるため当年だけでは足りない。下限は賞ごとに違うので superRefine で
 * 見る（第1回より前の年は記事が無く、問い合わせるだけ無駄に課金する）。
 */
export const awardSyncCreateSchema = z
  .object({
    awardName: z.enum(awardNameTuple),
    year: z.number().int(),
    /** 失効した実行中ジョブを強制的に閉じてから起票する */
    force: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    const minYear = AWARD_SYNC_MIN_YEAR[value.awardName];
    const maxYear = new Date().getFullYear() + 1;

    if (value.year < minYear || value.year > maxYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['year'],
        message: `${minYear}年から${maxYear}年の間で指定してください`,
      });
    }
  });

export type AwardSyncCreateInput = z.infer<typeof awardSyncCreateSchema>;
