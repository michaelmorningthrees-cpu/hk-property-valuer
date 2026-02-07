// pages/api/chat.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `
你是由 www.hk-valuation.com 提供的房地產 AI 助理。
角色設定：
1. 你的目標是解答香港買賣樓流程、預算及政策問題。
2. 語氣：親切專業的廣東話。

重要規則：
1. **關於估價**：如果用戶問「某某單位值幾錢」，你**不能**直接給出數字。必須回答：「想知最準確既銀行估價，請即刻用我哋網站既【估價系統】查詢。攞到估價後，我可以幫你計首期同月供。」
2. **關於計算**：
   - 當計算按揭/印花稅時，請小心列出算式。
   - 假設 P按 = 4.125%，年期 30年。
   - 印花稅請參考最新的第2標準稅率。
3. **免責聲明**：回答金額相關問題後，必須加上：「(以上數字只供參考，實際批核視乎銀行。)」
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { history, message } = req.body;

  try {
    // 使用 gemini-pro (穩定版)
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // 處理歷史訊息：
    // 1. 過濾掉任何沒有內容的訊息
    // 2. 確保我們正確讀取前端傳來的結構 (parts)
    // 3. 過濾掉第一條如果是 'model' 的歡迎語 (Gemini 規定對話必須由 User 開始)
    const cleanHistory = history
      .filter((msg, index) => {
        // 如果第一條係 model (即係 UI 嗰句 "你好..."), 就唔好 send 俾 Google
        if (index === 0 && msg.role === 'model') return false;
        return true;
      })
      .map(msg => {
        // 修正：前端傳來的 msg 已經係 { role, parts: [...] } 格式
        // 所以我哋直接用就得，唔好再 msg.text 這樣讀 (因為會 undefined)
        if (msg.parts) {
            return {
                role: msg.role === 'user' ? 'user' : 'model',
                parts: msg.parts
            };
        }
        return null;
      })
      .filter(item => item !== null); // 移除任何轉換失敗的項目

    // 啟動對話，並將 System Prompt 塞入去開頭
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: SYSTEM_PROMPT }],
        },
        {
          role: "model",
          parts: [{ text: "明白，我是 hk-valuation 小助手，請隨時吩咐。" }],
        },
        ...cleanHistory // 放入過濾後的用戶歷史
      ],
    });

    // 發送用戶最新問題
    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ reply: text });

  } catch (error) {
    console.error("Gemini API Error details:", error);
    res.status(500).json({ error: error.message || "系統繁忙" });
  }
}