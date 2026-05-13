/**
 * Code.gs
 * エントリポイント：メニュー、トリガー
 */

/**
 * Spreadsheetを開いたときにカスタムメニューを追加する
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📋 日報ツール')
    .addItem('🔧 初期設定', 'setupDailyReportApp')
    .addSeparator()
    .addItem('📥 今日の活動を取得', 'collectTodayActivities')
    .addItem('📝 日報を生成', 'generateDailyReportMenu')
    .addItem('✨ Geminiでブラッシュアップ', 'openReportSidebar')
    .addSeparator()
    .addItem('📅 カレンダー一覧を確認', 'listAvailableCalendars')
    .addItem('🕐 明細ログを確認', 'openLogsSheet')
    .addItem('⏰ トリガーを設定', 'createDailyTrigger')
    .addToUi();
}

/**
 * メニューから「日報を生成」を実行する
 */
function generateDailyReportMenu() {
  const targetDate = getConfigValue('target_date') || getTodayString();
  generateDailyReport(targetDate);
}

/**
 * ログシートをアクティブにする
 */
function openLogsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('logs');
  if (sheet) {
    sheet.activate();
    SpreadsheetApp.getUi().alert('logsシートを表示しました。');
  } else {
    SpreadsheetApp.getUi().alert('logsシートが見つかりません。先に初期設定を実行してください。');
  }
}

/**
 * 毎日18:00前後のcollectTodayActivitiesを自動実行するトリガーを作成する
 */
function createDailyTrigger() {
  // 既存トリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'collectTodayActivities') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('collectTodayActivities')
    .timeBased()
    .everyDays(1)
    .atHour(18)
    .create();

  const ui = SpreadsheetApp.getUi();
  ui.alert('トリガーを設定しました。\n毎日18:00頃に「今日の活動を取得」が自動実行されます。');
  logInfo('createDailyTrigger', 'Daily trigger created at 18:00', '');
}

/**
 * 本日の日付文字列を YYYY-MM-DD 形式で返す
 */
function getTodayString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
