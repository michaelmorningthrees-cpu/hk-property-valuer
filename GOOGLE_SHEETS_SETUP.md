# Google Sheets 整合設定指南

## 步驟 1: 創建 Google Sheet

1. 創建一個新的 Google Sheet
2. 在第一行添加標題行：
   - A1: 時間戳記 (Timestamp)
   - B1: 物業地址 (Address)
   - C1: Email 地址 (Email)
   - D1: 目的 (Purpose)

## 步驟 2: 創建 Google Apps Script

1. 在 Google Sheet 中，點擊「擴充功能」>「Apps Script」
2. 刪除預設代碼，貼上以下代碼：

```javascript
function doPost(e) {
  try {
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Security: Verify the token matches
    const expectedToken = 'valuation_secure_2024_test';
    if (data.token !== expectedToken) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get the active sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Extract data
    const timestamp = data.timestamp || new Date().toISOString();
    const address = data.address || '';
    const email = data.email || '';
    const purpose = data.purpose || '';
    
    // Append row to the sheet
    sheet.appendRow([timestamp, address, email, purpose]);
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. 點擊「儲存」並為專案命名（例如：HK Valuation Form Handler）

## 步驟 3: 部署為 Web App

1. 點擊「部署」>「新增部署作業」
2. 選擇類型：「網頁應用程式」
3. 設定：
   - 說明：HK Valuation Form Handler
   - 執行身份：我
   - 具有存取權的使用者：所有人
4. 點擊「部署」
5. 複製「網頁應用程式 URL」

## 步驟 4: 設定環境變數

1. 在專案根目錄創建 `.env.local` 文件
2. 添加以下內容：

```
GOOGLE_SCRIPT_URL=你的網頁應用程式URL
GS_SECRET_TOKEN=valuation_secure_2024_test
NEXT_PUBLIC_WHATSAPP_NUMBER=852XXXXXXXXX
```

3. 將以下內容替換：
   - `你的網頁應用程式URL`：從步驟 3 複製的 Web App URL
   - `852XXXXXXXXX`：你的實際 WhatsApp 號碼（格式：國家代碼+號碼，無空格或+號）
   - `valuation_secure_2024_test`：可以更改為更安全的令牌（記得同時更新 Google Apps Script 中的 `expectedToken`）

## 步驟 5: 重新啟動開發伺服器

```bash
npm run dev
```

## 注意事項

- 在開發模式下，如果沒有設定 `GOOGLE_SHEETS_WEB_APP_URL`，表單數據會記錄到控制台
- 確保 Google Apps Script 的執行權限已正確設定
- WhatsApp 號碼格式：85212345678（香港示例）
