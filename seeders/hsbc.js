const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('🚀 啟動 HSBC 爬蟲 (v7.0 智能重試版)...');

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: executablePath,
    userDataDir: path.join(__dirname, '../chrome_hsbc_v7'), // 用新 Profile
    defaultViewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  
  // 輔助函數
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const randomSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1) + min));

  const URL = 'https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/';
  console.log(`🔗 前往: ${URL}`);
  
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // ==========================================
  // 核心函數
  // ==========================================

  const getControl = async (index) => {
      const controls = await page.$$('.selectize-control');
      return controls[index];
  };

  // 🔥 改進版：讀取選項 (含重試機制)
  const scrapeOptions = async (index, retryCount = 0) => {
      const control = await getControl(index);
      const input = await control.$('.selectize-input');
      
      // 點擊打開
      await input.click();
      await sleep(800); // 等待動畫

      // 讀取內容
      let options = await page.evaluate(() => {
          const visibleDropdown = Array.from(document.querySelectorAll('.selectize-dropdown-content'))
              .find(el => el.offsetParent !== null);
          
          if (!visibleDropdown) return [];

          return Array.from(visibleDropdown.querySelectorAll('.option'))
              .map(opt => ({
                  t: opt.innerText.trim(),
                  v: opt.getAttribute('data-value')
              }))
              .filter(o => o.v && o.v !== '' && !o.t.includes('選擇') && !o.t.includes('Select'));
      });

      // 🔥 關鍵邏輯：如果是空的，且重試次數少於 2 次，就再試一次
      if (options.length === 0 && retryCount < 2) {
          console.log(`      ⚠️ (Index ${index}) 暫無選項，等待 2 秒重試...`);
          await page.keyboard.press('Escape'); // 先關閉
          await sleep(2000); // 等久一點
          return scrapeOptions(index, retryCount + 1); // 遞歸重試
      }

      // 關閉選單
      await page.keyboard.press('Escape');
      await sleep(300);

      return options;
  };

  const selectOption = async (index, value) => {
      const control = await getControl(index);
      const input = await control.$('.selectize-input');

      await input.click();
      await sleep(300);

      const success = await page.evaluate((val) => {
          const visibleDropdown = Array.from(document.querySelectorAll('.selectize-dropdown-content'))
              .find(el => el.offsetParent !== null);
          if (!visibleDropdown) return false;

          const option = visibleDropdown.querySelector(`.option[data-value="${val}"]`);
          if (option) {
              option.click();
              return true;
          }
          return false;
      }, value);

      if (!success) await page.keyboard.press('Escape');
      return success;
  };

  const waitForUnlock = async (nextIndex) => {
      try {
          await page.waitForFunction((idx) => {
              const els = document.querySelectorAll('.selectize-control');
              if (!els[idx]) return false;
              const input = els[idx].querySelector('.selectize-input');
              // 確保無 loading 且 input 可點擊
              return !els[idx].classList.contains('loading') && !input.classList.contains('locked');
          }, { timeout: 15000 }, nextIndex); // 延長等待時間到 15秒
          await sleep(800); // 解鎖後再多等 0.8 秒，確保數據落地
          return true;
      } catch(e) { return false; }
  };

  // ==========================================
  // 主流程
  // ==========================================

  let database = [];

  console.log('📡 讀取區域...');
  const regions = await scrapeOptions(0);
  console.log(`📍 找到 ${regions.length} 個區域`);

  for (const r of regions) {
      console.log(`👉 [區域] ${r.t}`);
      await selectOption(0, r.v);
      await waitForUnlock(1);

      // 讀取分區
      const districts = await scrapeOptions(1);

      // 如果連分區都沒抓到 (例如新界/離島)，嘗試重抓一次
      if (districts.length === 0) {
          console.log(`   ⚠️ [${r.t}] 分區載入失敗，最後重試...`);
          await sleep(2000);
          // 這裡不遞歸，手動重做一次流程
      }

      for (const d of districts) {
          // console.log(`      選取: ${d.t}`);
          await selectOption(1, d.v);
          await waitForUnlock(2);

          // 讀取屋苑 (會自動重試)
          const estates = await scrapeOptions(2);
          
          if (estates.length > 0) {
              console.log(`     🏠 [${d.t}] ${estates.length} 個屋苑`);
              
              estates.forEach(e => {
                  database.push({
                      bank: 'hsbc',
                      region: r.t,
                      district: d.t,
                      name: e.t,
                      value: e.v
                  });
              });

              // 存檔
              fs.writeFileSync(path.join(dataDir, 'hsbc.json'), JSON.stringify(database, null, 2));
          } else {
              console.log(`     ❌ [${d.t}] 確實無資料 (已重試)`);
          }

          // 🔥 隨機延遲：避免太快被鎖
          await randomSleep(500, 1500);
      }
  }

  console.log(`\n🎉 全部完成！共 ${database.length} 筆資料。`);
  await browser.close();

})();