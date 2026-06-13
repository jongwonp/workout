import { differenceInCalendarDays, format, intervalToDuration } from 'date-fns';
import { ko } from 'date-fns/locale';

export function nowIso(): string {
  return new Date().toISOString();
}

/** 파일명용 타임스탬프 — "20260608-143022" */
export function formatDateForFile(date: Date = new Date()): string {
  return format(date, 'yyyyMMdd-HHmmss');
}

/** "2026-06-07 (일)" 형태 */
export function formatDateWithDay(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd (E)', { locale: ko });
}

/** "2026년 6월" — 히스토리 월별 그룹 헤더 */
export function formatYearMonth(iso: string): string {
  return format(new Date(iso), 'yyyy년 M월', { locale: ko });
}

/** "오늘" / "어제" / "N일 전" — 검증 시나리오 C의 "0일 전"은 "오늘"로 표시 */
export function formatDaysAgo(iso: string, from: Date = new Date()): string {
  const days = differenceInCalendarDays(from, new Date(iso));
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

/** 운동 시간 — "1시간 23분" / "45분" / "30초" */
export function formatDuration(seconds: number): string {
  const dur = intervalToDuration({ start: 0, end: seconds * 1000 });
  const parts: string[] = [];
  if (dur.hours) parts.push(`${dur.hours}시간`);
  if (dur.minutes) parts.push(`${dur.minutes}분`);
  if (parts.length === 0) parts.push(`${dur.seconds ?? 0}초`);
  return parts.join(' ');
}
