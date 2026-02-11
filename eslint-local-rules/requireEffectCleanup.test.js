/**
 * @jest-environment node
 */
/* eslint-disable no-undef */
const { RuleTester } = require('eslint');
const rule = require('./requireEffectCleanup');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

ruleTester.run('require-effect-cleanup', rule, {
  valid: [
    // 非同期処理なし — クリーンアップ不要
    {
      code: `
        useEffect(() => {
          console.log('hello');
        }, []);
      `,
    },
    // async + クリーンアップあり
    {
      code: `
        useEffect(() => {
          const controller = new AbortController();
          async function fetchData() {
            await fetch('/api', { signal: controller.signal });
          }
          fetchData();
          return () => controller.abort();
        }, []);
      `,
    },
    // .then() + クリーンアップあり
    {
      code: `
        useEffect(() => {
          let cancelled = false;
          fetch('/api').then(res => {
            if (!cancelled) setData(res);
          });
          return () => { cancelled = true; };
        }, []);
      `,
    },
    // イベントリスナー（非同期処理なし）
    {
      code: `
        useEffect(() => {
          document.addEventListener('click', handler);
          return () => document.removeEventListener('click', handler);
        }, []);
      `,
    },
    // クリーンアップ関数を変数で返す
    {
      code: `
        useEffect(() => {
          const controller = new AbortController();
          fetchData(controller.signal).then(setData);
          const cleanup = () => controller.abort();
          return cleanup;
        }, []);
      `,
    },
    // useEffect 以外の関数呼び出し
    {
      code: `
        useMemo(() => {
          fetch('/api').then(setData);
        }, []);
      `,
    },
    // useLayoutEffect + クリーンアップあり
    {
      code: `
        useLayoutEffect(() => {
          async function measure() {
            await something();
          }
          measure();
          return () => {};
        }, []);
      `,
    },
  ],

  invalid: [
    // async 関数定義のみ、クリーンアップなし
    {
      code: `
        useEffect(() => {
          async function fetchData() {
            const res = await fetch('/api');
            setData(res);
          }
          fetchData();
        }, []);
      `,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // .then() のみ、クリーンアップなし
    {
      code: `
        useEffect(() => {
          fetch('/api').then(res => setData(res));
        }, []);
      `,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // async アロー関数、クリーンアップなし
    {
      code: `
        useEffect(() => {
          const fetchData = async () => {
            await fetch('/api');
          };
          fetchData();
        }, []);
      `,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // useLayoutEffect + async、クリーンアップなし
    {
      code: `
        useLayoutEffect(() => {
          async function measure() {
            await something();
          }
          measure();
        }, []);
      `,
      errors: [{ messageId: 'missingCleanup' }],
    },
    // IIFE async、クリーンアップなし
    {
      code: `
        useEffect(() => {
          (async () => {
            await fetch('/api');
          })();
        }, []);
      `,
      errors: [{ messageId: 'missingCleanup' }],
    },
  ],
});
