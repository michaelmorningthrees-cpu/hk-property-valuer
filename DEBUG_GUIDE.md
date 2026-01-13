# 調試指南 - 表單提交失敗

## 如何檢查終端輸出

當表單提交失敗時，請在運行 `npm run dev` 的終端視窗中查找以下標記：

### 1. 環境變數檢查

查找以下日誌來確認環境變數是否正確載入：

```
=== API Debug Info ===
GOOGLE_SCRIPT_URL exists: true/false
GOOGLE_SCRIPT_URL value: https://script.google.com/...
GS_SECRET_TOKEN exists: true/false
GS_SECRET_TOKEN length: XX
```

**如果看到：**
- `GOOGLE_SCRIPT_URL exists: false` → 環境變數未載入
- `GOOGLE_SCRIPT_URL value: NOT SET` → `.env.local` 文件不存在或未正確設定
- `GOOGLE_SCRIPT_URL value: YOUR_DEPLOYED_WEB_APP_URL...` → 環境變數仍是預設值，需要更新

### 2. 請求發送檢查

查找以下日誌來確認請求是否發送：

```
📤 Sending request to Google Script...
Payload (without token): { address: '...', email: '...', purpose: '...' }
```

**如果沒有看到這個日誌：** 表示請求在發送前就失敗了（通常是環境變數問題）

### 3. Google Script 響應檢查

查找以下日誌來查看 Google Script 的回應：

```
📥 Google Script Response Status: 200/400/500
📥 Google Script Response OK: true/false
📥 Google Script Response Body (raw): {...}
```

**常見狀態碼：**
- `200` → 成功
- `400` → 請求格式錯誤（檢查 payload）
- `401` → 未授權（檢查 token）
- `404` → URL 錯誤或函數不存在
- `500` → Google Script 內部錯誤

### 4. 錯誤訊息

查找以下標記來識別錯誤：

- `❌` → 錯誤標記
- `⚠️` → 警告標記
- `✅` → 成功標記

## 常見問題排查

### 問題 1: "GOOGLE_SCRIPT_URL not configured"

**解決方法：**
1. 確認 `.env.local` 文件存在於專案根目錄
2. 確認文件內容正確：
   ```env
   GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/AKfycbwoqn4v3dx4PALMFWrUXwrgxFBec6HRf-3HlQsrUhE1LWdMv87TqVyg0ATvP0nlr2zAIQ/exec
   GS_SECRET_TOKEN=valuation_secure_2024_test
   ```
3. **重新啟動開發伺服器**（重要！）
   ```bash
   # 停止伺服器 (Ctrl+C)
   npm run dev
   ```

### 問題 2: Google Script 返回 404 或 "Script function not found"

**解決方法：**
1. 確認 Google Apps Script 中有 `doPost` 函數（不是 `doGet`）
2. 確認已正確部署為 Web App
3. 確認 URL 是正確的（從 Google Apps Script 部署頁面複製）

### 問題 3: Google Script 返回 401 或未授權錯誤

**解決方法：**
1. 確認 `GS_SECRET_TOKEN` 在 `.env.local` 中的值
2. 確認 Google Apps Script 中的 `expectedToken` 與 `.env.local` 中的值一致
3. 檢查 Google Apps Script 代碼中的 token 驗證邏輯

### 問題 4: 響應不是 JSON 格式

**解決方法：**
1. 檢查 Google Apps Script 的 `doPost` 函數是否返回 JSON
2. 確認使用了 `ContentService.createTextOutput()` 和 `.setMimeType(ContentService.MimeType.JSON)`

## 完整調試流程

1. **檢查環境變數載入**
   - 在終端查找 `=== API Debug Info ===`
   - 確認所有變數都存在且正確

2. **檢查請求發送**
   - 查找 `📤 Sending request to Google Script...`
   - 確認 payload 包含正確的數據

3. **檢查 Google 響應**
   - 查找 `📥 Google Script Response Status:`
   - 查看響應狀態碼和內容

4. **檢查錯誤訊息**
   - 查找 `❌` 標記的錯誤
   - 根據錯誤訊息進行相應修復

## 測試步驟

1. 打開瀏覽器開發者工具（F12）
2. 切換到 "Console" 標籤
3. 提交表單
4. 同時查看：
   - 瀏覽器 Console（前端錯誤）
   - 終端輸出（後端錯誤和調試信息）

## 需要幫助？

如果問題仍然存在，請提供：
1. 終端中的完整錯誤日誌（從 `=== API Debug Info ===` 開始）
2. 瀏覽器 Console 中的錯誤訊息
3. `.env.local` 文件內容（隱藏敏感信息）
