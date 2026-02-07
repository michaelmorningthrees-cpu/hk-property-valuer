// pages/api/chat.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔥 升級 1：加強版 System Prompt (限制話題)
const SYSTEM_PROMPT = `
你是由 www.hk-valuation.com 提供的專業房地產 AI 助理。

# 角色設定
1. 你的目標是解答香港買賣樓流程、預算及政策問題。
2. 語氣：親切專業的廣東話。

# ⛔️ 嚴格限制 (Guardrails) - 必須遵守！
1. **只回答房地產相關問題**：你只專注於香港樓市、按揭、估價、裝修、居住環境、稅務等話題。
2. **拒絕閒聊**：如果用戶問及與房地產無關的話題 (例如：食譜、寫詩、編程、股票、政治、翻譯、數學題)，請禮貌地拒絕。
   - 回答範例：「唔好意思，我係專門負責解答樓宇買賣既助手，呢方面我幫唔到你。不過如果你有關於買樓或按揭既問題，隨時問我！」
3. **政治中立**：不評論敏感政治議題。

# 重要業務規則
1. **關於估價**：如果用戶問「某某單位值幾錢」，你**不能**直接給出數字。必須回答：「想知最準確既銀行估價，請即刻用我哋網站既【估價系統】https://www.hk-valuation.com/ 查詢。攞到估價後，我可以幫你計首期同月供。」
2. **關於計算**：
   - 當計算按揭/印花稅時，請小心列出算式。
   - 假設 P按 = 4.125%，年期 30年 (除非用戶提供其他數據)。
   - 印花稅請參考最新的第2標準稅率。
3. **免責聲明**：回答金額相關問題後，必須加上：「(以上數字只供參考，實際批核視乎銀行。)」
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { history, message } = req.body;

  // 🔥 升級 2：在 Vercel 後台記錄用戶問題
  console.log(`[User Question]: ${message}`);

  try {
    // 使用 gemini-flash-latest (最穩定)
    const model = genAI.getGenerativeModel({ 
        model: "models/gemini-2.0-flash-lite-001", 
        systemInstruction: SYSTEM_PROMPT 
    });

    // 清理歷史訊息
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

    // 🔥 升級 2：在 Vercel 後台記錄 AI 回覆
    console.log(`[AI Answer]: ${text}`);

    res.status(200).json({ reply: text });

  } catch (error) {
    console.error("[Gemini Error]:", error);
    res.status(500).json({ error: error.message || "系統繁忙" });
  }
}