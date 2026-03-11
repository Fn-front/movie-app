/**
 * API Route用 バリデーションヘルパー
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { HTTP_STATUS, ERROR_CODE } from '@/constants';

const uuidSchema = z.string().uuid();

/**
 * UUID形式かどうかを検証
 */
export function isValidUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

/**
 * UUID形式エラーレスポンスを生成
 */
export function invalidUuidResponse(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.VALIDATION_ERROR,
        message,
      },
    },
    { status: HTTP_STATUS.BAD_REQUEST },
  );
}
