/**
 * DriveCollector.gs
 * Google Driveから当日作成・更新したファイルを取得してActivityCardに変換する
 *
 * 方針：
 * - ファイル本文の全文解析はしない
 * - ファイル名・種別・更新日時・URLのみ扱う
 */

// 取得対象MIMEタイプ
const TARGET_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint'
];

const MIME_LABEL = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.spreadsheet': 'Google Sheets',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/msword': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.ms-powerpoint': 'PowerPoint'
};

/**
 * 指定日に更新されたDriveファイルを取得してActivityCard配列を返す
 */
function collectDriveActivities(targetDate) {
  const maxFiles = getConfigInt('max_drive_files', 30);
  const cards = [];

  const { startOfDay, endOfDay } = getDayRange(targetDate);
  const afterStr = startOfDay.toISOString();

  // DriveAppのsearchFilesはクォータ効率が良い
  // modifiedDate で当日以降を絞り込む
  const mimeQuery = TARGET_MIME_TYPES.map(m => `mimeType = '${m}'`).join(' or ');
  const query = `(${mimeQuery}) and modifiedDate >= '${afterStr}' and trashed = false`;

  try {
    const fileIterator = DriveApp.searchFiles(query);
    let count = 0;

    while (fileIterator.hasNext() && count < maxFiles) {
      try {
        const file = fileIterator.next();
        // modifiedDate が対象日のもののみ
        const modDate = file.getLastUpdated();
        if (!isWithinDay(modDate, startOfDay, endOfDay)) continue;

        const card = createActivityCardFromDriveFile(file, targetDate);
        if (card) {
          cards.push(card);
          count++;
        }
      } catch (e) {
        logError('collectDriveActivities', 'Failed to convert Drive file', e);
      }
    }
  } catch (e) {
    if (e.toString().includes('authorization') || e.toString().includes('permission')) {
      logError('collectDriveActivities', 'Drive access denied - check OAuth scope', e);
    } else if (e.toString().includes('quota') || e.toString().includes('Quota')) {
      logError('collectDriveActivities', 'Drive quota exceeded', e);
    } else {
      logError('collectDriveActivities', 'Drive search failed', e);
    }
    throw e;
  }

  return cards;
}

/**
 * DriveFileオブジェクトをActivityCardに変換する
 */
function createActivityCardFromDriveFile(file, targetDate) {
  const mime = file.getMimeType();
  const label = MIME_LABEL[mime] || 'ファイル';
  const modTime = formatTime(file.getLastUpdated());
  const url = file.getUrl();

  const parts = [
    `種別: ${label}`,
    `更新: ${modTime}`,
    `URL: ${url}`
  ];

  const now = nowString();
  return {
    cardId: generateId('drv'),
    date: targetDate,
    source: 'drive',
    type: 'document_work',
    title: file.getName(),
    description: parts.join(' / '),
    startTime: modTime,
    endTime: '',
    url: url,
    includeInReport: true,
    userNote: '',
    confidence: 'observed',
    status: '',
    rawId: file.getId(),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 指定Dateが開始〜終了の範囲内か判定する
 */
function isWithinDay(date, start, end) {
  return date >= start && date <= end;
}
