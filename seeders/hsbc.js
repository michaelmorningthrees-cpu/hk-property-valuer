const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 啟動 HSBC (Selectize 深度爬蟲) - 修復版...');

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: { width: 1300, height: 900 },
    // ✅ FIX: 加入防止偵測的參數
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled' 
    ]
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const URL = 'https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/';
  console.log(`🔗 前往: ${URL}`);
  
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ✅ FIX: 明確等待 Selectize 元件出現
  console.log('⏳ 等待估價工具載入...');
  try {
      // 這裡等待第一個 selectize input 出現，最多等 30 秒
      await page.waitForSelector('.selectize-control.single', { visible: true, timeout: 30000 });
  } catch (e) {
      console.error('❌ 找不到下拉選單！可能是頁面結構改變或被阻擋。');
      await page.screenshot({ path: path.join(dataDir, 'error_screenshot.png') });
      console.log('📸 已儲存錯誤截圖: error_screenshot.png');
      await browser.close();
      return;
  }

  // 1. 處理 Cookie Popup
  console.log('🧹 嘗試清理畫面...');
  try {
      // HSBC 常見的 Cookie 按鈕 Selector
      const selectors = ['#onetrust-accept-btn-handler', 'button[aria-label="Close"]', '.icon-close-thick'];
      for (const sel of selectors) {
          if (await page.$(sel)) {
              await page.click(sel);
              console.log(`   (已關閉視窗: ${sel})`);
              await new Promise(r => setTimeout(r, 1000));
          }
      }
  } catch(e) {}

  // 滾動畫面確保元素在視窗內
  await page.evaluate(() => {
      const el = document.querySelector('.selectize-control');
      if(el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 2000));

  /**
   * 核心功能：操作 Selectize.js
   */
  const getSelectizeOptions = async (index, label) => {
    // 重新獲取 DOM，避免 Context 丟失
    const wrappers = await page.$$('.selectize-control.single');
    
    if (!wrappers[index]) {
        console.log(`❌ 找不到第 ${index} 個下拉選單 (${label})`);
        // 除錯：印出目前找到幾個
        console.log(`   目前頁面只有 ${wrappers.length} 個 selectize 元件`);
        return [];
    }

    const wrapper = wrappers[index];
    const input = await wrapper.$('.selectize-input');

    // ✅ FIX: 確保 Input 可點擊
    try {
        await input.click();
    } catch (e) {
        console.log(`⚠️ 無法點擊 ${label}，嘗試使用 JS 觸發`);
        await page.evaluate((el) => el.click(), input);
    }

    // 等待下拉選單動畫
    await new Promise(r => setTimeout(r, 1500));

    // ✅ FIX: 改良抓取邏輯，確保抓取的是「當前展開」的 dropdown
    // Selectize 打開時會給 wrapper 添加 'loading' 或 dropdown 會變成 'display: block'
    const options = await page.evaluate((idx) => {
        // 必須精確定位到對應的 selectize-dropdown
        const wrappers = document.querySelectorAll('.selectize-control.single');
        const targetWrapper = wrappers[idx];
        if (!targetWrapper) return [];

        const dropdownContent = targetWrapper.querySelector('.selectize-dropdown-content');
        if (!dropdownContent) return [];

        const opts = dropdownContent.querySelectorAll('.option');
        
        return Array.from(opts)
            .filter(opt => {
                const val = opt.getAttribute('data-value');
                const text = opt.innerText.trim();
                return val && val !== '' && !text.includes('請選擇') && !opt.classList.contains('disabled');
            })
            .map(opt => ({
                t: opt.innerText.trim(),
                v: opt.getAttribute('data-value')
            }));
    }, index);

    // 關閉選單 (點擊 body 或是再次點擊 input)
    await page.mouse.click(0, 0); 
    await new Promise(r => setTimeout(r, 500));
    
    return options;
  };

  const selectOption = async (index, value) => {
    const wrappers = await page.$$('.selectize-control.single');
    if(!wrappers[index]) return;

    const input = await wrappers[index].$('.selectize-input');
    await input.click();
    await new Promise(r => setTimeout(r, 1000));

    // ✅ FIX: 使用 evaluate 點擊，比 Puppeteer click 更穩定
    const success = await page.evaluate((idx, val) => {
        const wrapper = document.querySelectorAll('.selectize-control.single')[idx];
        const option = wrapper.querySelector(`.selectize-dropdown-content .option[data-value="${val}"]`);
        if (option) {
            option.click();
            return true;
        }
        return false;
    }, index, value);

    if (!success) console.log(`   ⚠️ 選項點擊失敗: ${value}`);
    
    // 等待 API 回應與連動 (Loading)
    await new Promise(r => setTimeout(r, 2000)); 
  };

  // ==========================================
  // 主流程
  // ==========================================
  
  let allData = [];

  // --- 1. 區域 ---
  console.log('📡 正在讀取區域 (Region)...');
  const regions = await getSelectizeOptions(0, "區域");
  
  if (regions.length === 0) {
      console.log('❌ 區域列表為空，程式終止。請檢查 error_screenshot.png');
      await page.screenshot({ path: path.join(dataDir, 'debug_empty_region.png') });
      await browser.close();
      return;
  }

  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const region of regions) {
      console.log(`👉 [區域]: ${region.t}`);
      await selectOption(0, region.v);

      // --- 2. 分區 ---
      const districts = await getSelectizeOptions(1, "分區");
      
      for (const district of districts) {
          // console.log(`   ↳ [分區]: ${district.t}`);
          await selectOption(1, district.v);

          // --- 3. 屋苑 ---
          const estates = await getSelectizeOptions(2, "屋苑");
          console.log(`      🏠 [${region.t} - ${district.t}] 找到 ${estates.length} 個屋苑`);

          if (estates.length > 0) {
              for (const estate of estates) {
                  allData.push({
                      region: region.t,
                      district: district.t,
                      estate: estate.t,
                      id: estate.v
                  });
              }
              // 💾 每抓完一個分區就存檔一次，防止崩潰資料全失
              fs.writeFileSync(path.join(dataDir, 'hsbc_estates_partial.json'), JSON.stringify(allData, null, 2));
          }
      }
  }

  const outFile = path.join(dataDir, 'hsbc_estates_full.json');
  fs.writeFileSync(outFile, JSON.stringify(allData, null, 2));
  console.log(`\n✅ 爬取完成！共 ${allData.length} 筆資料`);
  console.log(`📂 檔案已儲存: ${outFile}`);

  await browser.close();
})();