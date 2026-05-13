# daily-reporter-v2

Google Apps Script + Google Spreadsheet + Google Docs を使った日報生成 MVP

## 概要

Google Calendar / Gmail / Drive / Tasks の情報を収集し、
Spreadsheet で確認・編集したうえで Google Docs に日報ドラフトを生成します。

外部 AI API は使用せず、GAS 組み込みサービスのみで完結します。

---

## ファイル構成

```
├── appsscript.json          OAuth スコープ・依存サービス設定
├── Code.gs                  メニュー・エントリポイント・トリガー
├── Setup.gs                 初期セットアップ（シート作成・初期値投入）
├── Config.gs                configシートからの設定値読み込み
├── Logger.gs                ログ記録（logsシート）
├── SheetHelpers.gs          Spreadsheet操作ヘルパー
├── ActivityCollector.gs     活動取得ディスパッチャ
├── CalendarCollector.gs     Google Calendar 取得
├── GmailCollector.gs        Gmail 取得
├── DriveCollector.gs        Google Drive 取得
└── TasksCollector.gs        Google Tasks 取得（Advanced Service 要）
    ReportGenerator.gs       日報生成（Google Docs 出力）
```

---

## Google Tasks API の有効化手順

Google Tasks を使う場合は以下の手順が必要です。

1. Google Apps Script エディタを開く
2. 左サイドバーの「サービス」横の **＋** をクリック
3. 一覧から **Tasks API** を選択 → バージョン `v1`
4. 「追加」をクリック
5. `appsscript.json` の `enabledAdvancedServices` に以下が含まれていることを確認：
   ```json
   {
     "userSymbol": "Tasks",
     "serviceId": "tasks",
     "version": "v1"
   }
   ```
6. OAuth スコープに `https://www.googleapis.com/auth/tasks.readonly` が含まれていることを確認

Tasks API を有効化しない場合でも、他の機能（Calendar / Gmail / Drive）は正常に動作します。
Tasks の取得に失敗した場合は `logs` シートにエラーが記録されます。

---

## 初回セットアップ手順

### 1. プロジェクトを Google Apps Script にデプロイ

#### clasp を使う場合（推奨）
```bash
npm install -g @google/clasp
clasp login
clasp create --type sheets --title "Daily Reporter"
clasp push
```

#### 手動の場合
1. [Google Spreadsheet](https://sheets.google.com) で新規スプレッドシートを作成
2. 拡張機能 → Apps Script を開く
3. 各 `.gs` ファイルの内容を貼り付け（ファイルを追加しながら）
4. `appsscript.json` の内容をプロジェクト設定の `appsscript.json` に貼り付け

### 2. 初期設定を実行

1. Spreadsheet をリロード
2. メニューに「📋 日報ツール」が表示されたら
3. 「🔧 初期設定」をクリック
4. 権限許可ダイアログが表示されたら「許可」

### 3. config シートの編集

`config` シートで以下の設定値を確認・編集してください：

| キー | 値の例 | 説明 |
|------|--------|------|
| `report_output_folder_id` | `1aBcD...` | 日報 Doc の出力先フォルダ ID（空欄 = マイドライブ）|
| `target_date` | `2026-05-11` | 取得対象日（空欄 = 今日）|
| `gmail_query_extra` | `from:example.com` | Gmail 追加クエリ |
| `max_gmail_threads` | `20` | Gmail 最大取得件数 |
| `max_drive_files` | `30` | Drive 最大取得件数 |
| `include_calendar` | `true` | Calendar 取得する/しない |
| `include_gmail` | `true` | Gmail 取得する/しない |
| `include_drive` | `true` | Drive 取得する/しない |
| `include_tasks` | `true` | Tasks 取得する/しない |

**フォルダ ID の取得方法：**
Google Drive でフォルダを開き、URL の末尾の文字列をコピーしてください。
例: `https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVw` → ID は `1aBcDeFgHiJkLmNoPqRsTuVw`

---

## 動作確認手順

### Step 1: 活動を取得する
1. メニュー →「📥 今日の活動を取得」をクリック
2. 完了ダイアログで Calendar / Gmail / Drive の取得件数を確認
3. `activity_cards` シートに行が追加されていることを確認

### Step 2: カードを確認・編集する
`activity_cards` シートで以下の列を編集できます：

| 列名 | 説明 |
|------|------|
| `include_in_report` | `FALSE` にすると日報から除外 |
| `user_note` | 補足コメント。日報本文に優先反映される |
| `status` | 任意のステータス（`completed`, `skipped` など）|

### Step 3: 日報を生成する
1. メニュー →「📝 日報を生成」をクリック
2. 完了ダイアログに Google Docs の URL が表示される
3. URL をクリックして日報を開き、内容を確認・編集する

### Step 4: 自動トリガーを設定する（任意）
1. メニュー →「⏰ トリガーを設定」をクリック
2. 毎日 18:00 頃に自動で活動取得が実行されるようになります

---

## AI API への差し替え方法（将来の拡張）

`ReportGenerator.gs` の `buildReportBody(cards, targetDate)` 関数を差し替えるだけで対応できます。

```javascript
// 現在：テンプレートベース
function buildReportBody(cards, targetDate) {
  // ... テンプレート処理 ...
}

// 将来：AI API（例：Claude API）
function buildReportBody(cards, targetDate) {
  const prompt = buildPromptFromCards(cards, targetDate);
  const response = callClaudeAPI(prompt);
  return response.content;
}
```

引数 `cards`（ActivityCard 配列）と戻り値（string）は変えないでください。

---

## シート仕様

### config
設定値を管理します。key / value / description の 3 列構成。

### activity_cards
活動カードを保存します。`include_in_report` と `user_note` をユーザーが編集します。
同日・同 source の取得を再実行しても、既存カードに対応する `include_in_report` / `user_note` / `status` は保持されます。

### daily_reports
生成済み日報の履歴を保存します。Doc URL と本文テキストが含まれます。

### next_actions
次回タスク候補を保存します。日報生成時に自動抽出されます。

### logs
処理ログとエラーログを保存します。`level` が `ERROR_AUTH` の場合は権限エラー、`ERROR_QUOTA` はクォータ超過です。

---

## よくあるエラーと対処法

| エラー | 対処法 |
|--------|--------|
| `ERROR_AUTH` ログが出る | OAuth 権限を再許可する（Apps Script → 権限の管理） |
| Tasks 取得が `❌` になる | Tasks API を Advanced Services で有効化する |
| Drive 取得件数が 0 | 当日更新したファイルがない or 権限なしフォルダのみ |
| Gmail 取得件数が 0 | `gmail_query_extra` の構文を確認する |
