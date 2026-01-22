const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 啟動 Citibank 爬蟲 (屋苑 + 座數版)...');
  
  // 1. 建立 data 資料夾
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // 偽裝成普通瀏覽器
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // 2. 前往網址
  const URL = 'https://www.citibank.com.hk/acquisition/mortgage/index.html?locale=zh_HK';
  console.log(`🔗 前往網站...`);
  
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log('⚠️ 導航超時，但嘗試繼續執行...');
  }

  // 3. 手動等待頁面初始化
  console.log('⏳ 等待 5 秒讓頁面初始化...');
  await new Promise(r => setTimeout(r, 5000));

  // 定義 Selectors
  const SEL_REGION   = '#zone';
  const SEL_DISTRICT = '#district';
  const SEL_ESTATE   = '#estName';
  const SEL_BLOCK    = '#bckBuilding'; // Citi 常用的座數 ID

  // Helper: 獲取 Dropdown 選項
  const getOptions = async (selector) => {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el || el.disabled) return [];
      return Array.from(el.options)
        .filter(o => o.value && o.value.trim() !== "" && !o.disabled && !o.innerText.includes('請選擇') && !o.innerText.includes('Select'))
        .map(o => ({t: o.innerText.trim(), v: o.value}));
    }, selector);
  };

  let results = [];

  // 1. 等待 #zone 出現
  try {
    await page.waitForSelector(SEL_REGION, { visible: true, timeout: 15000 });
  } catch (e) {
    console.error('❌ 找不到 #zone。');
    await browser.close();
    return;
  }

  // --- 開始爬取 ---
  const regions = await getOptions(SEL_REGION);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
    // 1. 選區域
    await page.select(SEL_REGION, r.v);
    await new Promise(res => setTimeout(res, 1000)); 

    const districts = await getOptions(SEL_DISTRICT);
    
    for (const d of districts) {
      if (d.t.includes('請選擇') || d.t.includes('Select')) continue;

      // 2. 選地區
      await page.select(SEL_DISTRICT, d.v);
      await new Promise(res => setTimeout(res, 1500)); 

      const estates = await getOptions(SEL_ESTATE);
      console.log(`   🏠 [${d.t}] 正在處理 ${estates.length} 個屋苑...`);

      for (const e of estates) {
         if (e.t.includes('請選擇') || e.t.includes('Select')) continue;
         
         // 3. 選屋苑 (重要：選了才會加載座數)
         await page.select(SEL_ESTATE, e.v);
         
         // ⏳ 等待座數 API 回傳 (稍為加長等待時間以保險)
         await new Promise(res => setTimeout(res, 2000)); 

         // 4. 獲取座數
         const blocks = await getOptions(SEL_BLOCK);

         if (blocks.length > 0) {
             // 情況 A: 有座數 (存入座數名及 ID)
             for (const b of blocks) {
                 results.push({
                    bank: 'citi',
                    region: r.t,
                    district: d.t,
                    name: e.t,       // 屋苑名
                    value: e.v,      // 屋苑 ID
                    block: b.t,      // 座數名
                    block_value: b.v // 座數 ID (供 scraper.js 直接使用)
                 });
             }
         } else {
             // 情況 B: 無座數 (獨立屋/單幢)，Block 欄位留空
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
    }
  }

  // 存檔 (這裡改回 citi.json)
  const outFile = path.join(dataDir, 'citi.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ 成功！共 ${results.length} 筆資料已儲存至 ${outFile}`);

  await browser.close();
})();