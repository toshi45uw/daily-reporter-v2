/**
 * TasksCollector.gs
 * Google Tasksから当日のタスクを取得してActivityCardに変換する
 *
 * 前提：
 * - Advanced Google Services の Tasks API (v1) を有効化が必要
 * - 有効化手順は README.md を参照
 * - Tasks APIが無効の場合はエラーをログに記録して空配列を返す
 */

/**
 * 指定日のタスクを取得してActivityCard配列を返す
 * Tasks APIが未有効の場合は空配列を返す（全体処理は止めない）
 */
function collectTasksActivities(targetDate) {
  const cards = [];

  // Tasks APIが利用可能か確認
  if (typeof Tasks === 'undefined') {
    logWarn('collectTasksActivities',
      'Tasks API is not enabled. Enable it in Resources > Advanced Google Services.',
      'Tasks object undefined');
    return cards;
  }

  try {
    const taskLists = Tasks.Tasklists.list({ maxResults: 20 });
    if (!taskLists || !taskLists.items) {
      logInfo('collectTasksActivities', 'No task lists found', '');
      return cards;
    }

    const { startOfDay, endOfDay } = getDayRange(targetDate);

    taskLists.items.forEach(taskList => {
      try {
        const tasks = fetchTasksFromList(taskList.id, targetDate, startOfDay, endOfDay);
        tasks.forEach(task => {
          try {
            const card = createActivityCardFromTask(task, targetDate, taskList.title);
            if (card) cards.push(card);
          } catch (e) {
            logError('collectTasksActivities', `Failed to convert task: ${task.title}`, e);
          }
        });
      } catch (e) {
        logError('collectTasksActivities', `Failed to fetch tasks from list: ${taskList.title}`, e);
      }
    });

  } catch (e) {
    if (e.toString().includes('authorization') || e.toString().includes('permission') || e.toString().includes('insufficientPermissions')) {
      logError('collectTasksActivities', 'Tasks API access denied - check OAuth scope (tasks.readonly)', e);
    } else if (e.toString().includes('quota') || e.toString().includes('Quota')) {
      logError('collectTasksActivities', 'Tasks API quota exceeded', e);
    } else {
      logError('collectTasksActivities', 'Tasks API failed', e);
    }
    throw e;
  }

  return cards;
}

/**
 * 指定タスクリストから対象日のタスクを取得する
 */
function fetchTasksFromList(taskListId, targetDate, startOfDay, endOfDay) {
  const result = [];

  // 当日期限のタスク
  const dueTasks = Tasks.Tasks.list(taskListId, {
    dueMin: startOfDay.toISOString(),
    dueMax: endOfDay.toISOString(),
    showCompleted: true,
    showHidden: true,
    maxResults: 50
  });

  if (dueTasks && dueTasks.items) {
    result.push(...dueTasks.items);
  }

  // 当日完了したタスク（期限外でも当日完了したもの）
  const completedTasks = Tasks.Tasks.list(taskListId, {
    completedMin: startOfDay.toISOString(),
    completedMax: endOfDay.toISOString(),
    showCompleted: true,
    showHidden: true,
    maxResults: 50
  });

  if (completedTasks && completedTasks.items) {
    // 重複除去
    const existingIds = new Set(result.map(t => t.id));
    completedTasks.items.forEach(t => {
      if (!existingIds.has(t.id)) result.push(t);
    });
  }

  return result;
}

/**
 * Tasks APIのTaskオブジェクトをActivityCardに変換する
 */
function createActivityCardFromTask(task, targetDate, taskListName) {
  if (!task || !task.title) return null;

  const isCompleted = task.status === 'completed';
  const dueDate = task.due ? Utilities.formatDate(new Date(task.due), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
  const isOverdue = dueDate && dueDate < targetDate && !isCompleted;

  const parts = [];
  if (taskListName) parts.push(`リスト: ${taskListName}`);
  if (dueDate) parts.push(`期限: ${dueDate}${isOverdue ? ' ⚠️期限切れ' : ''}`);
  parts.push(`状態: ${isCompleted ? '✅ 完了' : '⬜ 未完了'}`);
  if (task.notes) parts.push(`メモ: ${truncate(task.notes, 80)}`);

  const now = nowString();
  return {
    cardId: generateId('tsk'),
    date: targetDate,
    source: 'tasks',
    type: 'task',
    title: task.title,
    description: parts.join(' / '),
    startTime: '',
    endTime: '',
    url: task.selfLink || '',
    includeInReport: true,
    userNote: '',
    confidence: 'observed',
    status: isCompleted ? 'completed' : (isOverdue ? 'overdue' : 'pending'),
    rawId: task.id,
    createdAt: now,
    updatedAt: now
  };
}
