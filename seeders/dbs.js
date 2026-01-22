const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 啟動 DBS 爬蟲 (屋苑 + 座數版)...');

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // 設定全域超時
  page.setDefaultTimeout(60000);

  const URL = 'https://evalhk.cushmanwakefield.com.hk/e-valuation/DBSV2/Home/Index/cn';
  console.log(`🔗 前往網站...`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // --- Selectors ---
  const ID_REGION   = '#divselect_area';
  const ID_DISTRICT = '#divselect_dist';
  const ID_ESTATE   = '#divselect_est';
  const ID_BLOCK    = '#divselect_bldg'; // 新增：座數/大廈的 ID

  // Helper: 獲取選項 (過濾掉 "請選擇")
  const getCustomOptions = async (boxId) => {
    return page.evaluate((bid) => {
      const container = document.querySelector(bid);
      if (!container) return [];
      
      // 檢查是否隱藏或不可用
      if (container.style.display === 'none') return [];

      const anchors = Array.from(container.querySelectorAll('ul li a'));
      return anchors
        .map(a => ({
          t: a.innerText.trim(),
          v: a.getAttribute('selectid')
        }))
        .filter(o => o.v && o.v !== '0' && !o.t.includes('請選擇') && !o.t.includes('Select'));
    }, boxId);
  };

  // Helper: 獲取當前選中的文字
  const getCurrentText = async (boxId) => {
    return page.evaluate((bid) => {
        const el = document.querySelector(`${bid} cite`);
        return el ? el.innerText.trim() : '';
    }, boxId);
  };

  // Helper: 堅如磐石的選擇函式
  // targetBox: 要點擊的下拉框 ID
  // nextBox:   點擊後，預期內容會變化的下一個下拉框 ID (用來判斷載入完成)
  const safeSelectOption = async (targetBox, nextBox, optionName, optionValue) => {
    const currentText = await getCurrentText(targetBox);

    // 1. 檢查是否已選中 (避免重複點擊)
    if (currentText.includes(optionName) && optionName.length > 1) {
        return; 
    }

    // console.log(`      👆 點擊: ${optionName} (ID: ${optionValue})`);
    const optionSelector = `${targetBox} ul li a[selectid="${optionValue}"]`;

    // 2. 嘗試打開選單 (如果未打開)
    try {
        const isClosed = await page.evaluate((bid) => {
            const ul = document.querySelector(`${bid} ul`);
            return !ul || ul.style.display === 'none';
        }, targetBox);
        
        if (isClosed) {
            await page.click(`${targetBox} cite`);
            await new Promise(r => setTimeout(r, 300));
        }
    } catch(e) {}

    // 3. 執行點擊選項
    try {
        await page.click(optionSelector);
    } catch(e) {
        // Fallback: JS Click
        await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if(el) el.click();
        }, optionSelector);
    }

    // 4. 等待下一個選單數據更新 (如果有 nextBox)
    if (nextBox) {
        try {
            await page.waitForFunction(
                (bid) => {
                    const links = document.querySelectorAll(`${bid} ul li a`);
                    // 當選項數量大於 1 (因為通常會有一個預設的 "請選擇")，視為載入完成
                    return links.length > 1; 
                },
                { timeout: 5000 }, // 等待 5 秒
                nextBox
            );
        } catch(e) {
            // 超時通常代表該屋苑可能沒有座數 (例如單幢樓)，或者網路慢
            // 這裡不 throw error，讓流程繼續
        }
    } else {
        await new Promise(r => setTimeout(r, 500));
    }
  };

  let results = [];

  console.log('⏳ 等待頁面初始化...');
  await page.waitForSelector(ID_REGION);

  // --- 1. Regions (區域) ---
  const regions = await getCustomOptions(ID_REGION);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
    // 選擇區域 -> 等待地區更新
    await safeSelectOption(ID_REGION, ID_DISTRICT, r.t, r.v);

    // --- 2. Districts (地區) ---
    const districts = await getCustomOptions(ID_DISTRICT);
    
    for (const d of districts) {
      // 選擇地區 -> 等待屋苑更新
      await safeSelectOption(ID_DISTRICT, ID_ESTATE, d.t, d.v);

      // --- 3. Estates (屋苑) ---
      const estates = await getCustomOptions(ID_ESTATE);
      console.log(`   🏠 [${d.t}] 處理 ${estates.length} 個屋苑...`);

      for (const e of estates) {
        // 選擇屋苑 -> 等待座數 (ID_BLOCK) 更新
        // 這是新增的關鍵步驟
        await safeSelectOption(ID_ESTATE, ID_BLOCK, e.t, e.v);

        // --- 4. Blocks (座數) ---
        const blocks = await getCustomOptions(ID_BLOCK);

        if (blocks.length > 0) {
            // 情況 A: 有座數資料
            for (const b of blocks) {
                results.push({
                    bank: 'dbs',
                    region: r.t,
                    district: d.t,
                    name: e.t,       // 屋苑名
                    value: e.v,      // 屋苑 ID
                    block: b.t,      // 座數名
                    block_value: b.v // 座數 ID
                });
            }
        } else {
            // 情況 B: 無座數 (獨立屋/單幢)，Block 欄位留空
            results.push({
                bank: 'dbs',
                region: r.t,
                district: d.t,
                name: e.t,
                value: e.v,
                block: null,
                block_value: null
            });
        }
      }
    }
  }

  // 儲存結果
  const outFile = path.join(dataDir, 'dbs.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ DBS 爬取完成！共 ${results.length} 筆資料已儲存至 ${outFile}`);

  await browser.close();
})();