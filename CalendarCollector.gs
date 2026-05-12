/**
 * CalendarCollector.gs
 * Google Calendarから当日の予定を取得してActivityCardに変換する
 */

/**
 * 指定日のカレンダー予定を取得してActivityCard配列を返す
 *
 * デフォルトはプライマリカレンダー（自分のカレンダー）のみ。
 * config の extra_calendar_ids にカンマ区切りでカレンダーIDを追加すると
 * 指定したカレンダーも取得対象に含めることができる。
 */
function collectCalendarActivities(targetDate) {
  const cards = [];
  const { startOfDay, endOfDay } = getDayRange(targetDate);

  const calendars = buildTargetCalendars();
  logInfo('collectCalendarActivities', `Target calendars: ${calendars.map(c => c.getName()).join(', ')}`, '');

  calendars.forEach(calendar => {
    try {
      const events = calendar.getEvents(startOfDay, endOfDay);
      events.forEach(event => {
        try {
          const card = createActivityCardFromCalendarEvent(event, targetDate);
          if (card) cards.push(card);
        } catch (e) {
          logError('collectCalendarActivities', `Failed to convert event: ${event.getTitle()}`, e);
        }
      });
    } catch (e) {
      logError('collectCalendarActivities', `Failed to get events from calendar: ${calendar.getName()}`, e);
    }
  });

  // 同一イベントIDの重複を除去（複数カレンダーに同じ予定が現れる場合）
  const seen = new Set();
  return cards.filter(c => {
    if (seen.has(c.rawId)) return false;
    seen.add(c.rawId);
    return true;
  });
}

/**
 * 取得対象カレンダーのリストを返す
 * - デフォルト: プライマリカレンダー（自分のメインカレンダー）のみ
 * - config の extra_calendar_ids でカレンダーIDをカンマ区切り追加可能
 */
function buildTargetCalendars() {
  const calendars = [];

  // プライマリカレンダー（自分のカレンダー）
  calendars.push(CalendarApp.getDefaultCalendar());

  // configで追加指定されたカレンダーID
  const extraIds = getConfigValue('extra_calendar_ids', '');
  if (extraIds) {
    extraIds.split(',').forEach(id => {
      const trimmed = id.trim();
      if (!trimmed) return;
      try {
        const cal = CalendarApp.getCalendarById(trimmed);
        if (cal) {
          calendars.push(cal);
        } else {
          logWarn('buildTargetCalendars', `Calendar not found: ${trimmed}`, '');
        }
      } catch (e) {
        logError('buildTargetCalendars', `Failed to get calendar: ${trimmed}`, e);
      }
    });
  }

  return calendars;
}

/**
 * CalendarEventオブジェクトをActivityCardに変換する
 */
function createActivityCardFromCalendarEvent(event, targetDate) {
  // キャンセル済みを除外
  const status = event.getMyStatus();
  if (status === CalendarApp.GuestStatus.NO) return null;

  const isAllDay = event.isAllDayEvent();
  const startTime = isAllDay ? '' : formatTime(event.getStartTime());
  const endTime = isAllDay ? '' : formatTime(event.getEndTime());

  // type判定：参加者が複数いる or ビデオ会議URLあり → meeting
  const guests = event.getGuestList();
  const hasVideoCall = event.getLocation()
    ? (event.getLocation().includes('meet.google') || event.getLocation().includes('zoom'))
    : false;
  const type = (guests.length > 0 || hasVideoCall) ? 'meeting' : 'event';

  // description組み立て
  const parts = [];
  if (event.getLocation()) parts.push(`場所: ${event.getLocation()}`);
  if (guests.length > 0) parts.push(`参加者: ${guests.slice(0, 5).map(g => g.getEmail()).join(', ')}${guests.length > 5 ? ' 他' : ''}`);
  if (isAllDay) parts.push('終日イベント');
  if (event.getDescription()) parts.push(`概要: ${truncate(event.getDescription(), 100)}`);

  const now = nowString();
  return {
    cardId: generateId('cal'),
    date: targetDate,
    source: 'calendar',
    type: type,
    title: event.getTitle() || '（タイトルなし）',
    description: parts.join(' / '),
    startTime: startTime,
    endTime: endTime,
    url: event.getEventSeries().getId() ? '' : '',  // CalendarAppではURLを直接取得できない
    includeInReport: true,
    userNote: '',
    confidence: 'observed',
    status: '',
    rawId: event.getId(),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 指定日の開始・終了Dateを返す
 */
function getDayRange(targetDate) {
  const tz = Session.getScriptTimeZone();
  const startOfDay = new Date(Utilities.formatDate(
    new Date(targetDate + 'T00:00:00'), tz, "yyyy-MM-dd'T'00:00:00"
  ));
  // JavaScriptのDateパース
  const parts = targetDate.split('-').map(Number);
  const start = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const end = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
  return { startOfDay: start, endOfDay: end };
}

/**
 * Dateオブジェクトを "HH:mm" 形式にフォーマットする
 */
function formatTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm');
}

/**
 * 文字列を指定文字数で切り詰める
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen) + '…';
}
