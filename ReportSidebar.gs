/**
 * ReportSidebar.gs
 * Gemini対話型日報ブラッシュアップ サイドバーのサーバーサイド処理
 */

/**
 * サイドバーを開く（メニューから呼ばれる）
 */
function openReportSidebar() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('SidebarReport')
      .setTitle('✨ Geminiで日報をブラッシュアップ')
      .setWidth(420);
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    logError('openReportSidebar', 'Failed to open sidebar', e);
    SpreadsheetApp.getUi().alert('サイドバーを開けませんでした。\n\n' + e.message);
  }
}

/**
 * サイドバー初期化：活動カードから初稿を生成してサイドバーに返す
 */
function getReportDraftForSidebar() {
  try {
    const targetDate = getTargetDate();
    const cards = getIncludedCards(targetDate);

    if (cards.length === 0) {
      return { error: `${targetDate} の活動カードが0件です。\n先に「今日の活動を取得」を実行してください。` };
    }

    const draft = buildReportBody(cards, targetDate);
    const title = buildReportTitle(targetDate);

    const cardsSummary = cards.map(c => [
      `[${c.source}] ${c.title}`,
      c.startTime ? `${c.startTime}〜${c.endTime}` : '',
      c.userNote ? `補足: ${c.userNote}` : '',
      c.status ? `状態: ${c.status}` : ''
    ].filter(s => s).join(' / ')).join('\n');

    const systemPrompt =
      `あなたは日本語の業務日報作成を支援するアシスタントです。\n` +
      `ユーザーの指示に従い、以下の活動データをもとに日報を改善してください。\n\n` +
      `【対象日】${targetDate}\n` +
      `【活動データ】\n${cardsSummary}\n\n` +
      `【ルール】\n` +
      `- 日報はMarkdown形式を維持する（## 見出し、- 箇条書き）\n` +
      `- セクション構成（## 1. 本日の主な業務 / ## 2. 進捗・成果 / ## 3. 課題・検討事項）を保つ\n` +
      `- 改善した日報本文のみを返す（前置きや説明文は不要）\n` +
      `- 機密情報・個人情報を不必要に詳述しない`;

    return { draft, title, targetDate, systemPrompt };
  } catch (e) {
    logError('getReportDraftForSidebar', 'Failed to get draft', e);
    return { error: e.message };
  }
}

/**
 * Gemini にチャットメッセージを送る（サイドバーから呼ばれる）
 */
function chatWithGeminiForReport(systemPrompt, history, userMessage) {
  try {
    return callGeminiChat(systemPrompt, history, userMessage);
  } catch (e) {
    logError('chatWithGeminiForReport', 'Gemini call failed', e);
    return { error: e.message };
  }
}

/**
 * 編集済み日報を Google Docs に保存する（サイドバーから呼ばれる）
 */
function saveFinalReportFromSidebar(reportBody, targetDate) {
  try {
    const cards = getIncludedCards(targetDate);
    const reportTitle = buildReportTitle(targetDate);
    const nextActions = extractNextActions(cards, targetDate);
    const improvements = buildImprovementSuggestions(cards, targetDate);

    const doc = createReportDoc(reportTitle, reportBody, nextActions, improvements, targetDate);
    const docUrl = doc.getUrl();

    const now = nowString();
    const reportId = generateId('rpt');

    if (nextActions.length > 0) {
      saveNextActions(nextActions.map(a => ({
        actionId: generateId('act'),
        date: targetDate,
        title: a.title,
        description: a.description || '',
        sourceCardId: a.sourceCardId || '',
        priority: a.priority || 'normal',
        status: 'pending',
        createdAt: now,
        updatedAt: now
      })));
    }

    saveDailyReport({ reportId, date: targetDate, docUrl, reportTitle, reportBody, createdAt: now, updatedAt: now });
    logInfo('saveFinalReportFromSidebar', 'Report saved via Gemini sidebar', `url=${docUrl}`);

    return { docUrl, reportTitle };
  } catch (e) {
    logError('saveFinalReportFromSidebar', 'Failed to save report', e);
    return { error: e.message };
  }
}
