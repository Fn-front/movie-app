/**
 * 受賞作品データ取得・年度/賞の選択管理フック
 *
 * 賞は縦に連結せずタブで1つずつ出す。ポスター画像を並べると1部門が約900pxに
 * なり、3賞23部門を縦に積むと約28画面ぶんのスクロールになるため
 * （実測: アカデミー賞6部門だけで 5521px / viewport 758px = 7.3画面）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { awardKeys } from '@/constants';
import { getAwards } from '@/lib/api/awards/awards';
import type { AwardData, AwardsResponseData } from '@/features/awards/types';

/** タブに出す賞の選択肢 */
export interface AwardOption {
  label: string;
  value: string;
}

export interface UseAwardsReturn {
  data: AwardsResponseData | undefined;
  isLoading: boolean;
  isError: boolean;
  selectedYear: number;
  handleYearChange: (value: string) => void;
  /** 賞のタブ選択肢。賞が1つ以下なら空配列（タブを出さない） */
  awardOptions: AwardOption[];
  /** 表示中の賞。データ未取得なら null */
  selectedAward: AwardData | null;
  handleAwardChange: (value: string) => void;
}

/**
 * availableYearsの最新年を算出する
 * データ未取得時はnullを返す
 */
function getLatestAvailableYear(
  data: AwardsResponseData | undefined,
): number | null {
  if (!data?.availableYears?.length) return null;
  return Math.max(...data.availableYears);
}

/**
 * @param cacheBuster URL の `t` クエリ。手動同期の直後に反映を確認するための
 *   取り直し用で、通常の閲覧では undefined。`/api/awards` は public キャッシュを
 *   返すため、これが無いとブラウザが古い結果を返す（実測で transferSize=0 を確認）
 */
export function useAwards(cacheBuster?: string): UseAwardsReturn {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [userSelectedYear, setUserSelectedYear] = useState<number | null>(
    () => {
      const fromUrl = Number(searchParams.get('year'));
      return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null;
    },
  );
  const [userSelectedAward, setUserSelectedAward] = useState<string | null>(
    () => searchParams.get('award'),
  );

  const initialRequestYear = userSelectedYear ?? currentYear;

  // 初回リクエストでavailableYearsを取得
  const { data: initialData } = useQuery({
    queryKey: awardKeys.year(initialRequestYear, cacheBuster),
    queryFn: () => getAwards(initialRequestYear, cacheBuster),
  });

  // ユーザーが未選択の場合、availableYearsの最新年を使用
  const latestYear = getLatestAvailableYear(initialData);
  const selectedYear = userSelectedYear ?? latestYear ?? currentYear;

  // selectedYearのデータを取得（initialRequestYear === selectedYearの場合はキャッシュから）
  const { data, isLoading, isError } = useQuery({
    queryKey: awardKeys.year(selectedYear, cacheBuster),
    queryFn: () => getAwards(selectedYear, cacheBuster),
  });

  const awards = useMemo(() => data?.awards ?? [], [data]);

  /**
   * 表示中の賞。
   *
   * 選択値が見つからなければ先頭へ落とす。URLを手で書き換えられた場合と、
   * 「カンヌを見ている状態でアカデミー賞しか無い年へ切り替えた」場合の
   * 両方がここに来る。
   */
  const selectedAward = useMemo(
    () =>
      awards.find((award) => award.awardName === userSelectedAward) ??
      awards[0] ??
      null,
    [awards, userSelectedAward],
  );

  // 選択肢が1つだけのタブは意味がないので出さない
  const awardOptions = useMemo<AwardOption[]>(
    () =>
      awards.length > 1
        ? awards.map((award) => ({
            label: award.label,
            value: award.awardName,
          }))
        : [],
    [awards],
  );

  const handleYearChange = useCallback((value: string) => {
    setUserSelectedYear(Number(value));
  }, []);

  const handleAwardChange = useCallback((value: string) => {
    setUserSelectedAward(value);
  }, []);

  /**
   * 選択状態をURLへ書き戻す。
   *
   * データ取得前は selectedYear が暫定値（当年）なので書かない。書くと
   * availableYears の最新年が判明した直後に上書きされ、履歴と表示がぶれる。
   *
   * `t`（#894 のキャッシュバスター）など既存のクエリは保持する。落とすと
   * 年や賞を切り替えた瞬間にキャッシュ側へ戻り、同期直後の確認が成立しない。
   */
  useEffect(() => {
    if (!data || !selectedAward) return;

    const current = searchParams.toString();
    const params = new URLSearchParams(current);
    params.set('award', selectedAward.awardName);
    params.set('year', String(selectedYear));

    // ⚠️ 変化が無いときに replace すると無限ループする。この effect は
    //    searchParams に依存しており、replace が searchParams を更新して
    //    自分自身を再発火させるため。必ず差分があるときだけ書く
    if (params.toString() === current) return;

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [data, selectedAward, selectedYear, pathname, router, searchParams]);

  return useMemo(
    () => ({
      data,
      isLoading,
      isError,
      selectedYear,
      handleYearChange,
      awardOptions,
      selectedAward,
      handleAwardChange,
    }),
    [
      data,
      isLoading,
      isError,
      selectedYear,
      handleYearChange,
      awardOptions,
      selectedAward,
      handleAwardChange,
    ],
  );
}
