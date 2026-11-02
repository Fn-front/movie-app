// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import 'jest-axe/extend-expect';
import { TextDecoder, TextEncoder } from 'util';

// jsdom は TextEncoder/TextDecoder を実装していない（jsdom#2524）。
// Node.js・ブラウザの実行環境には標準で存在するグローバルなので、
// テスト環境にだけ補う。
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;

// jsdom は ResizeObserver を実装していない（jsdom#3368）。
// Radix UI の Popper系コンポーネント（Tooltip/Select等のArrow）が
// マウント時に無条件で呼び出すため、実ブラウザには存在するこのAPIを
// テスト環境にだけ補う。挙動は検証しないため何もしないダミーでよい。
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
