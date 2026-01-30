const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 啟動 Citibank 爬蟲 (智能等待版)...');
  
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  const browser = await puppeteer.launch({ 
    headless: false, // 建議保持 false 以便除錯，穩定後可改 true
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const URL = 'https://www.citibank.com.hk/acquisition/mortgage/index.html?locale=zh_HK';
  console.log(`🔗 前往網站...`);
  
  try {
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  } catch (e) {
    console.log('⚠️ 導航超時，嘗試繼續...');
  }

  // Helper: 隨機延遲 (模擬人類操作，避免被封)
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const randomSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1) + min));

  // 定義 Selectors
  const SEL_REGION   = '#zone';
  const SEL_DISTRICT = '#district';
  const SEL_ESTATE   = '#estName';
  const SEL_BLOCK    = '#bckBuilding';

  // Helper: 獲取 Dropdown 選項
  const getOptions = async (selector) => {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el || el.disabled) return [];
      return Array.from(el.options)
        .filter(o => o.value && o.value.trim() !== "" && !o.disabled && !o.innerText.includes('Select') && !o.innerText.includes('請選擇'))
        .map(o => ({t: o.innerText.trim(), v: o.value}));
    }, selector);
  };

  let results = [];

  // 等待區域選單出現
  try {
    await page.waitForSelector(SEL_REGION, { visible: true, timeout: 20000 });
  } catch (e) {
    console.error('❌ 頁面加載失敗，找不到區域選單');
    await browser.close();
    return;
  }

  // --- 開始爬取 ---
  const regions = await getOptions(SEL_REGION);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
    console.log(`🔻 進入區域: ${r.t}`);
    await page.select(SEL_REGION, r.v);
    await randomSleep(500, 1000); // 稍微等待 API 觸發

    // 等待 District 載入完成 (直到有選項)
    await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        return el && !el.disabled && el.options.length > 1;
    }, { timeout: 5000 }, SEL_DISTRICT).catch(() => {});

    const districts = await getOptions(SEL_DISTRICT);
    
    for (const d of districts) {
      // 排除預設選項
      if (d.t.includes('請選擇') || d.t.includes('Select')) continue;

      // 2. 選地區
      await page.select(SEL_DISTRICT, d.v);
      await randomSleep(300, 600);

      // 等待 Estate 載入完成
      await page.waitForFunction((sel) => {
          const el = document.querySelector(sel);
          return el && !el.disabled && el.options.length > 1;
      }, { timeout: 5000 }, SEL_ESTATE).catch(() => {});

      const estates = await getOptions(SEL_ESTATE);
      console.log(`   🏠 [${d.t}] 正在處理 ${estates.length} 個屋苑...`);

      for (const e of estates) {
         if (e.t.includes('請選擇') || e.t.includes('Select')) continue;
         
         // 3. 選屋苑
         await page.select(SEL_ESTATE, e.v);
         
         // 🔥【關鍵優化】不再死等 2 秒，而是監聽座數選單的變化
         // 邏輯：等待座數選單 (SEL_BLOCK) 變為 Enabled 且選項數量 > 1
         // 如果 4 秒內沒反應，我們才假設它是獨立屋 (無座數)
         let hasBlocks = false;
         try {
             await page.waitForFunction((sel) => {
                 const el = document.querySelector(sel);
                 // 條件：元素存在 + 未禁用 + 選項大於1 (因為通常有一個 "Select Block" 預設值)
                 return el && !el.disabled && el.options.length > 1;
             }, { timeout: 4000 }, SEL_BLOCK); // 設定 4 秒超時，API 慢的時候這很有用
             hasBlocks = true;
         } catch (err) {
             // 超時代表可能真的沒有座數，或者該屋苑只有一期/一座
             hasBlocks = false;
         }

         // 給一點緩衝讓 DOM 渲染完畢
         if(hasBlocks) await randomSleep(100, 300);

         // 4. 獲取座數
         const blocks = await getOptions(SEL_BLOCK);

         if (blocks.length > 0) {
             // 情況 A: 有座數
             // console.log(`      ✅ 抓到 ${blocks.length} 座`);
             for (const b of blocks) {
                 results.push({
                    bank: 'citi',
                    region: r.t,
                    district: d.t,
                    name: e.t,
                    value: e.v,
                    block: b.t,
                    block_value: b.v
                 });
             }
         } else {
             // 情況 B: 無座數 (獨立屋/單幢)
            //  console.log(`      ⚠️ 無座數 (可能是單幢/洋房)`);
             results.push({
                bank: 'citi',
                region: r.t,
                district: d.t,
                name: e.t,
                value: e.v,
                block: null,
                block_value: null
             });
         }
      }
      
      // 每處理完一個地區，存一次檔 (避免崩潰全白費)
      const tempFile = path.join(dataDir, 'citi_temp.json');
      fs.writeFileSync(tempFile, JSON.stringify(results, null, 2));
    }
  }

  // 最終存檔
  const outFile = path.join(dataDir, 'citi.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ 成功！共 ${results.length} 筆資料已儲存至 ${outFile}`);

  await browser.close();
})();