const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('🚀 啟動 Hang Seng 爬蟲 (v2.0 座數完整版)...');

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    // slowMo: 20, // 稍微慢一點點有助於 Select2 反應
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800']
  });
  
  const page = await browser.newPage();
  
  // 資源攔截：加速爬蟲，不載入圖片
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const URL = 'https://www.hangseng.com/zh-hk/e-valuation/address-search/';
  console.log(`🔗 前往: ${URL}`);
  
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // 處理免責聲明 (如果有)
  try {
      const btnSelector = 'a.btn-accept, input[name="btnAccept"], button.accept-btn';
      const btn = await page.waitForSelector(btnSelector, { timeout: 5000 }).catch(() => null);
      if (btn) {
          console.log('✅ 點擊免責聲明...');
          await btn.click();
          await new Promise(r => setTimeout(r, 2000));
      }
  } catch(e) {}

  // --- Selectors ---
  // Hang Seng 的 ID 命名規則通常是 area -> district -> estate -> block
  const SEL_REGION   = '#areaValue';
  const SEL_DISTRICT = '#districtValue';
  const SEL_ESTATE   = '#estateValue';
  const SEL_BLOCK    = '#blockValue'; // 座數 ID

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Helper: 獲取 Hidden Select 的選項
  const getOptions = async (selector) => {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return [];
      // 即使是 display:none，options 屬性依然存在
      return Array.from(el.options)
        .filter(o => {
            const text = o.innerText.trim();
            const val = o.value;
            return val && val !== "" && 
                   !text.includes("Select") && 
                   !text.includes("選擇") &&
                   !text.includes("請選擇"); 
        })
        .map(o => ({t: o.innerText.trim(), v: o.value}));
    }, selector);
  };

  // Helper: 強制觸發 Select2 變更
  // 這是最關鍵的部分，模擬 jQuery 的 .val().trigger('change')
  const selectSelect2 = async (selector, value) => {
      await page.evaluate((sel, val) => {
          const el = document.querySelector(sel);
          if(el) {
              el.value = val;
              // 觸發原生事件
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
              
              // 嘗試觸發 jQuery 事件 (Hang Seng 依賴這個)
              if (typeof $ !== 'undefined') {
                  $(sel).val(val).trigger('change');
              }
          }
      }, selector, value);
      
      await sleep(500); // 等待 AJAX
  };

  // Helper: 等待下一個選單載入數據
  const waitForNextDropdown = async (nextSelector) => {
      try {
          await page.waitForFunction((sel) => {
              const el = document.querySelector(sel);
              // 等待選項數量 > 1 (因為通常有一個 "Please Select" 預設值)
              return el && el.options && el.options.length > 1;
          }, { timeout: 8000 }, nextSelector);
          return true;
      } catch(e) {
          return false; // 超時代表可能無資料
      }
  };

  // ==========================================
  // 主流程
  // ==========================================

  let results = [];

  console.log('⏳ 等待區域數據...');
  await waitForNextDropdown(SEL_REGION);
  const regions = await getOptions(SEL_REGION);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
    console.log(`👉 [區域] ${r.t}`);
    await selectSelect2(SEL_REGION, r.v);
    await waitForNextDropdown(SEL_DISTRICT);

    const districts = await getOptions(SEL_DISTRICT);
    
    for (const d of districts) {
    //   console.log(`   ↳ [分區] ${d.t}`);
      await selectSelect2(SEL_DISTRICT, d.v);
      await waitForNextDropdown(SEL_ESTATE);

      const estates = await getOptions(SEL_ESTATE);
      console.log(`   🏠 [${d.t}] 正在處理 ${estates.length} 個屋苑...`);

      for (const e of estates) {
        // 1. 選取屋苑
        await selectSelect2(SEL_ESTATE, e.v);
        
        // 2. 等待座數 (SEL_BLOCK) 載入
        // 注意：如果是獨立屋，這裡可能會超時回傳 false，這是正常的
        const hasBlocks = await waitForNextDropdown(SEL_BLOCK);
        
        let blocks = [];
        if (hasBlocks) {
            blocks = await getOptions(SEL_BLOCK);
        }

        if (blocks.length > 0) {
            // A: 有座數
            for (const b of blocks) {
                results.push({
                  bank: 'hangseng',
                  region: r.t,
                  district: d.t,
                  name: e.t,
                  value: e.v,
                  block: b.t,
                  block_value: b.v
                });
            }
        } else {
            // B: 無座數 (獨立屋)
            results.push({
              bank: 'hangseng',
              region: r.t,
              district: d.t,
              name: e.t,
              value: e.v,
              block: null,
              block_value: null
            });
        }
      }

      // 🔥 增量存檔 (每做完一個 District 存一次)
      const tempFile = path.join(dataDir, 'hangseng_temp.json');
      fs.writeFileSync(tempFile, JSON.stringify(results, null, 2));
    }
  }

  // 最終存檔
  const outFile = path.join(dataDir, 'hangseng.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ Hang Seng 爬取完成！`);
  console.log(`📦 共 ${results.length} 筆資料已儲存至: ${outFile}`);

  await browser.close();
})();