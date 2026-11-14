/**
 * SSR でも警告にならない `useLayoutEffect`
 *
 * `useLayoutEffect` はサーバーでは動かず React が警告を出す。サーバーでは
 * `useEffect` へ倒す（どちらもサーバーでは実行されないので結果は変わらない）。
 *
 * クライアントで `useEffect` ではなくこちらを使うのは、**ペイント前に
 * 決めたいものがあるとき**に限る。`useEffect` は描画後に走るため、
 * 「1フレームだけ誤った見た目が出る」窓が開く。
 */

'use client';

import { useEffect, useLayoutEffect } from 'react';

export const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;
