/**
 * カレンダー関連のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * カレンダー月指定クエリのバリデーションスキーマ
 */
export const calendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, '月はYYYY-MM形式で指定してください')
    .refine(
      (val) => {
        const monthNum = Number(val.split('-')[1]);
        return monthNum >= 1 && monthNum <= 12;
      },
      { message: '月は01〜12の範囲で指定してください' },
    )
    .optional(),
});

/**
 * カレンダークエリパラメータの型
 */
export type CalendarQueryParams = z.infer<typeof calendarQuerySchema>;
