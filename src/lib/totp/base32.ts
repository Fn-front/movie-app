/**
 * Base32 エンコード／デコード（RFC 4648）
 *
 * TOTP の秘密鍵は `otpauth://` URI で認証アプリに渡すため base32 で表現する。
 * Node 標準に base32 が無いため最小限を自前で持つ（外部依存を増やさない方針）。
 *
 * パディング（`=`）は付けない。認証アプリが読み取る `secret=` パラメータでは
 * 付けない形が一般的で、Google Authenticator 等もパディング無しを受け付ける。
 */

/** RFC 4648 の標準アルファベット */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 文字 → 値の逆引き表 */
const DECODE_MAP = new Map<string, number>(
  [...ALPHABET].map((char, index) => [char, index]),
);

/**
 * バイト列を base32 文字列にエンコードする
 *
 * @param bytes - エンコード対象
 * @returns base32 文字列（パディングなし・大文字）
 */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    // 5bit ずつ取り出せる限り文字に変換する
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 0b11111];
      bits -= 5;
    }
  }

  // 端数は 0 埋めして1文字にする
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 0b11111];
  }

  return output;
}

/**
 * base32 文字列をバイト列にデコードする
 *
 * 小文字・パディング・空白を許容する（利用者が認証アプリから手で写した鍵を
 * 受け付けられるようにするため）。
 *
 * @param encoded - base32 文字列
 * @returns デコードしたバイト列
 * @throws アルファベット外の文字が含まれる場合
 */
export function base32Decode(encoded: string): Buffer {
  const normalized = encoded.toUpperCase().replace(/[=\s]/g, '');

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = DECODE_MAP.get(char);

    if (index === undefined) {
      throw new Error(`Invalid base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    while (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  // 残った 5bit 未満の端数はエンコード時の 0 埋めなので捨てる
  return Buffer.from(output);
}
