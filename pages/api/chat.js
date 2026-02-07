import { GoogleGenerativeAI } from "@google/generative-ai";

// 初始化 Google Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 定義機械人的角色與規則 (System Prompt)
const SYSTEM_PROMPT = `
你是由 www.hk-valuation.com 提供的房地產 AI 助理。

# 角色設定
1. 你的目標是解答香港買賣樓流程、預算及政策問題。
2. 語氣：親切專業的廣東話。

# 重要規則
1. **關於估價**：如果用戶問「某某單位值幾錢」，你**不能**直接給出數字。必須回答：「想知最準確既銀行估價，請即刻用我哋網站既【估價系統】查詢。攞到估價後，我可以幫你計首期同月供。」
2. **關於計算**：
   - 當計算按揭/印花稅時，請小心列出算式。
   - 假設 P按 = 4.125%，年期 30年 (除非用戶提供其他數據)。
   - 印花稅請參考最新的第2標準稅率。
3. **免責聲明**：回答金額相關問題後，必須加上：「(以上數字只供參考，實際批核視乎銀行。)」
`;

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { history, message } = req.body;

  try {
    // 1. 設定模型：使用 gemini-1.5-flash
    // systemInstruction 參數可直接設定人設，比舊方法更穩定
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      systemInstruction: SYSTEM_PROMPT,
    });

    // 2. 清理歷史訊息 (Critical Step)
    // 你的前端傳來的格式是 [{ role: 'model', parts: [...] }, ...]
    // Google 規定：對話歷史的第一條訊息 *必須* 是 'user'。
    // 所以我們必須移除第一條由 'model' 發出的歡迎語。
    const cleanHistory = (history || []).filter((msg, index) => {
      // 如果是第一條訊息 (index 0) 且角色是 model，過濾掉它
      if (index === 0 && msg.role === 'model') return false;
      return true;
    });

    // 3. 啟動對話模式
    const chat = model.startChat({
      history: cleanHistory, // 傳入已清理的歷史
    });

    // 4. 發送用戶的最新問題
    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    // 5. 回傳結果
    res.status(200).json({ reply: text });

  } catch (error) {
    console.error("Gemini API Error details:", error);
    
    // 如果是 404，通常代表模型名稱錯誤或 SDK 版本過舊
    // 如果是 400，通常代表歷史訊息格式錯誤 (例如連續兩條 model 訊息)
    res.status(500).json({ 
      error: error.message || "系統繁忙，請稍後再試。",
      details: error.toString() // 這行方便你在 Vercel Logs 查看詳細原因
    });
  }
}