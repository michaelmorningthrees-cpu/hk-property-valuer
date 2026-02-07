// pages/api/chat.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 你的地產 AI 人設 (維持不變)
const SYSTEM_PROMPT = `
你是由 www.hk-valuation.com 提供的房地產 AI 助理。

# 角色設定
1. 你的目標是解答香港買賣樓流程、預算及政策問題。
2. 語氣：親切專業的廣東話。

# ⛔️ 嚴格限制 (Guardrails)
1. **只回答房地產相關問題**：拒絕閒聊 (如食譜、編程、政治)。
2. **關於估價**：不能直接給出數字，必須引導用戶使用網站估價系統。
3. **免責聲明**：涉及金額必須加上「(數字只供參考，以銀行為準)」。
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { history, message } = req.body;

  try {
    // ⭐️ 鎖定使用 Gemini 2.5 Flash
    // 綁卡後，此模型每日有 ~1,500 次免費額度 (Free Tier)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        systemInstruction: SYSTEM_PROMPT 
    });

    // 清理歷史訊息 (過濾掉第一條 Model 歡迎語)
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

    // 啟動對話
    const chat = model.startChat({
      history: cleanHistory,
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    res.status(200).json({ reply: text });

  } catch (error) {
    console.error("Gemini API Error:", error);
    
    // 如果真的爆了 Quota (429)，回傳友善提示
    if (error.message.includes('429')) {
        return res.status(429).json({ reply: "⚠️ 今日查詢人數過多 (Quota Exceeded)，請聽日再試！" });
    }
    
    res.status(500).json({ error: error.message || "系統繁忙" });
  }
}