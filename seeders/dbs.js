const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

(async () => {
  console.log('🚀 啟動 DBS 爬蟲 (v13.0 ID自動修正 + 直讀版)...');

  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    slowMo: 30,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900']
  });
  
  const page = await browser.newPage();
  
  // 資源攔截
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'font', 'media', 'stylesheet'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const URL = 'https://evalhk.cushmanwakefield.com.hk/e-valuation/DBSV2/Home/Index/cn';
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // 固定的 Selectors
  const ID_REGION   = '#divselect_area';
  const ID_DISTRICT = '#divselect_dist';
  const ID_ESTATE   = '#divselect_est';
  
  // 🔥 動態 Selectors (稍後由 detectBlockSelector 決定)
  let ID_BLOCK = '#divselect_bldg'; 
  let INPUT_BLOCK = '#inputselect_bldg';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // --- Helpers ---

  // 🔥 關鍵 Helper: 檢查到底是用 _bldg 還是 _block
  const detectBlockSelector = async () => {
      // 嘗試找 divselect_block (你截圖顯示的那個)
      const hasBlock = await page.$('#divselect_block');
      if (hasBlock) {
          // console.log('      🔍 偵測到 ID 模式: #divselect_block');
          return { box: '#divselect_block', input: '#inputselect_block' };
      }
      
      // 默認回傳 divselect_bldg
      // console.log('      🔍 偵測到 ID 模式: #divselect_bldg');
      return { box: '#divselect_bldg', input: '#inputselect_bldg' };
  };

  const getOptions = async (boxId) => {
    return page.evaluate((bid) => {
      const container = document.querySelector(bid);
      if (!container) return [];
      return Array.from(container.querySelectorAll('ul li a'))
        .map(a => ({
          t: a.innerText.trim(),
          v: a.getAttribute('selectid')
        }))
        .filter(o => o.v && o.v !== '0' && !o.t.includes('請選擇') && !o.t.includes('Loading'));
    }, boxId);
  };

  const safeClick = async (selector) => {
      await page.evaluate((s) => {
          const el = document.querySelector(s);
          if (el) {
              el.click();
              el.dispatchEvent(new Event('change', { bubbles: true }));
          }
      }, selector);
      await sleep(300);
  };

  const selectItem = async (boxId, value) => {
      await safeClick(`${boxId} cite`); 
      await sleep(200);
      const itemSelector = `${boxId} ul li a[selectid="${value}"]`;
      await safeClick(itemSelector);
      await sleep(500);
  };

  // 🔥 v13 核心：混合策略 (Hidden Input + Dropdown List)
  const extractBlocksSmart = async (estateName, estateValue) => {
      let attempts = 0;
      const maxRetries = 3; 

      while (attempts < maxRetries) {
          
          // 1. 每一次都要重新偵測 ID (以防轉屋苑時 ID 變了)
          const selectors = await detectBlockSelector();
          ID_BLOCK = selectors.box;
          INPUT_BLOCK = selectors.input;

          // 2. 🔥 策略 A: 檢查是否已經自動選中 (Hidden Input)
          // 這就是解決 Casa 880 的關鍵：直接讀截圖裡的 value="10512"
          const autoData = await page.evaluate((boxId, inputId) => {
              const cite = document.querySelector(`${boxId} cite`);
              const input = document.querySelector(inputId);
              
              const text = cite ? cite.innerText.trim() : '';
              const val = input ? input.value : '';

              // 如果文字不是 "請選擇"，且 Value 有野
              if (text && !text.includes('請選擇') && !text.includes('Select') && val && val !== '0') {
                  return [{ t: text, v: val }];
              }
              return null;
          }, ID_BLOCK, INPUT_BLOCK);

          if (autoData) {
              // console.log(`      🚀 [${estateName}] 自動選中 (Auto-filled): ${autoData[0].t}`);
              return autoData;
          }

          // 3. 策略 B: 嘗試打開列表讀取 (針對多座數屋苑)
          // 只有當上面策略 A 失敗 (即係仲係 "請選擇") 先會做呢步
          await safeClick(`${ID_BLOCK} cite`);
          
          let waitTime = 0;
          while (waitTime < 5) {
              const blocks = await getOptions(ID_BLOCK);
              if (blocks.length > 0) {
                  await safeClick(`${ID_BLOCK} cite`); // 關閉
                  return blocks;
              }
              await sleep(500);
              waitTime++;
          }

          // console.log(`      ⚠️ [${estateName}] 暫無資料，重試...`);
          
          // 重試：點擊屋苑刷新
          await safeClick(`${ID_ESTATE} cite`);
          await sleep(200);
          
          // 選回正確屋苑
          const itemSelector = `${ID_ESTATE} ul li a[selectid="${estateValue}"]`;
          await safeClick(itemSelector);
          await sleep(1500); // 等待刷新
          
          attempts++;
      }

      console.log(`      ❌ [${estateName}] 真係無資料 (ID: ${ID_BLOCK})`);
      return []; 
  };

  // --- 主流程 ---
  
  let results = [];
  console.log('📍 讀取區域...');
  
  const regions = await getOptions(ID_REGION);
  
  for (const r of regions) {
      console.log(`👉 [區域] ${r.t}`);
      await selectItem(ID_REGION, r.v);

      const districts = await getOptions(ID_DISTRICT);

      for (const d of districts) {
          if (d.t.includes('請選擇')) continue;
          
          await selectItem(ID_DISTRICT, d.v);

          const estates = await getOptions(ID_ESTATE);
          console.log(`   🏠 [${d.t}] 處理 ${estates.length} 個屋苑...`);

          for (const e of estates) {
              await selectItem(ID_ESTATE, e.v);

              // 執行 v13 智能讀取
              const blocks = await extractBlocksSmart(e.t, e.v);

              if (blocks.length > 0) {
                  for (const b of blocks) {
                      results.push({
                          bank: 'dbs',
                          region: r.t,
                          district: d.t,
                          name: e.t,
                          value: e.v,
                          block: b.t,
                          block_value: b.v
                      });
                  }
              } else {
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
          // Temp Save
          fs.writeFileSync(path.join(dataDir, 'dbs_temp.json'), JSON.stringify(results, null, 2));
      }
  }

  fs.writeFileSync(path.join(dataDir, 'dbs.json'), JSON.stringify(results, null, 2));
  console.log(`\n🎉 完成！共 ${results.length} 筆。`);
  
  await browser.close();

})();