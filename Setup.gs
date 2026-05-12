/**
 * Setup.gs
 * 初期セットアップ：シート作成、ヘッダー設定、config初期値投入
 */

const SHEET_NAMES = {
  CONFIG: 'config',
  ACTIVITY_CARDS: 'activity_cards',
  DAILY_REPORTS: 'daily_reports',
  NEXT_ACTIONS: 'next_actions',
  LOGS: 'logs'
};

const HEADERS = {
  config: ['key', 'value', 'description'],
  activity_cards: [
    'card_id', 'date', 'source', 'type', 'title', 'description',
    'start_time', 'end_time', 'url', 'include_in_report', 'user_note',
    'confidence', 'status', 'created_at', 'updated_at', 'raw_id'
  ],
  daily_reports: [
    'report_id', 'date', 'doc_url', 'report_title',
    'report_body', 'created_at', 'updated_at'
  ],
  next_actions: [
    'action_id', 'date', 'title', 'description',
    'source_card_id', 'priority', 'status', 'created_at', 'updated_at'
  ],
  logs: ['timestamp', 'level', 'function_name', 'message', 'detail']
};

const CONFIG_DEFAULTS = [
  ['report_output_folder_id', '', '日報Docの出力先フォルダID（空欄=マイドライブ）'],
  ['target_date', '', '取得対象日（YYYY-MM-DD, 空欄=今日）'],
  ['gmail_query_extra', '', 'Gmail検索クエリの追加条件（例: -from:info@example.com -to:info@example.com）'],
  ['max_gmail_threads', '20', '取得するGmailスレッドの最大件数'],
  ['max_drive_files', '30', '取得するDriveファイルの最大件数'],
  ['include_calendar', 'true', 'Calendarを取得するか（true/false）'],
  ['extra_calendar_ids', '', '追加取得するカレンダーID（カンマ区切り。空欄=プライマリのみ）'],
  ['include_gmail', 'true', 'Gmailを取得するか（true/false）'],
  ['gmail_keywords', '', '受信メールのキーワードOR条件（カンマ区切り。例: 加藤様,打ち合わせ,ご確認）'],
  ['include_drive', 'true', 'Driveを取得するか（true/false）'],
  ['drive_my_files_only', 'true', '自分が編集したDriveファイルのみ取得するか（true/false）'],
  ['include_tasks', 'true', 'Tasksを取得するか（true/false）']
];

/**
 * アプリの初期セットアップを実行する
 * シート作成・ヘッダー設定・config初期値投入
 */
function setupDailyReportApp() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  try {
    Object.values(SHEET_NAMES).forEach(name => {
      ensureSheet(ss, name, HEADERS[name]);
    });
    setupConfigDefaults(ss);
    formatSheets(ss);

    logInfo('setupDailyReportApp', 'Setup completed successfully', '');
    ui.alert('✅ 初期設定が完了しました。\n\nconfigシートの設定値を確認・編集してから「今日の活動を取得」を実行してください。');
  } catch (e) {
    logError('setupDailyReportApp', 'Setup failed', e);
    ui.alert('❌ 初期設定に失敗しました。\n\n' + e.message);
  }
}

/**
 * シートが存在しなければ作成し、ヘッダー行を設定する
 */
function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  const headerRow = sheet.getRange(1, 1, 1, headers.length);
  const existing = headerRow.getValues()[0];
  // ヘッダーが未設定のときだけ書き込む
  if (existing[0] !== headers[0]) {
    headerRow.setValues([headers]);
    headerRow.setFontWeight('bold');
    headerRow.setBackground('#d0e4f7');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * configシートにデフォルト値を投入する（既存キーは上書きしない）
 */
function setupConfigDefaults(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  const data = sheet.getDataRange().getValues();
  const existingKeys = data.slice(1).map(row => row[0]);

  const rowsToAdd = CONFIG_DEFAULTS.filter(([key]) => !existingKeys.includes(key));
  if (rowsToAdd.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rowsToAdd.length, 3).setValues(rowsToAdd);
  }
}

/**
 * 各シートの列幅など見た目を整える
 */
function formatSheets(ss) {
  const cardSheet = ss.getSheetByName(SHEET_NAMES.ACTIVITY_CARDS);
  if (cardSheet) {
    cardSheet.setColumnWidth(5, 250);  // title
    cardSheet.setColumnWidth(6, 350);  // description
    cardSheet.setColumnWidth(10, 60);  // include_in_report
    cardSheet.setColumnWidth(11, 200); // user_note
  }

  const logSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
  if (logSheet) {
    logSheet.setColumnWidth(4, 300);   // message
    logSheet.setColumnWidth(5, 400);   // detail
  }
}
