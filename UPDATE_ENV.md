# 更新 .env.local 文件

## 快速更新指南

請手動編輯專案根目錄下的 `.env.local` 文件，確保包含以下內容：

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/AKfycbwoqn4v3dx4PALMFWrUXwrgxFBec6HRf-3HlQsrUhE1LWdMv87TqVyg0ATvP0nlr2zAIQ/exec
GS_SECRET_TOKEN=valuation_secure_2024_test
```

## 重要提示

1. **重新啟動開發伺服器**: 修改 `.env.local` 後，必須重新啟動 Next.js 開發伺服器才能載入新的環境變數
   ```bash
   # 停止當前伺服器 (Ctrl+C)
   npm run dev
   ```

2. **驗證設定**: 確保 URL 和令牌正確無誤，沒有多餘的空格或換行符

3. **安全性**: `.env.local` 文件已被 `.gitignore` 忽略，不會被提交到版本控制系統
