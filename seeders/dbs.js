const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 啟動 DBS (最終防彈版) 爬蟲...');

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: { width: 1366, height: 768 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // 設定全域超時為 60秒，避免太快報錯
  page.setDefaultTimeout(60000);

  const URL = 'https://evalhk.cushmanwakefield.com.hk/e-valuation/DBSV2/Home/Index/cn';
  console.log(`🔗 前往網站...`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // Selectors
  const ID_REGION   = '#divselect_area';
  const ID_DISTRICT = '#divselect_dist';
  const ID_ESTATE   = '#divselect_est';

  // Helper: 獲取選項
  const getCustomOptions = async (boxId) => {
    return page.evaluate((bid) => {
      const container = document.querySelector(bid);
      if (!container) return [];
      const anchors = Array.from(container.querySelectorAll('ul li a'));
      return anchors
        .map(a => ({
          t: a.innerText.trim(),
          v: a.getAttribute('selectid')
        }))
        .filter(o => o.v && o.v !== '0' && !o.t.includes('請選擇') && !o.t.includes('Select'));
    }, boxId);
  };

  // Helper: 獲取當前文字
  const getCurrentText = async (boxId) => {
    return page.evaluate((bid) => {
        const el = document.querySelector(`${bid} cite`);
        return el ? el.innerText.trim() : '';
    }, boxId);
  };

  // Helper: 堅如磐石的選擇函式
  // targetBox: 要點擊的 Dropdown
  // nextBox: 點擊後應該要變化的下一個 Dropdown (用來確認載入完成)
  const safeSelectOption = async (targetBox, nextBox, optionName, optionValue) => {
    const currentText = await getCurrentText(targetBox);

    // 1. 檢查是否已選中
    if (currentText.includes(optionName) && optionName.length > 1) {
        // console.log(`      ⚡️ 已選中 [${currentText}]，跳過`);
        return; 
    }

    console.log(`      👆 點擊: ${optionName} (ID: ${optionValue})`);

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

    // 3. 執行點擊
    // 這裡我們不使用 waitForNavigation，而是用 "等待下一個選單有資料"
    try {
        await page.click(optionSelector);
    } catch(e) {
        // Fallback: JS Click
        await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if(el) el.click();
        }, optionSelector);
    }

    // 4. 等待數據更新 (這是最穩定的方法)
    // 只有當我們點擊 Region 或 District 時才需要等
    if (nextBox) {
        // console.log('      ⏳ 等待數據載入...');
        try {
            await page.waitForFunction(
                (bid) => {
                    const links = document.querySelectorAll(`${bid} ul li a`);
                    // 只要選項多於 1 個 (排除 "請選擇")，或者 cite 變回 "請選擇" (代表重置了)
                    return links.length > 1; 
                },
                { timeout: 10000 }, // 最多等 10 秒
                nextBox
            );
        } catch(e) {
            console.log('      ⚠️ 等待數據超時，假設已載入或無需載入');
        }
    } else {
        // 如果是最後一個 (Estate)，不需要等下一個 Dropdown，只需稍等刷新
        await new Promise(r => setTimeout(r, 1000));
    }
  };

  let results = [];

  console.log('⏳ 等待頁面初始化...');
  await page.waitForSelector(ID_REGION);

  // --- 1. Regions ---
  const regions = await getCustomOptions(ID_REGION);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
    console.log(`👉 [區域] ${r.t}`);
    
    // 選 Region，等待 District 更新
    await safeSelectOption(ID_REGION, ID_DISTRICT, r.t, r.v);

    // --- 2. Districts ---
    const districts = await getCustomOptions(ID_DISTRICT);
    // console.log(`   > ${districts.length} 個地區`);

    for (const d of districts) {
      // 選 District，等待 Estate 更新
      await safeSelectOption(ID_DISTRICT, ID_ESTATE, d.t, d.v);

      // --- 3. Estates ---
      const estates = await getCustomOptions(ID_ESTATE);
      console.log(`     🏠 ${d.t}: 找到 ${estates.length} 個屋苑`);

      for (const e of estates) {
        results.push({
          bank: 'dbs',
          region: r.t,
          district: d.t,
          name: e.t,
          value: e.v 
        });
      }
    }
  }

  const outFile = path.join(dataDir, 'dbs.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ DBS 完成！共 ${results.length} 筆資料已儲存至 ${outFile}`);

  await browser.close();
})();