/**
 * SheetHelpers.gs
 * Spreadsheet操作のヘルパー関数
 */

/**
 * activity_cardsシートにActivityCardオブジェクトの配列を書き込む
 * 同日・同sourceの既存レコードを削除してから書き込む（重複防止）
 */
function saveActivityCards(cards) {
  if (!cards || cards.length === 0) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('activity_cards');
  if (!sheet) {
    logError('saveActivityCards', 'activity_cards sheet not found', null);
    return;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    // 同日・同sourceの行を削除
    if (sheet.getLastRow() > 1) {
      const date = cards[0].date;
      const source = cards[0].source;
      deleteCardsByDateAndSource(sheet, date, source);
    }

    const rows = cards.map(cardToRow);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ActivityCardオブジェクトをシート行配列に変換する
 */
function cardToRow(card) {
  return [
    card.cardId || '',
    card.date || '',
    card.source || '',
    card.type || '',
    card.title || '',
    card.description || '',
    card.startTime || '',
    card.endTime || '',
    card.url || '',
    card.includeInReport !== false,  // デフォルトtrue
    card.userNote || '',
    card.confidence || 'observed',
    card.status || '',
    card.createdAt || '',
    card.updatedAt || '',
    card.rawId || ''
  ];
}

/**
 * 指定日・指定sourceの行をシートから削除する
 */
function deleteCardsByDateAndSource(sheet, date, source) {
  const data = sheet.getDataRange().getValues();
  // 後ろから削除（行番号ずれ防止）
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === date && data[i][2] === source) {
      sheet.deleteRow(i + 1);
    }
  }
}

/**
 * activity_cardsシートから指定日・include_in_report=TRUEのカードを返す
 */
function getIncludedCards(targetDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('activity_cards');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const colIndex = {};
  headers.forEach((h, i) => { colIndex[h] = i; });

  return data.slice(1)
    .filter(row => {
      const rowDate = row[colIndex['date']];
      const include = row[colIndex['include_in_report']];
      return String(rowDate) === targetDate && (include === true || String(include).toLowerCase() === 'true');
    })
    .map(row => rowToCard(row, colIndex));
}

/**
 * シート行配列をActivityCardオブジェクトに変換する
 */
function rowToCard(row, colIndex) {
  return {
    cardId: row[colIndex['card_id']],
    date: row[colIndex['date']],
    source: row[colIndex['source']],
    type: row[colIndex['type']],
    title: row[colIndex['title']],
    description: row[colIndex['description']],
    startTime: row[colIndex['start_time']],
    endTime: row[colIndex['end_time']],
    url: row[colIndex['url']],
    includeInReport: row[colIndex['include_in_report']],
    userNote: row[colIndex['user_note']],
    confidence: row[colIndex['confidence']],
    status: row[colIndex['status']],
    createdAt: row[colIndex['created_at']],
    updatedAt: row[colIndex['updated_at']],
    rawId: row[colIndex['raw_id']]
  };
}

/**
 * daily_reportsシートに日報履歴を保存する
 */
function saveDailyReport(reportData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('daily_reports');
  if (!sheet) {
    logError('saveDailyReport', 'daily_reports sheet not found', null);
    return;
  }

  sheet.appendRow([
    reportData.reportId,
    reportData.date,
    reportData.docUrl,
    reportData.reportTitle,
    reportData.reportBody,
    reportData.createdAt,
    reportData.updatedAt
  ]);
}

/**
 * next_actionsシートに次回タスクを保存する
 */
function saveNextActions(actions) {
  if (!actions || actions.length === 0) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('next_actions');
  if (!sheet) {
    logError('saveNextActions', 'next_actions sheet not found', null);
    return;
  }

  const rows = actions.map(a => [
    a.actionId,
    a.date,
    a.title,
    a.description,
    a.sourceCardId || '',
    a.priority || 'normal',
    a.status || 'pending',
    a.createdAt,
    a.updatedAt
  ]);

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
}

/**
 * UUIDライクなIDを生成する（GAS標準ライブラリ不使用）
 */
function generateId(prefix) {
  const ts = new Date().getTime().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${ts}_${rand}`;
}

/**
 * 現在時刻を "yyyy-MM-dd HH:mm:ss" 形式で返す
 */
function nowString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
