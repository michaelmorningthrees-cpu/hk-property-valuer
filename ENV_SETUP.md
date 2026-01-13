# 環境變數設定指南

## 步驟 1: 創建 .env.local 文件

在專案根目錄（與 `package.json` 同級）手動創建 `.env.local` 文件，並添加以下內容：

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/AKfycbwoqn4v3dx4PALMFWrUXwrgxFBec6HRf-3HlQsrUhE1LWdMv87TqVyg0ATvP0nlr2zAIQ/exec
GS_SECRET_TOKEN=valuation_secure_2024_test
```

## 步驟 2: 環境變數說明

1. **GOOGLE_SCRIPT_URL**: 你的 Google Apps Script Web App URL（已設定為部署的 URL）
2. **GS_SECRET_TOKEN**: 安全令牌，用於驗證請求（目前設定為 `valuation_secure_2024_test`）

## 步驟 3: 驗證 .gitignore

`.gitignore` 文件已經包含以下規則，確保 `.env.local` 不會被提交到 Git：

```
# local env files
.env*.local
```

這意味著所有以 `.env` 開頭並以 `.local` 結尾的文件都會被忽略。

## 步驟 4: 重新啟動開發伺服器

修改 `.env.local` 後，需要重新啟動 Next.js 開發伺服器才能載入新的環境變數：

```bash
# 停止當前伺服器 (Ctrl+C)
# 然後重新啟動
npm run dev
```

## 在 Next.js API 路由中訪問環境變數

在 API 路由中（例如 `pages/api/submit.js`），你可以通過 `process.env` 訪問環境變數：

```javascript
// 伺服器端環境變數（僅在 API 路由中可用）
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL
const GS_SECRET_TOKEN = process.env.GS_SECRET_TOKEN

// 注意：只有以 NEXT_PUBLIC_ 開頭的變數才能在客戶端使用
// 例如：process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
```

## 重要提示

1. **安全性**: 永遠不要將 `.env.local` 文件提交到版本控制系統
2. **生產環境**: 在部署到 Vercel、Netlify 等平台時，需要在平台設定中添加這些環境變數
3. **變數命名**: 
   - 伺服器端變數：直接使用（如 `GOOGLE_SCRIPT_URL`）
   - 客戶端變數：必須以 `NEXT_PUBLIC_` 開頭（如 `NEXT_PUBLIC_WHATSAPP_NUMBER`）

## 範例：在 API 路由中使用

```javascript
// pages/api/submit.js
export default async function handler(req, res) {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL
  const secretToken = process.env.GS_SECRET_TOKEN
  
  // 使用這些變數...
}
```
