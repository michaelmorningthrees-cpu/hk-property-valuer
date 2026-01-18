const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 啟動 Hang Seng (中文版) 爬蟲...');

  // 確保 data 資料夾存在
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  const browser = await puppeteer.launch({ 
    headless: false, // 設為 false 可以看到爬取過程，Debug 方便
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // 1. 前往網址 (中文版 zh-hk)
  const URL = 'https://www.hangseng.com/zh-hk/e-valuation/address-search/';
  console.log(`🔗 前往: ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // 2. 處理免責聲明 (如果有的話)
  try {
      const btnSelector = 'a.btn-accept, input[name="btnAccept"], button.accept-btn, a[id*="btnAccept"]';
      const btn = await page.waitForSelector(btnSelector, { timeout: 5000 }).catch(() => null);
      if (btn) {
          console.log('✅ 點擊免責聲明同意按鈕...');
          await btn.click();
          await new Promise(r => setTimeout(r, 2000));
      }
  } catch(e) {}

  // ID 定義
  const SEL_REGION   = '#areaValue';
  const SEL_DISTRICT = '#districtValue';
  const SEL_ESTATE   = '#estateValue';
  // Select2 的顯示容器 (用來點擊激活)
  const UI_REGION    = '#select2-areaValue-container';

  console.log('⏳ 等待頁面初始化...');

  // Helper: 智能等待數據
  const waitForDataLoad = async (hiddenSelectId, uiContainerId) => {
    try {
        // 嘗試等待 hidden select 內有 options
        await page.waitForFunction((sel) => {
            const el = document.querySelector(sel);
            return el && el.options && el.options.length > 1; 
        }, { timeout: 5000 }, hiddenSelectId);
    } catch(e) {
        // 如果超時，嘗試點擊 UI 觸發載入
        if (uiContainerId) {
            try {
                // console.log(`      ⚠️ 嘗試點擊激活 ${uiContainerId}...`);
                await page.click(uiContainerId);
                await new Promise(r => setTimeout(r, 500));
                // 再次等待
                await page.waitForFunction((sel) => {
                    const el = document.querySelector(sel);
                    return el && el.options.length > 1;
                }, { timeout: 5000 }, hiddenSelectId);
            } catch(err) {
                // 忽略錯誤，有些區域可能真的沒有資料
            }
        }
    }
  };

  // Helper: 獲取選項 (過濾掉 "請選擇", "Select" 等字眼)
  const getOptions = async (selector) => {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return [];
      return Array.from(el.options)
        .filter(o => {
            const text = o.innerText.trim();
            const val = o.value;
            // 過濾無效選項
            return val && val !== "" && 
                   !text.includes("Select") && 
                   !text.includes("選擇") &&
                   !text.includes("請選擇"); 
        })
        .map(o => ({t: o.innerText.trim(), v: o.value}));
    }, selector);
  };

  // Helper: Select2 觸發改變
  const triggerSelect2Change = async (selector, value) => {
      await page.evaluate((sel, val) => {
          const el = document.querySelector(sel);
          if(el) {
            el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            // 嘗試兼容 jQuery
            if (typeof $ !== 'undefined') $(sel).val(val).trigger('change');
          }
      }, selector, value);
  };

  let results = [];

  // --- 1. Regions (區域) ---
  console.log('⏳ 等待區域數據...');
  await waitForDataLoad(SEL_REGION, UI_REGION);

  const regions = await getOptions(SEL_REGION);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
    console.log(`👉 [區域] ${r.t}`);

    await triggerSelect2Change(SEL_REGION, r.v);
    
    // District 的 UI Container ID
    await waitForDataLoad(SEL_DISTRICT, '#select2-districtValue-container');

    // --- 2. Districts (分區) ---
    const districts = await getOptions(SEL_DISTRICT);
    
    for (const d of districts) {
      // 進度條顯示
      process.stdout.write(`   ↳ [分區] ${d.t} `);
      
      await triggerSelect2Change(SEL_DISTRICT, d.v);
      
      // Estate 的 UI Container ID
      await waitForDataLoad(SEL_ESTATE, '#select2-estateValue-container');

      // --- 3. Estates (屋苑) ---
      const estates = await getOptions(SEL_ESTATE);
      console.log(`- 找到 ${estates.length} 個屋苑`);

      for (const e of estates) {
        results.push({
          bank: 'hangseng',
          region: r.t,
          district: d.t,
          name: e.t,   // 這裡是中文名
          value: e.v   // 這是 ID
        });
      }
    }
  }

  // 儲存結果
  const outFile = path.join(dataDir, 'hangseng.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ Hang Seng 中文爬取完成！`);
  console.log(`📦 共 ${results.length} 筆資料已儲存至: ${outFile}`);

  await browser.close();
})();