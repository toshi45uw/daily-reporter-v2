/**
 * ActivityCollector.gs
 * 各ソースからの活動取得をまとめて実行するディスパッチャ
 */

/**
 * 当日の活動をCalendar/Gmail/Drive/Tasksから収集してactivity_cardsに保存する
 * メニュー「今日の活動を取得」から呼ばれる
 */
function collectTodayActivities() {
  clearConfigCache();  // 毎回configを最新化

  const targetDate = getTargetDate();
  const ui = SpreadsheetApp.getUi();
  const summary = [];

  logInfo('collectTodayActivities', `Start collecting for ${targetDate}`, '');

  // --- Calendar ---
  if (getConfigBool('include_calendar', true)) {
    try {
      const cards = collectCalendarActivities(targetDate);
      saveActivityCards(cards);
      summary.push(`✅ Calendar: ${cards.length}件`);
      logInfo('collectTodayActivities', `Calendar collected`, `count=${cards.length}`);
    } catch (e) {
      summary.push(`❌ Calendar: 取得失敗`);
      logError('collectTodayActivities', 'Calendar collection failed', e);
    }
  } else {
    summary.push(`⏭ Calendar: スキップ`);
  }

  // --- Gmail ---
  if (getConfigBool('include_gmail', true)) {
    try {
      const cards = collectGmailActivities(targetDate);
      saveActivityCards(cards);
      summary.push(`✅ Gmail: ${cards.length}件`);
      logInfo('collectTodayActivities', `Gmail collected`, `count=${cards.length}`);
    } catch (e) {
      summary.push(`❌ Gmail: 取得失敗`);
      logError('collectTodayActivities', 'Gmail collection failed', e);
    }
  } else {
    summary.push(`⏭ Gmail: スキップ`);
  }

  // --- Drive ---
  if (getConfigBool('include_drive', true)) {
    try {
      const cards = collectDriveActivities(targetDate);
      saveActivityCards(cards);
      summary.push(`✅ Drive: ${cards.length}件`);
      logInfo('collectTodayActivities', `Drive collected`, `count=${cards.length}`);
    } catch (e) {
      summary.push(`❌ Drive: 取得失敗`);
      logError('collectTodayActivities', 'Drive collection failed', e);
    }
  } else {
    summary.push(`⏭ Drive: スキップ`);
  }

  // --- Tasks ---
  if (getConfigBool('include_tasks', true)) {
    try {
      const cards = collectTasksActivities(targetDate);
      if (cards.length > 0) {
        saveActivityCards(cards);
      }
      summary.push(`✅ Tasks: ${cards.length}件`);
      logInfo('collectTodayActivities', `Tasks collected`, `count=${cards.length}`);
    } catch (e) {
      summary.push(`❌ Tasks: 取得失敗（Tasks APIが有効か確認してください）`);
      logError('collectTodayActivities', 'Tasks collection failed', e);
    }
  } else {
    summary.push(`⏭ Tasks: スキップ`);
  }

  logInfo('collectTodayActivities', `Collection completed for ${targetDate}`, summary.join(', '));

  ui.alert(
    `📥 活動取得完了 (${targetDate})\n\n` + summary.join('\n') +
    '\n\nactivity_cardsシートで内容を確認・編集後、「日報を生成」を実行してください。'
  );
}
