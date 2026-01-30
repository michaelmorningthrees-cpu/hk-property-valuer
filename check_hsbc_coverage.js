const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('🔍 正在啟動 HSBC 覆蓋率檢查器...');

  // 1. 載入現有數據
  const jsonPath = path.join(__dirname, 'data/hsbc.json');
  let existingData = [];
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    existingData = JSON.parse(raw);
  } catch (e) {
    console.error('❌ 無法讀取 data/hsbc.json，請確保檔案存在。');
    return;
  }

  // 2. 整理現有數據結構 (Set 格式: "區域|分區")
  const localMap = new Set();
  existingData.forEach(item => {
    if (item.region && item.district) {
      localMap.add(`${item.region.trim()}|${item.district.trim()}`);
    }
  });

  console.log(`📂 本地數據庫包含: ${localMap.size} 個分區組合`);

  // 3. 啟動瀏覽器讀取官網目錄
  const browser = await puppeteer.launch({
    headless: false, // 開啟視窗以便觀察
    args: ['--start-maximized']
  });
  const page = await browser.newPage();
  
  // 攔截圖片加快速度
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'media', 'font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  console.log('🌐 前往 HSBC 網站讀取最新目錄...');
  await page.goto('https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  // 等待選單載入
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(3000); 

  // Helper: 讀取 Selectize 選項
  const getOptions = async (index) => {
      // 點擊打開下拉
      const controls = await page.$$('.selectize-control');
      if (!controls[index]) return [];
      const input = await controls[index].$('.selectize-input');
      await input.click();
      await sleep(500);

      // 讀取內容
      const opts = await page.evaluate(() => {
          const dropdowns = Array.from(document.querySelectorAll('.selectize-dropdown-content'));
          const visible = dropdowns.find(d => d.offsetParent !== null);
          if (!visible) return [];
          return Array.from(visible.querySelectorAll('.option'))
              .map(o => ({ 
                  t: o.innerText.trim(), 
                  v: o.getAttribute('data-value') 
              }))
              .filter(o => o.v && !o.t.includes('請選擇') && !o.t.includes('Select'));
      });
      
      // 關閉下拉
      await page.keyboard.press('Escape');
      await sleep(200);
      return opts;
  };

  // 4. 開始掃描官網架構
  console.log('\n📊 開始比對...');
  const missingDistricts = [];
  const webRegions = await getOptions(0); // 區域

  for (const r of webRegions) {
      console.log(`\n👉 檢查區域: [${r.t}]`);
      
      // 網頁選擇該區域
      const controls = await page.$$('.selectize-control');
      await controls[0].$('.selectize-input').then(el => el.click());
      await sleep(300);
      
      // 點選對應 Region ID
      await page.evaluate((val) => {
          const dd = document.querySelectorAll('.selectize-dropdown-content')[0]; // Region dropdown is usually first
          const opt = dd.querySelector(`.option[data-value="${val}"]`);
          if (opt) opt.click();
      }, r.v);

      await sleep(1500); // 等待分區載入 (重要)

      // 獲取該區域下的分區
      const webDistricts = await getOptions(1); // 分區

      for (const d of webDistricts) {
          if (d.v === 'ALL') continue;

          const key = `${r.t}|${d.t}`;
          const exists = localMap.has(key);
          
          if (exists) {
              console.log(`   ✅ 已有: ${d.t}`);
          } else {
              console.log(`   ❌ 缺失: ${d.t} !!!`);
              missingDistricts.push({ region: r.t, district: d.t });
          }
      }
  }

  // 5. 總結報告
  console.log('\n=============================================');
  console.log('📉 缺失地區報告 (Missing Districts Report)');
  console.log('=============================================');
  
  if (missingDistricts.length === 0) {
      console.log('🎉 恭喜！你的數據庫非常完整，沒有缺失任何地區。');
  } else {
      console.log(`⚠️ 發現 ${missingDistricts.length} 個缺失地區：`);
      missingDistricts.forEach(m => {
          console.log(`- [${m.region}] ${m.district}`);
      });
      console.log('\n💡 建議：請使用 Scraper 針對以上地區進行補抓。');
  }

  await browser.close();
})();