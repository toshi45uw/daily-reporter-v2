/**
 * GeminiClient.gs
 * Google Gemini API 呼び出しクライアント
 *
 * 事前設定: GASエディタ → プロジェクトの設定 → スクリプトプロパティ
 *   キー: GEMINI_API_KEY  値: (Google AI Studio で取得したAPIキー)
 */

const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Gemini にマルチターンチャットでメッセージを送り、返答とupdated履歴を返す
 *
 * @param {string} systemPrompt - システムプロンプト
 * @param {Array}  conversationHistory - 過去の会話履歴 [{role, parts}]
 * @param {string} userMessage - 今回のユーザーメッセージ
 * @returns {{ reply: string, history: Array }}
 */
function callGeminiChat(systemPrompt, conversationHistory, userMessage) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY が未設定です。\n' +
      'GASエディタ → プロジェクトの設定 → スクリプトプロパティ に\n' +
      'キー: GEMINI_API_KEY を追加してください。\n' +
      'APIキーは https://aistudio.google.com/apikey で取得できます。'
    );
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const contents = (conversationHistory || []).concat([
    { role: 'user', parts: [{ text: userMessage }] }
  ]);

  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const json = JSON.parse(response.getContentText());
  if (json.error) throw new Error(`Gemini API エラー: ${json.error.message}`);

  const replyText = json.candidates[0].content.parts[0].text;
  const updatedHistory = contents.concat([
    { role: 'model', parts: [{ text: replyText }] }
  ]);

  return { reply: replyText, history: updatedHistory };
}
