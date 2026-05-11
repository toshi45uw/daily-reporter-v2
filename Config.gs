/**
 * Config.gs
 * configシートからの設定値読み込み
 */

let _configCache = null;

/**
 * configシートの全設定をオブジェクトとして返す（セッション中キャッシュ）
 */
function getAllConfig() {
  if (_configCache) return _configCache;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('config');
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const config = {};
  data.slice(1).forEach(row => {
    const key = row[0];
    const value = row[1];
    if (key) config[key] = String(value);
  });

  _configCache = config;
  return config;
}

/**
 * 指定キーの設定値を返す。未設定時はdefaultValueを返す
 */
function getConfigValue(key, defaultValue) {
  const config = getAllConfig();
  const val = config[key];
  if (val === undefined || val === '') return defaultValue !== undefined ? defaultValue : '';
  return val;
}

/**
 * 設定値をbooleanとして返す（"true"文字列をtrueに変換）
 */
function getConfigBool(key, defaultValue) {
  const val = getConfigValue(key, '');
  if (val === '') return defaultValue !== undefined ? defaultValue : true;
  return val.toLowerCase() === 'true';
}

/**
 * 設定値をintegerとして返す
 */
function getConfigInt(key, defaultValue) {
  const val = getConfigValue(key, '');
  const num = parseInt(val, 10);
  return isNaN(num) ? (defaultValue !== undefined ? defaultValue : 0) : num;
}

/**
 * 対象日付を返す。configのtarget_dateが空なら今日の日付
 */
function getTargetDate() {
  const dateStr = getConfigValue('target_date', '');
  if (dateStr) return dateStr;
  return getTodayString();
}

/**
 * 設定キャッシュをクリアする（テスト用）
 */
function clearConfigCache() {
  _configCache = null;
}
