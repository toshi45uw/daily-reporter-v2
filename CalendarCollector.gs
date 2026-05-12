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
 *
 * getAllCalendars() で全カレンダーを取得してIDでフィルタリングする。
 * getCalendarById() は登録方法によっては null を返すため使用しない。
 */
function buildTargetCalendars() {
  const defaultCal = CalendarApp.getDefaultCalendar();
  const defaultId = defaultCal.getId();

  const extraIds = getConfigValue('extra_calendar_ids', '');
  if (!extraIds.trim()) {
    return [defaultCal];
  }

  // 対象IDのセット（プライマリ + extra_calendar_ids）
  const targetIds = new Set([defaultId]);
  extraIds.split(',').forEach(id => {
    const trimmed = id.trim();
    if (trimmed) targetIds.add(trimmed);
  });

  // getAllCalendars() から対象IDのみ抽出（getCalendarById()より確実）
  const all = CalendarApp.getAllCalendars();
  const matched = all.filter(cal => targetIds.has(cal.getId()));

  // extra_calendar_idsで指定したIDのうち見つからなかったものをログに記録
  const foundIds = new Set(matched.map(cal => cal.getId()));
  targetIds.forEach(id => {
    if (!foundIds.has(id)) {
      logWarn('buildTargetCalendars',
        `Calendar not found in your calendar list: ${id}`,
        'メニュー「カレンダー一覧を確認」で利用可能なIDを確認してください');
    }
  });

  return matched.length > 0 ? matched : [defaultCal];
}

/**
 * Googleカレンダーに登録されている全カレンダーの名前とIDをダイアログに表示する
 * メニュー「カレンダー一覧を確認」から呼ばれる
 */
function listAvailableCalendars() {
  const calendars = CalendarApp.getAllCalendars();
  const lines = calendars.map(cal => `${cal.getName()}\n  → ${cal.getId()}`);
  const message = lines.join('\n\n');

  const ui = SpreadsheetApp.getUi();
  // ダイアログの文字数制限があるため長い場合はlogsシートにも出力
  logInfo('listAvailableCalendars', 'Available calendars', lines.join(' | '));
  ui.alert(
    '📅 利用可能なカレンダー一覧\n\n' + message +
    '\n\nconfigシートの extra_calendar_ids に追加したいカレンダーのIDをカンマ区切りで入力してください。'
  );
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
