/**
 * GmailCollector.gs
 * Gmailから当日の送受信メールを取得してActivityCardに変換する
 *
 * 方針：
 * - 本文の全文は保存しない（snippet ≤ 100文字のみ）
 * - noreply・通知・広告・メルマガを除外
 * - 社外ドメインの受信メールを優先
 */

// 除外するメールの特徴
const EXCLUDE_FROM_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'notification', 'notifications',
  'mailer-daemon', 'postmaster', 'bounce', 'newsletter', 'support@',
  'info@', 'alert@', 'updates@', 'hello@', 'team@'
];

const EXCLUDE_SUBJECT_PATTERNS = [
  '購読', 'メルマガ', 'newsletter', 'unsubscribe', '配信', 'お知らせ',
  'ご案内', '自動送信', 'Do not reply', 'no reply'
];

/**
 * 指定日のGmailスレッドを取得してActivityCard配列を返す
 */
function collectGmailActivities(targetDate) {
  const cards = [];
  const maxThreads = getConfigInt('max_gmail_threads', 20);
  const extraQuery = getConfigValue('gmail_query_extra', '');

  const dateForQuery = targetDate.replace(/-/g, '/');  // Gmail query format

  // 送信メール
  const sentQuery = buildQuery(`in:sent after:${dateForQuery} before:${getNextDayQuery(targetDate)}`, extraQuery);
  const sentCards = fetchGmailCards(sentQuery, maxThreads, 'sent_email', targetDate);
  cards.push(...sentCards);
  logInfo('collectGmailActivities', `Sent emails`, `count=${sentCards.length}, query=${sentQuery}`);

  // 受信メール（社外フィルタ付き）
  const inboxQuery = buildQuery(`in:inbox after:${dateForQuery} before:${getNextDayQuery(targetDate)}`, extraQuery);
  const receivedCards = fetchGmailCards(inboxQuery, maxThreads, 'received_email', targetDate);
  cards.push(...receivedCards);
  logInfo('collectGmailActivities', `Received emails`, `count=${receivedCards.length}, query=${inboxQuery}`);

  // 重複（同じスレッドID）を除去
  const seen = new Set();
  return cards.filter(c => {
    if (seen.has(c.rawId)) return false;
    seen.add(c.rawId);
    return true;
  });
}

/**
 * Gmailクエリを実行してActivityCard配列を返す
 */
function fetchGmailCards(query, maxResults, defaultType, targetDate) {
  const cards = [];
  try {
    const threads = GmailApp.search(query, 0, maxResults);
    threads.forEach(thread => {
      try {
        const card = createActivityCardFromGmailThread(thread, targetDate, defaultType);
        if (card) cards.push(card);
      } catch (e) {
        logError('fetchGmailCards', `Failed to convert thread: ${thread.getFirstMessageSubject()}`, e);
      }
    });
  } catch (e) {
    if (e.toString().includes('authorization') || e.toString().includes('permission')) {
      logError('fetchGmailCards', 'Gmail access denied - check OAuth scope', e);
    } else {
      logError('fetchGmailCards', `Gmail search failed: ${query}`, e);
    }
  }
  return cards;
}

/**
 * GmailThreadオブジェクトをActivityCardに変換する
 */
function createActivityCardFromGmailThread(thread, targetDate, defaultType) {
  const messages = thread.getMessages();
  if (!messages || messages.length === 0) return null;

  const lastMsg = messages[messages.length - 1];
  const subject = thread.getFirstMessageSubject() || '（件名なし）';
  const fromAddress = lastMsg.getFrom();
  const toAddress = lastMsg.getTo();

  // 除外判定
  if (shouldExcludeEmail(fromAddress, subject)) return null;

  // snippet（本文の先頭100文字程度）
  const snippet = truncate(lastMsg.getPlainBody().replace(/\s+/g, ' ').trim(), 100);

  // type判定
  const isSent = fromAddress.includes(Session.getEffectiveUser().getEmail());
  const type = isSent ? 'sent_email' : (isExternalDomain(fromAddress) ? 'external_communication' : defaultType);

  const msgDate = Utilities.formatDate(lastMsg.getDate(), Session.getScriptTimeZone(), 'HH:mm');

  const parts = [];
  if (!isSent) parts.push(`差出人: ${maskEmail(fromAddress)}`);
  if (isSent) parts.push(`宛先: ${truncate(toAddress, 60)}`);
  parts.push(`時刻: ${msgDate}`);
  if (snippet) parts.push(`概要: ${snippet}`);

  const now = nowString();
  return {
    cardId: generateId('gml'),
    date: targetDate,
    source: 'gmail',
    type: type,
    title: subject,
    description: parts.join(' / '),
    startTime: msgDate,
    endTime: '',
    url: '',
    includeInReport: true,
    userNote: '',
    confidence: 'observed',
    status: '',
    rawId: thread.getId(),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * メールを除外すべきか判定する
 */
function shouldExcludeEmail(from, subject) {
  const fromLower = (from || '').toLowerCase();
  const subjectLower = (subject || '').toLowerCase();

  return EXCLUDE_FROM_PATTERNS.some(p => fromLower.includes(p)) ||
         EXCLUDE_SUBJECT_PATTERNS.some(p => subjectLower.includes(p));
}

/**
 * メールアドレスが社外ドメインか判定する（簡易実装）
 */
function isExternalDomain(email) {
  const myEmail = Session.getEffectiveUser().getEmail();
  const myDomain = myEmail.split('@')[1] || '';
  const senderDomain = (email.match(/@([^\s>]+)/) || [])[1] || '';
  return myDomain && senderDomain && myDomain !== senderDomain;
}

/**
 * メールアドレスのローカルパートを部分的にマスクする（プライバシー配慮）
 */
function maskEmail(fullFrom) {
  // "Name <email@domain.com>" 形式を "Name <e***@domain.com>" に
  return fullFrom.replace(/([a-zA-Z0-9._%+\-]+)(@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g, (match, local, domain) => {
    const masked = local.length <= 2 ? local : local[0] + '***';
    return masked + domain;
  });
}

/**
 * Gmailクエリ用の翌日文字列を返す
 */
function getNextDayQuery(targetDate) {
  const parts = targetDate.split('-').map(Number);
  const next = new Date(parts[0], parts[1] - 1, parts[2] + 1);
  return Utilities.formatDate(next, Session.getScriptTimeZone(), 'yyyy/MM/dd');
}

/**
 * クエリ文字列を組み合わせる
 */
function buildQuery(base, extra) {
  return extra ? `${base} ${extra}` : base;
}
