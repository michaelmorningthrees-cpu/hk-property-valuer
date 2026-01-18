const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 啟動 Citibank 爬蟲 (最終穩定版)...');
  
  // 1. 建立 data 資料夾
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // 偽裝成普通瀏覽器 (非常重要，避免被銀行判定為機器人)
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // 2. 前往網址
  const URL = 'https://www.citibank.com.hk/acquisition/mortgage/index.html?locale=zh_HK';
  console.log(`🔗 前往網站...`);
  
  // 修改點：改用 'domcontentloaded'，只要 HTML 讀完就即刻當成功，唔癡癡地等
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log('⚠️ 導航超時，但嘗試繼續執行...');
  }

  // 3. 手動等待頁面 JavaScript 初始化 (Angular 需要時間 render)
  console.log('⏳ 等待 5 秒讓頁面初始化...');
  await new Promise(r => setTimeout(r, 5000));

  // 根據你截圖的正確 IDs
  const SEL_REGION   = '#zone';
  const SEL_DISTRICT = '#district';
  const SEL_ESTATE   = '#estName';

  console.log('🕵️ 搜尋區域選單...');
  
  // 等待 #zone 出現
  try {
    await page.waitForSelector(SEL_REGION, { visible: true, timeout: 15000 });
  } catch (e) {
    console.error('❌ 找不到 #zone。正在截圖 debug_error.png ...');
    await page.screenshot({ path: 'debug_error.png' });
    console.log('請查看 debug_error.png 看看畫面停在哪裡');
    await browser.close();
    return;
  }

  let results = [];

  // Helper: 獲取 Dropdown 選項
  const getOptions = async (selector) => {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return [];
      return Array.from(el.options)
        .filter(o => o.value && o.value.trim() !== "" && !o.disabled)
        .map(o => ({t: o.innerText.trim(), v: o.value}));
    }, selector);
  };

  // --- 開始爬取 ---
  const regions = await getOptions(SEL_REGION);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
    console.log(`👉 [區域] ${r.t}`);
    
    // 1. 選區域
    await page.select(SEL_REGION, r.v);
    await new Promise(res => setTimeout(res, 1000)); // 等待 District API

    // 2. 選地區
    // 重新獲取 District 選項 (因為選了 Region 內容會變)
    const districts = await getOptions(SEL_DISTRICT);
    
    for (const d of districts) {
      // 跳過 "請選擇" (如果有)
      if (d.t.includes('請選擇') || d.t.includes('Select')) continue;

      // console.log(`   > [地區] ${d.t}`);
      await page.select(SEL_DISTRICT, d.v);
      await new Promise(res => setTimeout(res, 1500)); // 等待 Estate API

      // 3. 獲取屋苑
      const estates = await getOptions(SEL_ESTATE);
      console.log(`     🏠 ${d.t}: 找到 ${estates.length} 個屋苑`);

      for (const e of estates) {
         if (e.t.includes('請選擇') || e.t.includes('Select')) continue;
         
         results.push({
          bank: 'citi',
          region: r.t,
          district: d.t,
          name: e.t,
          value: e.v 
        });
      }
    }
  }

  // 存檔
  const outFile = path.join(dataDir, 'citi.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ 成功！共 ${results.length} 筆資料已儲存至 ${outFile}`);

  await browser.close();
})();