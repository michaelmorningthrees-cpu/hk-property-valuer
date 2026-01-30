const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('🚀 啟動 HSBC 補漏爬蟲 (保留原名斜線版)...');

  // 🎯 設定目標地區關鍵字
  // 邏輯說明：
  // 只要選單名稱含有 '黃大仙'，程式就會把整個 "黃大仙/橫頭磡" 存入 JSON
  // 只要選單名稱含有 '深井'，程式就會把整個 "深井/青龍頭" 存入 JSON
  const targetKeywords = [
      '山頂',       
      '土瓜灣',     
      '黃大仙',     // 對應 [九龍] 黃大仙/橫頭磡
      '葵涌',       
      '荔景',       
      '深井',       // 對應 [新界/離島] 深井/青龍頭
      '沙田',       
      '上水',       
      '大埔',       
      '將軍澳'      
  ];

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false, // 開啟瀏覽器以便監控
    defaultViewport: null,
    protocolTimeout: 0, 
    slowMo: 50,      
    args: [
        '--start-maximized', 
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  
  // 資源攔截 (加速載入，不載圖片字體)
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const URL = 'https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/';
  
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  // ==========================================
  // 核心函數
  // ==========================================

  const getSelectizeControls = async () => {
      return await page.$$('.selectize-control');
  };

  const waitForUnlock = async (index) => {
      try {
          await page.waitForFunction((idx) => {
              const controls = document.querySelectorAll('.selectize-control');
              const target = controls[idx];
              if (!target) return false;
              const isLoading = target.classList.contains('loading');
              const input = target.querySelector('.selectize-input');
              const isLocked = input && input.classList.contains('locked');
              // 確保不是 disabled
              const isDisabled = input && input.classList.contains('disabled');
              return !isLoading && !isLocked && !isDisabled;
          }, { timeout: 15000 }, index); 
          await sleep(200);
          return true;
      } catch (e) { return false; }
  };

  const scrapeOptions = async (index) => {
      const controls = await getSelectizeControls();
      const target = controls[index];
      if (!target) return [];

      const input = await target.$('.selectize-input');
      try { await input.click(); } catch(e) {}
      await sleep(500); 

      const options = await page.evaluate(() => {
          const dropdowns = Array.from(document.querySelectorAll('.selectize-dropdown-content'));
          const visibleDropdown = dropdowns.find(el => el.offsetParent !== null);
          if (!visibleDropdown) return [];
          
          return Array.from(visibleDropdown.querySelectorAll('.option'))
              .map(opt => ({
                  t: opt.innerText.trim(), // 👈 這裡直接取 innerText，保留 "黃大仙/橫頭磡" 原樣
                  v: opt.getAttribute('data-value')
              }))
              .filter(o => o.v && o.v !== '' && !o.t.includes('選擇') && !o.t.includes('Select'));
      });

      await page.keyboard.press('Escape');
      await sleep(300);
      return options;
  };

  const selectOption = async (index, value) => {
      const controls = await getSelectizeControls();
      if (!controls[index]) return false;
      
      const input = await controls[index].$('.selectize-input');
      await input.click();
      await sleep(300);

      const success = await page.evaluate((val) => {
          const dropdowns = Array.from(document.querySelectorAll('.selectize-dropdown-content'));
          const visibleDropdown = dropdowns.find(el => el.offsetParent !== null);
          if (!visibleDropdown) return false;
          const option = visibleDropdown.querySelector(`.option[data-value="${val}"]`);
          if (option) { option.click(); return true; }
          return false;
      }, value);

      if (!success) await page.keyboard.press('Escape');
      await sleep(500); 
      return success;
  };

  // ==========================================
  // 主流程
  // ==========================================

  let results = [];

  console.log('📡 讀取區域...');
  await waitForUnlock(0);
  const regions = await scrapeOptions(0);

  for (const r of regions) {
      // 這裡不需過濾大區域，因為目標分佈在港九新界
      await selectOption(0, r.v);
      await waitForUnlock(1);

      const districts = await scrapeOptions(1);

      for (const d of districts) {
          if (d.v === 'ALL') continue;

          // 🛑 核心過濾器：檢查 d.t (顯示名稱) 是否包含我們的關鍵字
          const isTarget = targetKeywords.some(keyword => d.t.includes(keyword));

          if (!isTarget) {
             continue;
          }
          
          console.log(`🎯 [命中目標] 抓取: ${d.t} (保留原名)`);

          // 刷新頁面保平安 (針對沙田等大區)
          await page.reload({ waitUntil: 'domcontentloaded' });
          await sleep(2000);
          
          // 重新導航
          await waitForUnlock(0);
          await selectOption(0, r.v);
          await waitForUnlock(1);

          console.log(`   👉 進入分區: ${d.t}`);
          await selectOption(1, d.v);
          await waitForUnlock(2);

          const estates = await scrapeOptions(2);
          console.log(`      🏠 發現 ${estates.length} 個屋苑`);

          for (let i = 0; i < estates.length; i++) {
              const e = estates[i];
              try {
                  const selected = await selectOption(2, e.v);
                  if (!selected) {
                      console.log(`      ⚠️ 無法選取: ${e.t}`);
                      continue;
                  }
                  
                  // 等待座數
                  const hasBlocks = await waitForUnlock(3);
                  let blocks = [];
                  if (hasBlocks) {
                      blocks = await scrapeOptions(3);
                  }

                  if (blocks.length > 0) {
                      for (const b of blocks) {
                          results.push({
                              bank: 'hsbc',
                              region: r.t,
                              district: d.t, // 👈 這裡存入的就是 "黃大仙/橫頭磡"，原汁原味
                              name: e.t,
                              value: e.v,
                              block: b.t,
                              block_value: b.v
                          });
                      }
                  } else {
                      results.push({
                          bank: 'hsbc',
                          region: r.t,
                          district: d.t, // 👈 同上
                          name: e.t,
                          value: e.v,
                          block: null,
                          block_value: null
                      });
                  }
                  
                  if (i % 50 === 0 && i > 0) process.stdout.write(` [${i}/${estates.length}] `);
                  else process.stdout.write(`.`); 

              } catch (err) {
                  console.log(`\n      ❌ 錯誤: ${e.t}`);
                  await page.keyboard.press('Escape');
              }
          }
          console.log(`\n      ✅ ${d.t} 完成！`);
      }
  }

  // 最終儲存
  const outFile = path.join(dataDir, 'hsbc_missing_districts.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n🎉 補漏完成！數據已儲存至 ${outFile}`);
  
  await browser.close();

})();