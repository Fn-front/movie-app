// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import 'jest-axe/extend-expect';
import { TextDecoder, TextEncoder } from 'util';

// jsdom は TextEncoder/TextDecoder を実装していない（jsdom#2524）。
// Node.js・ブラウザの実行環境には標準で存在するグローバルなので、
// テスト環境にだけ補う。
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder;
