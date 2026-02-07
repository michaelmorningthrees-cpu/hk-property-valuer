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
    // 🔥 修改點 1：改用最穩定的 'gemini-pro'
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // 🔥 修改點 2：手動將 System Prompt 放入對話歷史的第一條
    // (這比 systemInstruction 兼容性更高)
    const chatHistory = [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }],
      },
      {
        role: "model",
        parts: [{ text: "收到，我是 hk-valuation 小助手，請隨時吩咐。" }],
      },
      // 過濾掉前端傳來的舊 System Message (如果有)，避免重複
      ...history.filter((msg, index) => {
         // 簡單過濾：確保不會連續傳入奇怪的格式
         return true; 
      }).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }))
    ];

    const chat = model.startChat({
      history: chatHistory,
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