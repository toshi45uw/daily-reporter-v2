/**
 * Logger.gs
 * logsシートへのログ記録
 */

/**
 * INFOレベルのログを記録する
 */
function logInfo(functionName, message, detail) {
  appendLog('INFO', functionName, message, detail);
}

/**
 * WARNレベルのログを記録する
 */
function logWarn(functionName, message, detail) {
  appendLog('WARN', functionName, message, detail);
  console.warn(`[${functionName}] ${message}`, detail);
}

/**
 * ERRORレベルのログを記録する
 */
function logError(functionName, message, error) {
  const detail = error
    ? (error.stack || error.toString() || String(error))
    : '';

  // 権限不足・クォータ超過を特定して分類
  let level = 'ERROR';
  if (detail.includes('authorization') || detail.includes('Permission') || detail.includes('insufficient')) {
    level = 'ERROR_AUTH';
  } else if (detail.includes('quota') || detail.includes('Quota') || detail.includes('rate limit')) {
    level = 'ERROR_QUOTA';
  }

  appendLog(level, functionName, message, detail);
  console.error(`[${functionName}] ${message}`, detail);
}

/**
 * logsシートに1行追加する
 * LockServiceで排他制御し、複数トリガーの同時書き込みを防ぐ
 */
function appendLog(level, functionName, message, detail) {
  try {
    const lock = LockService.getScriptLock();
    lock.tryLock(3000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('logs');
    if (!sheet) {
      console.warn('logs sheet not found');
      return;
    }

    const timestamp = Utilities.formatDate(
      new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'
    );
    sheet.appendRow([
      timestamp,
      level,
      functionName,
      message,
      String(detail || '')
    ]);

    lock.releaseLock();
  } catch (e) {
    // ログ書き込み失敗はconsoleにだけ出力し、再帰しない
    console.error('appendLog failed:', e.toString());
  }
}
