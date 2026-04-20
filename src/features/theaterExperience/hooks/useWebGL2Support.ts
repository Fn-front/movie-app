/**
 * WebGL2サポート判定フック
 */

import { useEffect, useMemo, useState } from 'react';

export interface UseWebGL2SupportReturn {
  /** WebGL2がサポートされているか */
  isSupported: boolean;
  /** 判定中か */
  isChecking: boolean;
}

/**
 * ブラウザのWebGL2サポートを判定する
 * サーバーサイドでは常に未サポート扱い
 */
export function useWebGL2Support(): UseWebGL2SupportReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      setIsSupported(gl !== null);
    } catch {
      setIsSupported(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  return useMemo(
    () => ({ isSupported, isChecking }),
    [isSupported, isChecking],
  );
}
