/**
 * ReportGenerator.gs
 * 日報生成：テンプレートベースでGoogle Docsに日報ドラフトを作成する
 *
 * 日報生成処理はbuildReportBody()に集約してあるため、
 * 後からAI APIへの差し替えはこの関数だけを変更すれば対応できる。
 */

/**
 * 指定日の日報をGoogle Docsに生成してdaily_reportsに保存する
 * メニュー「日報を生成」から呼ばれる
 */
function generateDailyReport(targetDate) {
  const ui = SpreadsheetApp.getUi();

  logInfo('generateDailyReport', `Start generating report for ${targetDate}`, '');

  const cards = getIncludedCards(targetDate);
  if (cards.length === 0) {
    ui.alert(`⚠️ ${targetDate} の活動カードが0件です。\n先に「今日の活動を取得」を実行してください。`);
    logWarn('generateDailyReport', 'No included cards found', `targetDate=${targetDate}`);
    return;
  }

  try {
    const reportTitle = buildReportTitle(targetDate);
    const reportBody = buildReportBody(cards, targetDate);
    const nextActions = extractNextActions(cards, targetDate);
    const improvements = buildImprovementSuggestions(cards, targetDate);

    // Google Docを作成
    const doc = createReportDoc(reportTitle, reportBody, nextActions, improvements, targetDate);
    const docUrl = doc.getUrl();

    const now = nowString();
    const reportId = generateId('rpt');

    // next_actionsシートに保存
    if (nextActions.length > 0) {
      saveNextActions(nextActions.map((a, i) => ({
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

    // daily_reportsに履歴保存
    saveDailyReport({
      reportId: reportId,
      date: targetDate,
      docUrl: docUrl,
      reportTitle: reportTitle,
      reportBody: reportBody,
      createdAt: now,
      updatedAt: now
    });

    logInfo('generateDailyReport', `Report created`, `url=${docUrl}, cards=${cards.length}`);
    ui.alert(`✅ 日報を生成しました！\n\n${reportTitle}\n\n${docUrl}\n\nGoogle Docsを開いて内容を確認・編集してください。`);

  } catch (e) {
    logError('generateDailyReport', 'Report generation failed', e);
    ui.alert(`❌ 日報生成に失敗しました。\n\n${e.message}`);
  }
}

/**
 * 日報タイトルを生成する
 */
function buildReportTitle(targetDate) {
  const parts = targetDate.split('-').map(Number);
  return `日報：${parts[0]}年${parts[1]}月${parts[2]}日`;
}

/**
 * ActivityCard配列から日報本文を生成する（テンプレートベース）
 *
 * ここをAI APIに差し替えることで、より洗練された日報を生成できる。
 * 引数と戻り値（string）のインターフェイスは変えないこと。
 */
function buildReportBody(cards, targetDate) {
  const calCards = cards.filter(c => c.source === 'calendar');
  const gmailCards = cards.filter(c => c.source === 'gmail');
  const driveCards = cards.filter(c => c.source === 'drive');
  const taskCards = cards.filter(c => c.source === 'tasks');
  const manualCards = cards.filter(c => c.source === 'manual');

  const lines = [];

  // 1. 本日の主な業務
  lines.push('## 1. 本日の主な業務');
  if (calCards.length === 0 && gmailCards.length === 0 && driveCards.length === 0 && taskCards.length === 0 && manualCards.length === 0) {
    lines.push('- （活動カードなし）');
  } else {
    // カレンダー（予定・打ち合わせ候補）
    if (calCards.length > 0) {
      lines.push('### 予定・打ち合わせ候補');
      calCards.forEach(c => {
        const timeStr = c.startTime ? `${c.startTime}${c.endTime ? '〜' + c.endTime : ''}` : '';
        const note = c.userNote ? `（補足：${c.userNote}）` : '';
        lines.push(`- ${timeStr ? '[' + timeStr + '] ' : ''}${c.title}${note}`);
      });
    }
    // Gmail（社外対応）
    if (gmailCards.length > 0) {
      lines.push('### 社外対応（メール）');
      gmailCards.forEach(c => {
        const note = c.userNote ? `（補足：${c.userNote}）` : '';
        lines.push(`- ${c.title}${note}`);
      });
    }
    // Drive（資料作成・更新）
    if (driveCards.length > 0) {
      lines.push('### 資料作成・更新');
      driveCards.forEach(c => {
        const note = c.userNote ? `（補足：${c.userNote}）` : '';
        lines.push(`- ${c.title}${note}`);
      });
    }
    // Tasks（タスク対応）
    if (taskCards.length > 0) {
      lines.push('### タスク対応');
      taskCards.forEach(c => {
        const completedMark = c.status === 'completed' ? '✅ ' : '⬜ ';
        const note = c.userNote ? `（補足：${c.userNote}）` : '';
        lines.push(`- ${completedMark}${c.title}${note}`);
      });
    }
    // 手動追加
    if (manualCards.length > 0) {
      lines.push('### その他（手動追加）');
      manualCards.forEach(c => {
        const note = c.userNote ? `（補足：${c.userNote}）` : '';
        lines.push(`- ${c.title}${note}`);
      });
    }
  }
  lines.push('');

  // 2. 進捗・成果
  lines.push('## 2. 進捗・成果');
  const completedTasks = taskCards.filter(c => c.status === 'completed');
  const userNoteCards = cards.filter(c => c.userNote && c.userNote.trim());

  if (completedTasks.length > 0) {
    completedTasks.forEach(c => {
      lines.push(`- ✅ ${c.userNote || c.title}`);
    });
  }
  if (userNoteCards.length > 0) {
    userNoteCards
      .filter(c => c.source !== 'tasks' || c.status !== 'completed')
      .forEach(c => {
        lines.push(`- ${c.userNote}`);
      });
  }
  if (completedTasks.length === 0 && userNoteCards.length === 0) {
    lines.push('- （user_noteに進捗・成果を記入してください）');
  }
  lines.push('');

  // 3. 課題・検討事項
  lines.push('## 3. 課題・検討事項');
  lines.push('- （activity_cardsのuser_noteに課題・検討事項を記入してください）');
  lines.push('');

  return lines.join('\n');
}

/**
 * 次回タスク候補をActivityCard配列から抽出して返す
 */
function extractNextActions(cards, targetDate) {
  const actions = [];

  // 未完了・期限切れタスク
  cards.filter(c => c.source === 'tasks' && c.status !== 'completed').forEach(c => {
    actions.push({
      title: c.title,
      description: c.status === 'overdue' ? '⚠️ 期限切れ - 要対応' : c.description,
      sourceCardId: c.cardId,
      priority: c.status === 'overdue' ? 'high' : 'normal'
    });
  });

  // Gmailの送受信（返信候補）
  cards.filter(c => c.source === 'gmail' && c.type === 'received_email').forEach(c => {
    actions.push({
      title: `返信確認: ${c.title}`,
      description: `受信メールへの対応を確認`,
      sourceCardId: c.cardId,
      priority: 'normal'
    });
  });

  // user_noteに「TODO」「要対応」「確認」などが含まれるもの
  const todoKeywords = ['todo', 'TODO', '要対応', '確認', '検討', '連絡', 'フォロー'];
  cards.filter(c => c.userNote).forEach(c => {
    if (todoKeywords.some(kw => c.userNote.includes(kw))) {
      actions.push({
        title: `[要対応] ${c.title}`,
        description: c.userNote,
        sourceCardId: c.cardId,
        priority: 'normal'
      });
    }
  });

  return actions;
}

/**
 * 業務効率化のヒントをテンプレートベースで生成する
 */
function buildImprovementSuggestions(cards, targetDate) {
  const suggestions = [];

  const meetingCount = cards.filter(c => c.source === 'calendar' && c.type === 'meeting').length;
  const gmailCount = cards.filter(c => c.source === 'gmail').length;
  const driveCount = cards.filter(c => c.source === 'drive').length;
  const overdueCount = cards.filter(c => c.status === 'overdue').length;

  if (meetingCount >= 4) {
    suggestions.push('会議が多い日でした。翌日はまとまった作業時間の確保を検討してみてください。');
  }
  if (gmailCount >= 10) {
    suggestions.push('メール対応が多めです。メールチェックの時間帯を決めるとフローが改善される可能性があります。');
  }
  if (driveCount >= 5) {
    suggestions.push('ドキュメント作成・更新が多い日でした。テンプレートの整備で効率化できるかもしれません。');
  }
  if (overdueCount > 0) {
    suggestions.push(`期限切れタスクが${overdueCount}件あります。優先度を見直して早めに対応しましょう。`);
  }
  if (suggestions.length === 0) {
    suggestions.push('バランスの取れた1日でした。引き続き継続してください。');
  }

  return suggestions;
}

/**
 * Google Docsに日報ドキュメントを作成して返す
 */
function createReportDoc(reportTitle, reportBody, nextActions, improvements, targetDate) {
  const folderId = getConfigValue('report_output_folder_id', '');
  let folder;
  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      logWarn('createReportDoc', `Invalid folder ID: ${folderId}. Using root folder.`, e.toString());
      folder = null;
    }
  }

  // ドキュメント作成
  const doc = folder
    ? DocumentApp.create(reportTitle)
    : DocumentApp.create(reportTitle);

  // フォルダ指定がある場合は移動
  if (folder) {
    const docFile = DriveApp.getFileById(doc.getId());
    folder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);
  }

  const body = doc.getBody();
  body.clear();

  // タイトル
  const titlePara = body.appendParagraph(reportTitle);
  titlePara.setHeading(DocumentApp.ParagraphHeading.TITLE);

  // 生成日時
  const datePara = body.appendParagraph(
    `生成日時: ${nowString()}  |  対象日: ${targetDate}`
  );
  datePara.setItalic(true);
  body.appendParagraph('');

  // 本文セクションをパース・書き込み
  writeMarkdownToDocs(body, reportBody);

  // 次回タスクセクション
  const nextHeader = body.appendParagraph('## 4. 次回タスク');
  nextHeader.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (nextActions.length > 0) {
    nextActions.forEach(a => {
      const priorityMark = a.priority === 'high' ? '🔴 ' : '';
      body.appendListItem(`${priorityMark}${a.title}`);
    });
  } else {
    body.appendListItem('（なし）');
  }

  // 業務効率化のヒント
  const hintHeader = body.appendParagraph('## 5. 業務効率化のヒント');
  hintHeader.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  improvements.forEach(hint => {
    body.appendListItem(hint);
  });

  doc.saveAndClose();
  return doc;
}

/**
 * Markdown風テキストをGoogle Docsのパラグラフに変換して書き込む（簡易実装）
 */
function writeMarkdownToDocs(body, text) {
  const lines = text.split('\n');
  lines.forEach(line => {
    if (line.startsWith('## ')) {
      const para = body.appendParagraph(line.replace('## ', ''));
      para.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    } else if (line.startsWith('### ')) {
      const para = body.appendParagraph(line.replace('### ', ''));
      para.setHeading(DocumentApp.ParagraphHeading.HEADING3);
    } else if (line.startsWith('- ')) {
      body.appendListItem(line.replace(/^- /, ''));
    } else if (line.trim() === '') {
      body.appendParagraph('');
    } else {
      body.appendParagraph(line);
    }
  });
}
