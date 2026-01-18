require('dotenv').config({ path: '.env.local' });
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

// 這裡設定你要測試的地址
const TEST_CASE = {
  address: "屯門聚康山莊3座16樓A室",
  region: "新界/離島",
  district: "屯門",
  estate: "聚康山莊",
  block: "3",    // 目標座數
  floor: "16",   // 目標層數
  unit: "A"
};

async function debugManual() {
  console.log('🚀 啟動手動除錯模式...');
  const browser = await chromium.launch({
    headless: false, // 必須開啟視窗
    slowMo: 100,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 進入 HSBC
    console.log('📄 正在載入 HSBC...');
    await page.goto('https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/', { waitUntil: 'domcontentloaded' });
    
    // 2. 處理 Cookies 和 Iframe
    try {
      await page.click('text=接受', { timeout: 3000 });
    } catch (e) {}

    console.log('⏳ 等待 Iframe...');
    const frame = await waitForFrame(page);
    console.log('✅ 找到 Iframe');

    // 3. 自動填寫前幾項
    console.log('🤖 自動填寫: 區域 & 分區...');
    await selectDropdown(frame, '#tools_form_1', TEST_CASE.region); // 區域
    await frame.waitForTimeout(1000);
    await selectDropdown(frame, '#tools_form_2', TEST_CASE.district); // 分區
    await frame.waitForTimeout(1000);
    
    console.log(`🤖 自動填寫: 屋苑 (${TEST_CASE.estate})...`);
    await smartFill(frame, '#tools_form_3', TEST_CASE.estate);
    await frame.waitForTimeout(2000);

    // 4. 處理期數 (如果有)
    try {
      const phaseInput = await frame.$('#tools_form_4');
      if (phaseInput && await phaseInput.isVisible()) {
        console.log('🤖 發現期數，嘗試選擇...');
        await frame.click('#tools_form_4', { force: true });
        await frame.waitForTimeout(1000);
        await frame.keyboard.press('ArrowDown');
        await frame.keyboard.press('Enter');
      }
    } catch(e) {}

    // ============================================================
    // 🛑 暫停點：人手介入
    // ============================================================
    console.log('\n' + '='.repeat(50));
    console.log('🛑 腳本已暫停！現在輪到你了。');
    console.log(`👉 請在瀏覽器視窗中，人手點選座數: 【第 ${TEST_CASE.block} 座】`);
    console.log('👉 確保你點選後，「層數」的選單已經刷新（不再是 A, B, C）。');
    console.log('👉 完成後，請回到這裡按下 [Enter] 鍵繼續...');
    console.log('='.repeat(50) + '\n');

    await new Promise(resolve => process.stdin.once('data', resolve));

    // ============================================================
    // ▶️ 繼續：檢查腳本看到了什麼
    // ============================================================
    console.log('👀 正在檢查腳本讀取到的「層數」資料...');

    // 檢查 1: 輸入框現在顯示什麼？
    const currentFloorText = await frame.evaluate(() => {
        const el = document.querySelector('#tools_form_6 + .selectize-control .selectize-input');
        return el ? el.innerText.replace(/\n/g, '').trim() : '找不到元素';
    });
    console.log(`🔍 層數輸入框目前顯示: "${currentFloorText}"`);

    // 檢查 2: 嘗試打開選單並讀取選項
    console.log('📂 嘗試打開層數選單...');
    await frame.click('#tools_form_6 + .selectize-control .selectize-input', { force: true });
    await frame.waitForTimeout(1000);

    const options = await frame.evaluate(() => {
        const items = document.querySelectorAll('#tools_form_6_menu .option');
        return Array.from(items).map(item => item.textContent.trim());
    });
    
    console.log(`📋 讀取到的選項 (${options.length} 個):`);
    console.log(options.join(' | '));

    if (options.some(opt => opt === TEST_CASE.floor)) {
        console.log(`\n✅ 成功！腳本看到了目標層數 "${TEST_CASE.floor}"。`);
        console.log('結論：之前的錯誤是因為自動化點擊「座數」時沒有觸發更新，但你的手動點擊觸發了。');
    } else {
        console.log(`\n❌ 失敗！腳本依然沒有看到數字層數。`);
        console.log('結論：Selector 可能選錯了，或者網站結構有變。');
    }

  } catch (error) {
    console.error('❌ 發生錯誤:', error);
  } finally {
    console.log('\n測試結束。瀏覽器將保持開啟以便觀察。');
    // await browser.close(); // 不關閉瀏覽器
  }
}

// Helper: 等待 Iframe (更寬鬆的匹配)
async function waitForFrame(page) {
    let frame = null;
    console.log('🔍 正在掃描頁面上的 iframes...');

    // 最多嘗試 30 秒
    for (let i = 0; i < 30; i++) {
        const frames = page.frames();
        frame = frames.find(f =>
            f.url().includes('property') ||
            f.url().includes('valuation') ||
            f.url().includes('mortgage')
        );

        if (frame) {
            console.log(`✅ 成功找到 iframe: ${frame.url()}`);
            return frame;
        }

        await page.waitForTimeout(1000);
    }

    throw new Error('❌ 超時：找不到估價 iframe。請檢查瀏覽器是否顯示 "Access Denied" 或需要驗證碼。');
}

// Helper: 簡單下拉選擇
async function selectDropdown(frame, selector, text) {
    await frame.click(`${selector} + .selectize-control .selectize-input`, { force: true });
    await frame.waitForSelector(`${selector}_menu`, { state: 'visible' });
    await frame.locator(`${selector}_menu`).getByText(text).first().click();
}

// Helper: 智能輸入/點選
async function smartFill(frame, selector, text) {
    const inputSelector = `${selector} + .selectize-control .selectize-input input`;
    const containerSelector = `${selector} + .selectize-control .selectize-input`;
    const menuSelector = `${selector}_menu`;

    try {
        // 1. Check if input is visible (Searchable)
        if (await frame.isVisible(inputSelector)) {
            console.log(`⌨️  [Type] 輸入文字: ${text}`);
            await frame.click(inputSelector, { force: true });
            await frame.fill(inputSelector, '');
            await frame.type(inputSelector, text, { delay: 100 });
            await frame.waitForTimeout(1000);
            await frame.keyboard.press('Enter');
        }
        // 2. Fallback to Click (Non-searchable)
        else {
            console.log(`🖱️  [Click] 點選選單: ${text}`);
            await frame.click(containerSelector, { force: true });
            await frame.waitForSelector(menuSelector, { state: 'visible', timeout: 5000 });
            await frame.locator(menuSelector).getByText(text).first().click();
        }
    } catch (e) {
        console.error(`❌ smartFill 失敗 (${text}):`, e.message);
        throw e;
    }
}

debugManual();
