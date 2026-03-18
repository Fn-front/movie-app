/**
 * API Route用 バリデーションヘルパー
 */

import { NextResponse } from 'next/server';
import { z, type ZodType } from 'zod';

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

/** parseAndValidateの成功結果 */
interface ParseSuccess<T> {
  data: T;
  error?: undefined;
}

/** parseAndValidateのエラー結果 */
interface ParseError {
  data?: undefined;
  error: NextResponse;
}

/**
 * リクエストボディのJSONパース + Zodバリデーション
 */
export async function parseAndValidate<T>(
  request: Request,
  schema: ZodType<T>,
  invalidBodyMessage: string,
): Promise<ParseSuccess<T> | ParseError> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: invalidBodyMessage,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      ),
    };
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: invalidBodyMessage,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      ),
    };
  }

  return { data: result.data };
}
