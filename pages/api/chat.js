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
    // ⭐️ 關鍵修改：改用 'gemini-flash-latest'
    // 根據你的 Debug 結果，這是目前唯一可用的通用 Flash 模型名稱
    const model = genAI.getGenerativeModel({ 
        model: "gemini-flash-latest", 
        systemInstruction: SYSTEM_PROMPT 
    });

    // 處理歷史訊息
    const cleanHistory = (history || [])
      .filter((msg, index) => {
        if (index === 0 && msg.role === 'model') return false;
        return true;
      })
      .map(msg => {
        if (msg.parts) {
            return {
                role: msg.role === 'user' ? 'user' : 'model',
                parts: msg.parts
            };
        }
        return null;
      })
      .filter(item => item !== null);

    const chat = model.startChat({
      history: cleanHistory,
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ reply: text });

  } catch (error) {
    console.error("Gemini API Error details:", error);
    res.status(500).json({ error: error.message || "系統繁忙" });
  }
}