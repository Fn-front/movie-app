/**
 * CSP 違反レポート受信 API
 * POST /api/csp-report
 *
 * ブラウザが送信する CSP 違反レポートを受信し、構造化ログとして出力する。
 * - report-uri 形式: `Content-Type: application/csp-report`
 *   （`{ "csp-report": { ... } }`）
 * - Reporting API (report-to) 形式: `Content-Type: application/reports+json`
 *   （`[{ "type": "csp-violation", "body": { ... } }, ...]`）
 *
 * 認証は不要（ブラウザが未認証で送信するため）。
 * 大量送信・悪用対策として本文サイズに上限を設け、解析失敗時も含めて
 * 常に 204 を返す（ブラウザにエラーを返しても再送・利用者への影響がないため）。
 */

import { NextResponse } from 'next/server';

/**
 * 受信を許可する本文サイズの上限（バイト）。
 * これを超えるレポートは中身を読まずに破棄する（メモリ枯渇・DoS 対策）。
 */
const MAX_BODY_BYTES = 16 * 1024; // 16KB

/** 正常受信時のレスポンス（本文不要のため 204）。 */
const NO_CONTENT = 204;

/**
 * 単一の CSP 違反レポート本体から、ログに残す主要フィールドを抽出する。
 * report-uri 形式（ハイフン区切り）と Reporting API 形式（キャメル/スネーク）の
 * 双方のキーに対応する。
 */
function extractViolation(body: Record<string, unknown>): {
  documentUri?: unknown;
  violatedDirective?: unknown;
  effectiveDirective?: unknown;
  blockedUri?: unknown;
  sourceFile?: unknown;
  lineNumber?: unknown;
  columnNumber?: unknown;
  disposition?: unknown;
} {
  return {
    documentUri: body['document-uri'] ?? body.documentURL,
    violatedDirective: body['violated-directive'] ?? body.violatedDirective,
    effectiveDirective: body['effective-directive'] ?? body.effectiveDirective,
    blockedUri: body['blocked-uri'] ?? body.blockedURL,
    sourceFile: body['source-file'] ?? body.sourceFile,
    lineNumber: body['line-number'] ?? body.lineNumber,
    columnNumber: body['column-number'] ?? body.columnNumber,
    disposition: body.disposition,
  };
}

/**
 * パース済みの JSON からレポート本体の配列を取り出して構造化ログに出力する。
 * 未知の形状は無視し、既知の 2 形式のみログする。
 */
function logReports(payload: unknown): void {
  // report-uri 形式: { "csp-report": {...} }
  if (
    payload &&
    typeof payload === 'object' &&
    'csp-report' in payload &&
    typeof (payload as Record<string, unknown>)['csp-report'] === 'object' &&
    (payload as Record<string, unknown>)['csp-report'] !== null
  ) {
    const report = (payload as Record<string, Record<string, unknown>>)[
      'csp-report'
    ];
    console.warn('[csp-report]', extractViolation(report));
    return;
  }

  // Reporting API 形式: [{ type: 'csp-violation', body: {...} }, ...]
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (
        entry &&
        typeof entry === 'object' &&
        entry.type === 'csp-violation' &&
        entry.body &&
        typeof entry.body === 'object'
      ) {
        console.warn(
          '[csp-report]',
          extractViolation(entry.body as Record<string, unknown>),
        );
      }
    }
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // 本文サイズ上限チェック（Content-Length が信頼できない場合も後段の
    // text() 長で二重に防ぐ）。数値化に失敗した不正な Content-Length は
    // 上限超過として扱い、中身を読まずに破棄する（防御的）。
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (!Number.isFinite(contentLength) || contentLength > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: NO_CONTENT });
    }

    const raw = await request.text();
    if (raw.length === 0 || raw.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: NO_CONTENT });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      // 不正な JSON は破棄（悪用・誤送信対策）。
      return new NextResponse(null, { status: NO_CONTENT });
    }

    logReports(payload);
  } catch (error) {
    // レポート収集は best-effort。失敗しても常に成功扱いで返す
    // （ブラウザの再送やユーザー体験に影響させない）。
    console.error('[csp-report] failed to process report:', error);
  }

  return new NextResponse(null, { status: NO_CONTENT });
}
