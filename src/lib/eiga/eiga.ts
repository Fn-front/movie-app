/**
 * 映画.com iCalフィード取得・パース処理
 */

import ICAL from 'ical.js';
import axios from 'axios';

import { EIGA_ICAL_URL } from '@/constants/movies';

/**
 * iCalから抽出した映画情報
 */
export interface EigaMovie {
  /** 映画タイトル */
  title: string;
  /** 公開日（YYYY-MM-DD形式） */
  releaseDate: string;
  /** 映画.com作品ページURL */
  eigaUrl: string | null;
}

/**
 * 映画.com iCalフィードを取得してパースする
 *
 * @returns 映画タイトルと公開日の配列
 */
export async function fetchEigaMovies(): Promise<EigaMovie[]> {
  const response = await axios.get<string>(EIGA_ICAL_URL, {
    responseType: 'text',
    timeout: 30000,
  });

  return parseIcal(response.data);
}

/**
 * iCalテキストをパースして映画情報を抽出する
 *
 * @param icalText - iCalテキスト
 * @returns 映画タイトルと公開日の配列
 */
export function parseIcal(icalText: string): EigaMovie[] {
  const jcalData = ICAL.parse(icalText);
  const component = new ICAL.Component(jcalData);
  const vevents = component.getAllSubcomponents('vevent');

  const movies: EigaMovie[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const summary = event.summary;
    const dtstart = vevent.getFirstPropertyValue('dtstart');

    if (!summary || !dtstart) continue;

    const icalTime = dtstart as ICAL.Time;
    const year = icalTime.year;
    const month = String(icalTime.month).padStart(2, '0');
    const day = String(icalTime.day).padStart(2, '0');
    const releaseDate = `${year}-${month}-${day}`;

    // descriptionから映画.comのURLを抽出
    const description = String(
      vevent.getFirstPropertyValue('description') ?? '',
    );
    const urlMatch = description.match(/https:\/\/eiga\.com\/movie\/\d+\//);
    const eigaUrl = urlMatch ? urlMatch[0] : null;

    movies.push({ title: summary, releaseDate, eigaUrl });
  }

  return movies;
}

/**
 * 映画.comの作品ページから原題を取得する
 *
 * @param eigaUrl - 映画.com作品ページURL
 * @returns 原題、取得できない場合はnull
 */
export async function fetchOriginalTitle(
  eigaUrl: string,
): Promise<string | null> {
  try {
    const response = await axios.get<string>(eigaUrl, {
      responseType: 'text',
      timeout: 10000,
    });

    // 「原題または英題：」の後のテキストを抽出
    const match = response.data.match(/原題(?:または英題)?[：:]\s*([^<\n]+)/);
    if (match) return match[1].trim();

    // 「英題：」のみのパターン
    const engMatch = response.data.match(/英題[：:]\s*([^<\n]+)/);
    if (engMatch) return engMatch[1].trim();

    return null;
  } catch {
    return null;
  }
}
