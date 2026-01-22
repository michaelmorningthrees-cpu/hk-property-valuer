require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
const isCIEnv = !!process.env.CI || !!process.env.GITHUB_ACTIONS;
const loadJson = (relativePath) => {
  try {
    const fullPath = path.join(__dirname, relativePath);
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  } catch (e) {
    console.warn(`⚠️ [Data] 無法載入 ${relativePath}: ${e.message}`);
    return [];
  }
};

const CITI_DATA = loadJson('data/citi.json');
const DBS_DATA = loadJson('data/dbs.json');
const HASE_DATA = loadJson('data/hangseng.json');
const HSBC_DATA = loadJson('data/hsbc.json'); // <--- 新增這一行 (請確保 data/hsbc.json 存在)
let openccConverter = null;
let openccWarned = false;
try {
  const OpenCC = require('opencc-js');
  if (OpenCC && OpenCC.Converter) {
    openccConverter = OpenCC.Converter({ from: 'cn', to: 'hk' });
  }
} catch (e) {
  openccConverter = null;
}

// ==========================================
// 1. 地址解析工具函數
// ==========================================

const englishDistrictAliases = {
  'tuen mun': '屯門', 'yuen long': '元朗', 'fanling': '粉嶺', 'sheung shui': '上水',
  'tai po': '大埔', 'sha tin': '沙田', 'ma on shan': '馬鞍山', 'tseung kwan o': '將軍澳',
  'sai kung': '西貢', 'tsuen wan': '荃灣', 'kwai chung': '葵涌', 'tsing yi': '青衣',
  'lantau': '離島', 'tsim sha tsui': '尖沙咀', 'yau ma tei': '油麻地', 'mong kok': '旺角',
  'sham shui po': '深水埗', 'cheung sha wan': '長沙灣', 'kowloon city': '九龍城',
  'ho man tin': '何文田', 'wong tai sin': '黃大仙', 'san po kong': '新蒲崗',
  'kwun tong': '觀塘', 'lam tin': '藍田', 'central': '中環', 'sheung wan': '上環',
  'sai wan': '西環', 'wan chai': '灣仔', 'causeway bay': '銅鑼灣', 'north point': '北角',
  'quarry bay': '鰂魚涌', 'tai koo': '太古', 'chai wan': '柴灣', 'aberdeen': '香港仔',
  'pok fu lam': '薄扶林',
};

const simplifiedToTraditional = {
  '台': '臺', '广': '廣', '东': '東', '关': '關', '门': '門', '湾': '灣',
  '岛': '島', '区': '區', '龙': '龍', '马': '馬', '里': '里', '楼': '樓',
  '层': '層', '栋': '棟', '园': '園', '厦': '廈',
};

function toTraditional(text) {
  if (text === null || text === undefined) return '';
  const rawText = String(text);
  let result = rawText;
  if (openccConverter) {
    try {
      result = openccConverter(rawText);
    } catch (e) {
      // ignore
    }
  } else if (!openccWarned) {
    console.warn('⚠️ [Address] opencc-js 未安裝，改用簡單字表轉換。');
    openccWarned = true;
  }

  const map = { '蓝': '藍', '湾': '灣', '邨': '村', '号': '號', '楼': '樓', '层': '層', '座': '座','悦': '悅', '汇': '滙','峰': '峯','柏': '柏'};
  result = result.replace(/./g, char => map[char] || char);

  return result.replace(/東湧/g, '東涌');
}

function normalizeAddress(address) {
  if (address === null || address === undefined) return '';
  let normalized = toTraditional(address).toLowerCase();
  for (const [alias, zh] of Object.entries(englishDistrictAliases)) {
    if (normalized.includes(alias)) {
      normalized = normalized.replace(new RegExp(alias, 'g'), zh);
    }
  }
  normalized = normalized.replace(/[台广东关门湾岛区龙马里楼层栋园厦]/g, (ch) => simplifiedToTraditional[ch] || ch);
  return normalized;
}

function parseAddress(rawString) {
  if (!rawString) return { district: '', estate: '', block: '', floor: '', unit: '' };
  const raw = toTraditional(String(rawString)).replace(/\s+/g, '');
  const districtMatch = (() => {
    const allDistricts = Object.values(BANK_DISTRICT_MAP).flat();
    const sorted = allDistricts.sort((a, b) => b.length - a.length);
    return sorted.find(d => raw.startsWith(d)) || null;
  })();

  let district = districtMatch || '';
  let remainder = district ? raw.slice(district.length) : raw;

  let block = '';
  let floor = '';
  let unit = '';
  const blockMatch = remainder.match(/(\d+)\s*座/);
  if (blockMatch) block = blockMatch[1];
  const floorMatch = remainder.match(/(\d+)\s*(樓|層|\/?F)/);
  if (floorMatch) floor = floorMatch[1];
  const unitMatch = remainder.match(/([A-Z]?\d{0,4})\s*室/i);
  if (unitMatch) unit = unitMatch[1];
  const compactMatch = remainder.match(/(\d+)\s*([A-Z]\d{0,4})/i);
  if (!floor && compactMatch) floor = compactMatch[1];
  if (!unit && compactMatch) unit = compactMatch[2];

  const estateMatch = remainder.match(/^([A-Za-z一-龥0-9\-]+?)(?=\d|座|樓|層|室|$)/);
  const estate = estateMatch ? estateMatch[1] : remainder;

  return {
    district,
    estate,
    block,
    floor,
    unit
  };
}

function scoreTextSimple(target, candidate) {
  const normalize = (s) => toTraditional(String(s || ''))
    .replace(/\s+/g, '')
    .replace(/[座期苑樓室層棟]/g, '')
    .toUpperCase();
  const t = normalize(target);
  const c = normalize(candidate);
  if (!t || !c) return 0;
  if (t === c) return 999;
  if (c.startsWith(t) || t.startsWith(c)) return 200 + Math.min(t.length, c.length);
  if (c.includes(t) || t.includes(c)) return 150 + Math.min(t.length, c.length);
  const tSet = new Set(t.split(''));
  let matchCount = 0;
  for (const ch of c) if (tSet.has(ch)) matchCount += 1;
  return (matchCount / Math.max(t.length, c.length)) * 100;
}

function pickBestEstate(data, estateName) {
  if (!estateName || data.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const item of data) {
    const score = scoreTextSimple(estateName, item.name);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 80 ? best : null;
}

function mapToBankData(propertyData) {
  const district = toTraditional(propertyData.district || '');
  const estate = toTraditional(propertyData.estate || '');
  const bankDistrict = mapDistrictToBankOption(district);

  // 1. 篩選候選名單
  const citiCandidates = CITI_DATA.filter(item =>
    (!bankDistrict?.district || item.district === bankDistrict.district)
  );
  const dbsCandidates = DBS_DATA.filter(item =>
    (!bankDistrict?.district || item.district === bankDistrict.district)
  );
  const haseCandidates = HASE_DATA; 
  
  // ✨ HSBC 篩選: 簡單過濾分區 (如果 JSON 資料量大，這步很重要)
  // 如果找不到對應分區，則回退到搜尋全部 (避免分區寫法不同導致漏找)
  let hsbcCandidates = HSBC_DATA.filter(item => item.district === district);
  if (hsbcCandidates.length === 0) hsbcCandidates = HSBC_DATA;

  // 2. 挑選最佳屋苑 (Fuzzy Match)
  const citiEstate = pickBestEstate(citiCandidates, estate);
  const dbsEstate = pickBestEstate(dbsCandidates, estate);
  const haseEstate = pickBestEstate(haseCandidates, estate);
  const hsbcEstate = pickBestEstate(hsbcCandidates, estate); // ✨ 匹配 HSBC

  return {
    citi: {
      region: bankDistrict?.region,
      district: bankDistrict?.district || district,
      estate: citiEstate?.name || estate,
      estateValue: citiEstate?.value || null
    },
    dbs: {
      region: bankDistrict?.region,
      district: bankDistrict?.district || district,
      estate: dbsEstate?.name || estate,
      estateValue: dbsEstate?.value || null
    },
    hase: {
      estate: haseEstate?.name || estate,
      estateValue: propertyData.estateId || haseEstate?.value || null
    },
    // ✨ 新增 HSBC 映射結果
    hsbc: {
      region: hsbcEstate?.region || null,
      district: hsbcEstate?.district || null,
      estate: hsbcEstate?.name || estate,
      estateValue: hsbcEstate?.value || null // 這就是 JSON 裡的 "2680" 這類 ID
    }
  };
}

const districtToRegion = {
  '新界': ['東涌', '屯門', '元朗', '粉嶺', '上水', '大埔', '沙田', '馬鞍山', '將軍澳', '西貢', '荃灣', '葵涌', '青衣', '離島', '葵青', '北區'],
  '九龍': ['油尖旺', '深水埗', '九龍城', '黃大仙', '觀塘', '尖沙咀', '油麻地', '旺角', '長沙灣', '何文田', '新蒲崗', '藍田'],
  '香港': ['中西區', '灣仔', '東區', '南區', '中環', '上環', '西環', '銅鑼灣', '北角', '鰂魚涌', '太古', '柴灣', '香港仔', '薄扶林'],
};

// DBS/Cushman & Wakefield 專用區域/分區清單（精確字串）
const BANK_DISTRICT_MAP = {
  '香港': [
    '鰂魚涌', '大坑/渣甸山', '中環/上環', '北角', '半山', '西灣河', '南區',
    '香港仔/鴨脷洲', '柴灣', '堅尼地城/西營盤', '跑馬地/黃泥涌', '黃竹坑',
    '筲箕灣', '銅鑼灣', '薄扶林', '灣仔'
  ],
  '九龍': [
    '九龍城', '九龍塘', '九龍灣', '土瓜灣', '大角咀', '牛池灣/彩虹', '牛頭角',
    '石硤尾/又一村', '尖沙咀', '旺角/何文田', '油麻地', '油塘/茶果嶺',
    '長沙灣/荔枝角', '紅磡', '啟德', '深水埗', '黃大仙/橫頭磡', '新蒲崗/慈雲山',
    '藍田', '觀塘/秀茂坪', '鑽石山'
  ],
  '新界/離島': [
    '上水', '大埔', '大嶼山/離島', '元朗/天水圍', '屯門', '西貢/清水灣',
    '沙田', '青衣', '粉嶺', '荃灣', '馬鞍山', '將軍澳', '深井/青龍頭', '葵涌'
  ]
};

function mapDistrictToBankOption(district) {
  if (!district) return null;
  const normalized = normalizeAddress(district);
  if (normalized === '東涌' || normalized === '東湧') {
    return { region: '新界/離島', district: '大嶼山/離島' };
  }
  const normalize = (s) => normalizeAddress(s).replace(/\s+/g, '');

  for (const [region, districts] of Object.entries(BANK_DISTRICT_MAP)) {
    for (const option of districts) {
      const optionNorm = normalize(option);
      const targetNorm = normalize(normalized);
      if (optionNorm === targetNorm || optionNorm.includes(targetNorm) || targetNorm.includes(optionNorm)) {
        return { region, district: option };
      }
    }
  }

  if (normalized.includes('元朗')) {
    return { region: '新界/離島', district: '元朗/天水圍' };
  }

  return null;
}

function findDistrictPrefix(address) {
  const normalized = normalizeAddress(address);
  for (const [region, districts] of Object.entries(districtToRegion)) {
    for (const district of districts) {
      if (normalized.startsWith(district)) {
        return { region, district };
      }
    }
  }
  return null;
}

function findDistrictAndRegion(address) {
  const normalized = normalizeAddress(address);
  const prefix = findDistrictPrefix(normalized);
  if (prefix) return prefix;
  for (const [region, districts] of Object.entries(districtToRegion)) {
    for (const district of districts) {
      if (normalized.includes(district)) {
        return { region, district };
      }
    }
  }
  return null;
}

function getRegionByDistrict(district) {
  if (!district) return null;
  const normalized = normalizeAddress(district);
  for (const [region, districts] of Object.entries(districtToRegion)) {
    if (districts.some(d => normalized.includes(d))) {
      return region;
    }
  }
  return null;
}

// ==========================================
// 2. 爬蟲輔助函數 (Select2 with Fuzzy Score)
// ==========================================

async function fillSelect2(page, containerId, targetText, label) {
  if (!targetText) {
    console.log(`⚠️ [HangSeng] 跳過 ${label} (無數值)`);
    return false;
  }

  const calculateScore = (target, candidate) => {
    const normalize = (s) => String(s || '').replace(/\s+/g, '').replace(/[座期苑樓室]/g, '').toUpperCase();
    const t = normalize(target);
    const c = normalize(candidate);

    if (!t || !c) return 0;
    if (t === c) return 100;
    if (t.includes(c)) return 80 + c.length;
    if (c.includes(t)) return 80 + t.length;

    const tSet = new Set(t.split(''));
    let matchCount = 0;
    for (const char of c) {
      if (tSet.has(char)) matchCount += 1;
    }
    return (matchCount / Math.max(t.length, c.length)) * 100;
  };

  try {
    console.log(`👇 [HangSeng] 正在選擇 ${label}: ${targetText}`);
    const containerSelector = `#${containerId}`;

    await page.waitForSelector(containerSelector, { visible: true, timeout: 5000 });
    await page.click(containerSelector);

    const dropdownSelector = '.select2-container--open';
    await page.waitForSelector(dropdownSelector, { state: 'attached', timeout: 5000 });

    const searchInputSelector = '.select2-container--open .select2-search__field';
    const isSearchable = await page.isVisible(searchInputSelector).catch(() => false);

    if (isSearchable) {
      console.log('   ...輸入搜尋關鍵字');
      await page.fill(searchInputSelector, targetText);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
    } else {
      console.log('   ...等待選項載入並評分');

      let options = [];
      for (let i = 0; i < 4; i += 1) {
        await page.waitForTimeout(1000);
        options = await page.$$('.select2-results__option');
        if (options.length > 1) break;

        const firstText = options.length > 0 ? await options[0].innerText() : '';
        if (options.length === 1 && !firstText.includes('請選擇') && !firstText.includes('Select')) {
          break;
        }

        console.log(`   ⏳ 選項尚未載入，重試 (${i + 1}/4)...`);
      }

      let bestMatch = null;
      let maxScore = 0;
      let bestText = '';
      const normalize = (s) => String(s || '')
        .replace(/\s+/g, '')
        .replace(/[座期苑樓室]/g, '')
        .toUpperCase();
      const targetNorm = normalize(targetText);

      for (const option of options) {
        const text = await option.innerText();
        if (text.includes('請選擇') || text.includes('Select')) continue;

        if (normalize(text) === targetNorm) {
          bestMatch = option;
          bestText = text;
          maxScore = 999;
          break;
        }

        const score = calculateScore(targetText, text);
        if (score > 40) console.log(`   🔎 評分: "${text}" = ${score.toFixed(1)}`);

        if (score > maxScore) {
          maxScore = score;
          bestMatch = option;
          bestText = text;
        }
      }

      if (bestMatch && maxScore > 20) {
        console.log(`   ✅ 選中最高分選項: "${bestText}" (分: ${maxScore.toFixed(1)})`);
        await bestMatch.click();
      } else {
        console.warn(`   ⚠️ 無法匹配合適選項 (最高分: ${maxScore})，保留預設或跳過。`);
        await page.keyboard.press('Escape');
        return false;
      }
    }

    await page.waitForTimeout(1500);
    return true;
  } catch (error) {
    console.error(`❌ [HangSeng] 選擇 ${label} 失敗:`, error.message);
    await page.keyboard.press('Escape');
    return false;
  }
}

// ==========================================
// 3. 爬蟲主邏輯
// ==========================================

async function scrapeHangSengValuation(propertyData) {
  let browser = null;

  try {
    console.log('🚀 啟動 Hang Seng 瀏覽器...');
    browser = await chromium.launch({
      headless: isCIEnv ? true : false,
      slowMo: 100,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    const targetUrl = 'https://www.hangseng.com/zh-hk/e-valuation/address-search/';
    console.log(`📄 前往恆生搜尋頁: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    const district = toTraditional(propertyData.bankMap?.hase?.district || propertyData.district || '');
    const region = getRegionByDistrict(district) || '新界';
    const estateKeyword = toTraditional(propertyData.bankMap?.hase?.estate || propertyData.estate || '');
    if (!district || !estateKeyword) {
      throw new Error('ESTATE_NOT_FOUND');
    }

    console.log('⏳ 等待區域資料載入...');
    try {
      await page.waitForFunction(() => {
        const select = document.querySelector('#areaValue');
        return select && select.options.length > 1;
      }, { timeout: 10000 });
      console.log('✅ 區域資料已載入');
    } catch (e) {
      console.warn('⚠️ 區域資料載入超時，嘗試重新整理頁面...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#select2-areaValue-container');
      await page.waitForTimeout(3000);
    }

    await fillSelect2(page, 'select2-areaValue-container', region, '區域');
    await page.waitForTimeout(800);

    await fillSelect2(page, 'select2-districtValue-container', district, '分區');
    await page.waitForTimeout(800);

    const haseEstateValue = propertyData.bankMap?.hase?.estateValue || null;
    if (haseEstateValue) {
      await page.evaluate((val) => {
        const sel = document.querySelector('#estateValue');
        if (sel) {
          sel.value = val;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          sel.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, haseEstateValue);
      await page.waitForTimeout(800);
    } else {
      await fillSelect2(page, 'select2-estateValue-container', estateKeyword, '屋苑');
    }
    await page.waitForTimeout(800);

    if (propertyData.block) {
      await fillSelect2(page, 'select2-blockValue-container', String(propertyData.block), '座數');
    } else {
      try {
        const blockText = await page.innerText('#select2-blockValue-container');
        if (blockText.includes('請選擇') || blockText.includes('Select')) {
          console.log('ℹ️ 無座數資料，嘗試選取預設選項...');
          await page.click('#select2-blockValue-container');
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
        }
      } catch (e) {
        console.log('⚠️ 座數默認選擇失敗');
      }
    }
    await page.waitForTimeout(800);

    await fillSelect2(page, 'select2-floorValue-container', String(propertyData.floor || ''), '樓層');
    await page.waitForTimeout(800);

    await fillSelect2(page, 'select2-flatValue-container', String(propertyData.unit || ''), '單位');
    await page.waitForTimeout(800);

    // 1. Skip Carpark (車位) - Do nothing

    // 2. Tick Checkbox (勾選免責聲明)
    console.log('☑️ 勾選免責聲明...');
    try {
      const checkbox = page.locator('input[type="checkbox"]').first();
      await checkbox.waitFor({ state: 'attached', timeout: 5000 });
      if (!(await checkbox.isChecked())) {
        await checkbox.check({ force: true });
      }
    } catch (e) {
      console.warn('⚠️ 勾選 Checkbox 失敗，嘗試點擊文字標籤...');
      await page.locator('text=在此就恒生銀行').click({ force: true });
    }

    await page.waitForTimeout(500);

    // 3. Click Search (點擊搜尋)
    console.log('🔘 點擊搜尋按鈕...');
    try {
      const searchBtn = page.locator('a, button, div[role="button"]').filter({ hasText: '搜尋' }).last();
      await searchBtn.waitFor({ state: 'visible', timeout: 5000 });
      await searchBtn.click();
    } catch (e) {
      console.error('❌ 找不到搜尋按鈕，嘗試 ID #search...');
      await page.click('#search');
    }

    console.log('⏳ 等待估價結果...');

    try {
      await page.locator('text=估值(港元)').waitFor({ state: 'visible', timeout: 30000 });
    } catch (e) {
      console.warn('⚠️ 等待 "估值(港元)" 超時，嘗試等待 "估值結果"...');
      await page.locator('text=估值結果').waitFor({ state: 'visible', timeout: 5000 });
    }

    const bodyText = await page.innerText('body');
    const priceMatch = bodyText.match(/估值\(?港元\)?\s*[:：]?\s*([0-9,]+)/);

    let price = null;
    if (priceMatch) {
      price = priceMatch[1].replace(/,/g, '');
      console.log(`💰 [HangSeng] 估價成功: ${price}`);
    } else {
      console.log('⚠️ [HangSeng] 找不到價格格式，保存截圖: hangseng-result-error.png');
      console.log('   Debug Text:', bodyText.substring(0, 500));
      await page.screenshot({ path: 'hangseng-result-error.png', fullPage: true });
    }

    await browser.close();
    return price;
  } catch (error) {
    console.error('❌ [HangSeng] 發生錯誤:', error.message);
    if (browser) await browser.close();
    return null;
  }
}

// ==========================================
// 5. HSBC 估價 (修正版：DOM 讀取 + 模糊匹配)
// ==========================================

async function scrapeHSBCValuation(propertyData) {
  let browser = null;
  try {
    console.log('🚀 [HSBC] 啟動瀏覽器 (Selectize 模糊匹配模式)...');

    browser = await chromium.launch({
      headless: false,
      slowMo: 50,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      viewport: null,
      locale: 'zh-HK',
      timezoneId: 'Asia/Hong_Kong',
    });

    const page = await context.newPage();

    // --- 🏆 API 劫持 (保持不變，這很有效) ---
    let capturedPrice = null;
    page.on('response', async response => {
      const type = response.request().resourceType();
      if (type === 'xhr' || type === 'fetch') {
        try {
          const json = await response.json();
          const str = JSON.stringify(json);
          if (str.includes('propertyValuation') || str.includes('valuationAmount') || str.includes('netPrice')) {
             const match = str.match(/("valuationAmount"|"netPrice"|"propertyValuation"|"price")\s*[:=]\s*"?([\d,]+(\.\d+)?)"?/i);
             if (match) {
                 const val = Number(match[2].replace(/,/g, ''));
                 if (val > 100000) capturedPrice = val;
             }
          }
        } catch (e) {}
      }
    });

    const targetUrl = 'https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
        const closeBanner = page.locator('.notification-close, [aria-label="Close"], .icon-close').first();
        if (await closeBanner.isVisible({ timeout: 5000 })) await closeBanner.click();
    } catch (e) {}

    console.log('⏳ 等待表單載入...');
    try {
        await page.waitForSelector('.selectize-input', { state: 'visible', timeout: 30000 });
    } catch(e) {
        console.error('❌ 表單載入超時');
        await browser.close();
        return null;
    }

    // --- 評分函數 (與 DBS 相同) ---
    const calculateScore = (target, candidate) => {
        const normalize = (s) => String(s || '').replace(/\s+/g, '').replace(/[座期苑樓室層棟]/g, '').toUpperCase();
        const t = normalize(target);
        const c = normalize(candidate);
        if (!t || !c) return 0;
        if (t === c) return 100;
        if (t.includes(c)) return 80 + (c.length / t.length) * 10;
        if (c.includes(t)) return 80 + (t.length / c.length) * 10;
        const tSet = new Set(t.split(''));
        let matchCount = 0;
        for (const char of c) { if (tSet.has(char)) matchCount += 1; }
        return (matchCount / Math.max(t.length, c.length)) * 100;
    };

    // --- 🛠️ 智能 Selectize 選擇函數 ---
    const selectizePick = async (index, label, rawText, valueId = null) => {
        const text = rawText !== null && rawText !== undefined ? String(rawText) : '';
        if (!text && !valueId) return false;

        console.log(`👇 正在選擇 [${label}]: "${text}"`);
        const control = page.locator('.selectize-control').nth(index);
        const inputDiv = control.locator('.selectize-input');
        
        await control.scrollIntoViewIfNeeded();
        
        // 1. 點擊輸入框
        await inputDiv.click();
        await page.waitForTimeout(500);

        // 2. 如果有 ID，嘗試直接從 DOM 點擊
        if (valueId) {
            const idSuccess = await page.evaluate((val) => {
                const options = Array.from(document.querySelectorAll('.selectize-dropdown-content .option'));
                const match = options.find(opt => opt.getAttribute('data-value') == val);
                if (match) { match.click(); return true; }
                return false;
            }, valueId);
            if (idSuccess) {
                console.log(`   ✅ [ID命中] ${valueId}`);
                await page.waitForTimeout(1000);
                return true;
            }
        }

        // 3. 輸入文字觸發搜尋
        if (text) {
            await page.keyboard.type(text, { delay: 50 });
            // 等待下拉選單出現 Loading 或結果
            await page.waitForTimeout(1500); 
        }

        // 4. 讀取下拉選單中的所有選項 (Visible Only)
        // 注意：Selectize 的 dropdown 常常有多個，我們需要找當前可見的那一個
        const options = await page.$$eval('.selectize-dropdown-content .option', (els, target) => {
            // 過濾掉不可見的 (belongs to other Selectizes)
            return els.filter(el => el.offsetParent !== null).map(el => ({
                text: el.innerText.trim(),
                value: el.getAttribute('data-value')
            }));
        });

        // 5. 評分並選擇最佳選項
        let bestMatch = null;
        let maxScore = 0;

        for (const opt of options) {
            // 跳過 "No results found"
            if (opt.text.includes('No results') || opt.text.includes('無結果')) continue;
            
            const score = calculateScore(text, opt.text);
            if (score > maxScore) {
                maxScore = score;
                bestMatch = opt;
            }
        }

        const SCORE_THRESHOLD = 60; // HSBC 門檻
        if (bestMatch && maxScore >= SCORE_THRESHOLD) {
            console.log(`   ✅ [文字命中] "${bestMatch.text}" (分: ${maxScore.toFixed(1)})`);
            // 透過 data-value 點擊最穩
            await page.evaluate((val) => {
                const els = Array.from(document.querySelectorAll('.selectize-dropdown-content .option'));
                const target = els.find(e => e.getAttribute('data-value') === val && e.offsetParent !== null);
                if (target) target.click();
            }, bestMatch.value);
            await page.waitForTimeout(1000);
            return true;
        } else {
            console.warn(`   ⚠️ 無法匹配 [${label}] (最高分: ${maxScore} - "${bestMatch?.text}")`);
            // 按一下 ESC 關閉選單，避免擋住下一個
            await page.keyboard.press('Escape');
            return false;
        }
    };

    // --- 填寫流程 ---
    const d = propertyData.bankMap?.hsbc || {};
    const region = d.region || (getRegionByDistrict(propertyData.district) || '新界').replace('/離島', '');
    
    // 如果上一步失敗，直接 return null (HSBC 也是連動的)
    if (!await selectizePick(0, '區域', region)) return null;
    if (!await selectizePick(1, '分區', d.district || propertyData.district)) return null;
    if (!await selectizePick(2, '屋苑', d.estate || propertyData.estate, d.estateValue)) return null;
    
    if (propertyData.block) {
        if (!await selectizePick(3, '座數', String(propertyData.block))) return null;
    }
    if (propertyData.floor) {
        if (!await selectizePick(4, '樓層', String(propertyData.floor))) return null;
    }
    if (propertyData.unit) {
        await selectizePick(5, '單位', String(propertyData.unit).toUpperCase());
    }

    // --- 提交 ---
    console.log('🔘 [HSBC] 點擊估價...');
    const btn = page.locator('a.search-button').first();
    await btn.click({ force: true }); // force click sometimes helps

    console.log('⏳ [HSBC] 等待結果顯示...');
    const startTime = Date.now();
    while (!capturedPrice && Date.now() - startTime < 10000) {
        await page.waitForTimeout(500);
    }

    if (capturedPrice) {
        console.log(`✅ [HSBC] API 攔截成功: ${capturedPrice}`);
        await browser.close();
        return capturedPrice;
    }

    // Fallback: 讀取 UI
    try {
        await page.waitForSelector('.valuation-result', { timeout: 5000 }); // 假設有個 result class，或者直接等文字
    } catch(e) {}
    
    const bodyText = await page.innerText('body');
    const priceMatch = bodyText.match(/(?:HKD|港幣)\s*([0-9,]{6,})/);
    if (priceMatch) {
        const p = Number(priceMatch[1].replace(/,/g, ''));
        console.log(`✅ [HSBC] 文字讀取成功: ${p}`);
        await browser.close();
        return p;
    }

    console.log('❌ [HSBC] 無法獲取價格');
    await browser.close();
    return null;

  } catch (error) {
    console.error('❌ [HSBC] 錯誤:', error.message);
    if (browser) await browser.close();
    return null;
  }
}

// ==========================================
// 4. Citibank 估價 (精確點擊修正版)
// ==========================================

async function scrapeCitibankValuation(propertyData) {
  let browser = null;
  try {
    console.log('🚀 [Citi] 啟動瀏覽器 (精確點擊模式)...');

    browser = await chromium.launch({
      headless: false, // 必須顯示視窗
      slowMo: 50,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      viewport: null,
      locale: 'zh-HK',
      timezoneId: 'Asia/Hong_Kong',
    });

    const page = await context.newPage();

    // --- 🏆 API 劫持 ---
    let capturedPrice = null;
    page.on('response', async response => {
      // 監聽所有可能的估價 API
      if (response.url().includes('propValuation') && response.status() === 200) {
        try {
          const json = await response.json();
          // Citi API 回傳格式可能變動，這裡做多重檢查
          if (json.propertyValuationPrice) {
            capturedPrice = Number(json.propertyValuationPrice);
            console.log(`   💰 [API] 攔截成功: ${capturedPrice}`);
          }
        } catch (e) {}
      }
    });

    const targetUrl = 'https://www.citibank.com.hk/acquisition/mortgage/index.html?locale=zh_HK';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // --- 🛠️ 穩健選擇函數 ---
    const safeSelect = async (selector, label, text) => {
      if (!text) return;
      console.log(`👇 正在選擇 ${label}: "${text}"...`);

      try {
        await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 10000 });
        await page.waitForFunction((s) => {
            const el = document.querySelector(s);
            return el && el.options && el.options.length > 1;
        }, selector, { timeout: 10000 });
      } catch (e) {
        console.error(`   ❌ 失敗: ${label} 選單未載入或無選項`);
        return;
      }

      const options = await page.$$eval(`${selector} option`, opts => 
        opts.map(o => ({ val: o.value, txt: (o.textContent || '').trim() }))
      );
      
      let match = options.find(o => o.txt === text);
      if (!match) match = options.find(o => o.txt.startsWith(text));
      if (!match) match = options.find(o => o.txt.includes(text) || text.includes(o.txt));

      if (match) {
        await page.selectOption(selector, match.val);
        await page.evaluate((s) => {
            const el = document.querySelector(s);
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }, selector);
        
        console.log(`   ✅ 已選: "${match.txt}"`);
        await page.waitForTimeout(1000); 
      } else {
        console.warn(`   ⚠️ 找不到選項: "${text}"`);
      }
    };

    // --- 填寫流程 ---
    const d = propertyData.bankMap?.citi;
    const region = (d?.region === '新界' ? '新界/離島' : d?.region) || '新界/離島';
    
    await safeSelect('#zone', '區域', region);
    await safeSelect('#district', '地區', toTraditional(d?.district || propertyData.district));
    await safeSelect('#estName', '屋苑', toTraditional(d?.estate || propertyData.estate));
    
    if (await page.isVisible('#phase')) {
        await page.waitForTimeout(500);
        const opts = await page.$$eval('#phase option', o => o.length);
        if (opts > 1) {
            await page.selectOption('#phase', { index: 1 });
            await page.waitForTimeout(500);
        }
    }
    
    await safeSelect('#bckBuilding', '座數', propertyData.block);
    await safeSelect('#floor', '樓層', propertyData.floor);

    if (propertyData.unit) {
      const unitVal = String(propertyData.unit).toUpperCase();
      console.log(`👇 正在選擇 單位: "${unitVal}"...`);
      await page.waitForSelector('#flatUnit:not([disabled])');
      
      try {
        await page.selectOption('#flatUnit', { index: 1 }); 
        await page.evaluate(() => document.querySelector('#flatUnit').dispatchEvent(new Event('change', {bubbles:true})));
        await page.waitForTimeout(800);
      } catch(e) {}
      
      await safeSelect('#flatUnit', '單位', unitVal);
    }

    // --- 準備點擊 (核心修正部分) ---
    console.log('🔘 [Citi] 準備點擊 (Human Click)...');
    
    // 1. 強力移除遮擋 (Header, Footer, Chat, Cookie Banner)
    await page.evaluate(() => {
        const selectors = [
            '#onetrust-banner-sdk', 'footer', 'header', '.navbar', '.cmp-container', 
            '.chat-widget', '#LP_DIV_1686906236357', '[id^="lp-chat"]'
        ];
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove());
        });
    });
    
    // 2. 重新定位按鈕
    const btnSelector = 'a.btn.btn-primary'; // 這是 Citi 常用的按鈕 class
    // 有時候按鈕上面會有文字 "立即估價" 或 "Get Valuation"
    const btn = page.locator(btnSelector).filter({ hasText: /估價|Valuation/ }).first();

    if (await btn.count() > 0) {
        // 確保按鈕在視窗中間，避免被上下邊緣遮擋
        await btn.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -100)); // 往上捲一點點，避開可能的底欄

        const box = await btn.boundingBox();
        if (box) {
             // 隨機化座標，但在按鈕範圍內
             const targetX = box.x + box.width / 2;
             const targetY = box.y + box.height / 2;
             
             console.log(`   🐭 滑鼠移動到 (${Math.round(targetX)}, ${Math.round(targetY)})`);
             
             await page.mouse.move(targetX, targetY, { steps: 10 });
             await page.waitForTimeout(200);
             await page.mouse.down();
             await page.waitForTimeout(150); // 真實的按壓時間
             await page.mouse.up();
        } else {
             // Fallback
             await btn.click({ force: true });
        }
    } else {
        console.error('❌ 找不到按鈕！嘗試備用 Selector...');
        // 備用方案：直接找 form 裡的 submit 按鈕
        const altBtn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (await altBtn.isVisible()) await altBtn.click();
    }

    console.log('⏳ [Citi] 等待 API 回傳...');

    const startTime = Date.now();
    // 延長等待時間到 20 秒，因為有時候 API 真的很慢
    while (!capturedPrice && Date.now() - startTime < 20000) {
        await page.waitForTimeout(200);
        // 補按邏輯：如果 5 秒沒反應，再按一次
        if (Date.now() - startTime > 5000 && Date.now() - startTime < 5200) {
            console.log('   🔄 無反應，補按一次...');
            if (await btn.isVisible()) {
                await btn.click({ force: true });
            }
        }
    }

    if (capturedPrice) {
        console.log(`✅ [Citi] 最終估價: ${capturedPrice}`);
        await browser.close();
        return capturedPrice;
    } else {
        console.log('⚠️ [Citi] 失敗：API 未回傳數據');
        await page.screenshot({ path: 'citi-form-debug.png', fullPage: true });
    }

    await browser.close();
    return null;

  } catch (error) {
    console.error('❌ [Citi] 錯誤:', error.message);
    if (browser) await browser.close();
    return null;
  }
}


// ==========================================
// 5. HSBC 估價 (嚴格匹配版)
// ==========================================

async function scrapeHSBCValuation(propertyData) {
  let browser = null;
  try {
    console.log('🚀 [HSBC] 啟動瀏覽器 (嚴格模式)...');
    browser = await chromium.launch({ headless: false, slowMo: 50, args: ['--start-maximized', '--disable-blink-features=AutomationControlled'] });
    const context = await browser.newContext();
    const page = await context.newPage();

    let capturedPrice = null;
    page.on('response', async response => {
      if (response.request().resourceType() === 'xhr') {
        try {
          const json = await response.json();
          const str = JSON.stringify(json);
          const match = str.match(/("valuationAmount"|"netPrice"|"propertyValuation"|"price")\s*[:=]\s*"?([\d,]+(\.\d+)?)"?/i);
          if (match) {
             const val = Number(match[2].replace(/,/g, ''));
             if (val > 100000) capturedPrice = val;
          }
        } catch (e) {}
      }
    });

    await page.goto('https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    try { 
        const banner = page.locator('.notification-close').first();
        if (await banner.isVisible({timeout:5000})) await banner.click(); 
    } catch(e){}

    // --- 嚴格選擇函式 ---
    const selectizeStrict = async (index, label, rawText, type, valueId = null) => {
        const text = rawText !== null && rawText !== undefined ? String(rawText) : '';
        if (!text && !valueId) return false;

        console.log(`👇 正在選擇 [${label}]: "${text}" (ID: ${valueId || 'N/A'})`);
        const control = page.locator('.selectize-control').nth(index);
        
        await control.scrollIntoViewIfNeeded();
        await control.locator('.selectize-input').click();
        await page.waitForTimeout(500);

        // 策略 1: JSON ID 直接點擊 (最安全)
        if (valueId) {
            const idSuccess = await page.evaluate((val) => {
                const options = Array.from(document.querySelectorAll('.selectize-dropdown-content .option'));
                // 必須確認該 option 是屬於當前開啟的 dropdown (offsetParent != null)
                const match = options.find(opt => opt.getAttribute('data-value') == val && opt.offsetParent !== null);
                if (match) { match.click(); return true; }
                return false;
            }, valueId);

            if (idSuccess) {
                console.log(`   ✅ [HSBC] ID 精確命中: ${valueId}`);
                await page.waitForTimeout(1000);
                return true;
            }
        }

        // 策略 2: 文字輸入 + 嚴格比對
        if (text) {
            await page.keyboard.type(text, { delay: 50 });
            await page.waitForTimeout(1500); // 等待搜尋結果

            // 讀取可見選項
            const options = await page.$$eval('.selectize-dropdown-content .option', (els) => {
                return els.filter(el => el.offsetParent !== null).map(el => ({
                    txt: el.innerText.trim(),
                    val: el.getAttribute('data-value')
                }));
            });

            const nTarget = String(text).trim().replace(/\s+/g, '').toUpperCase();
            
            const match = options.find(opt => {
                const nCand = opt.txt.replace(/\s+/g, '').toUpperCase();
                if (nCand === nTarget) return true;
                if (['block', 'floor', 'unit'].includes(type)) {
                    const cCand = nCand.replace(/[座樓層室第BLOCKTOWERFLOORUNITFLAT]/g, '');
                    const cTarget = nTarget.replace(/[座樓層室第BLOCKTOWERFLOORUNITFLAT]/g, '');
                    if (cTarget.length > 0 && cTarget === cCand) return true;
                }
                return false;
            });

            if (match) {
                console.log(`   ✅ [HSBC] 嚴格匹配成功: "${match.txt}"`);
                // 透過 ID 點擊以確保準確
                await page.evaluate((val) => {
                    const els = Array.from(document.querySelectorAll('.selectize-dropdown-content .option'));
                    const target = els.find(e => e.getAttribute('data-value') === val && e.offsetParent !== null);
                    if (target) target.click();
                }, match.val);
                await page.waitForTimeout(1000);
                return true;
            }
        }

        console.warn(`   ⚠️ [HSBC] 無法匹配 "${text}"，停止估價`);
        await page.keyboard.press('Escape');
        return false;
    };

    // 執行流程
    const d = propertyData.bankMap?.hsbc || {};
    const region = d.region || (getRegionByDistrict(propertyData.district) || '新界').replace('/離島', '');

    if (!await selectizeStrict(0, '區域', region, 'region')) { await browser.close(); return null; }
    if (!await selectizeStrict(1, '分區', d.district || propertyData.district, 'district')) { await browser.close(); return null; }
    if (!await selectizeStrict(2, '屋苑', d.estate || propertyData.estate, 'estate', d.estateValue)) { await browser.close(); return null; }
    
    if (propertyData.block) {
        if (!await selectizeStrict(3, '座數', String(propertyData.block), 'block')) { await browser.close(); return null; }
    }
    if (propertyData.floor) {
        if (!await selectizeStrict(4, '樓層', String(propertyData.floor), 'floor')) { await browser.close(); return null; }
    }
    if (propertyData.unit) {
        await selectizeStrict(5, '單位', String(propertyData.unit).toUpperCase(), 'unit');
    }

    console.log('🔘 點擊估價...');
    const btn = page.locator('a.search-button').first();
    await btn.click({ force: true });

    const startTime = Date.now();
    while (!capturedPrice && Date.now() - startTime < 10000) { await page.waitForTimeout(500); }

    if (capturedPrice) {
        console.log(`✅ [HSBC] 估價成功: ${capturedPrice}`);
        await browser.close();
        return capturedPrice;
    }

    // Fallback UI Reading
    try {
        const bodyText = await page.innerText('body');
        const priceMatch = bodyText.match(/(?:HKD|港幣)\s*([0-9,]{6,})/);
        if (priceMatch) {
            const p = Number(priceMatch[1].replace(/,/g, ''));
            console.log(`✅ [HSBC] 文字讀取成功: ${p}`);
            await browser.close();
            return p;
        }
    } catch(e) {}

    console.log('⚠️ [HSBC] 無結果');
    await browser.close();
    return null;

  } catch (error) {
    console.error('❌ [HSBC] 錯誤:', error.message);
    if (browser) await browser.close();
    return null;
  }
}
// ==========================================
// 4. Google Sheets (leads)
// ==========================================

async function getPendingLeads() {
  try {
    const response = await axios.get(process.env.GOOGLE_SCRIPT_URL, {
      params: { action: 'getPending', token: process.env.GS_SECRET_TOKEN },
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error('❌ 獲取 Leads 失敗:', error.message);
    return [];
  }
}

async function updateValuation(row, { citiPrice = null, hangSengPrice = null, dbsPrice = null, hsbcPrice = null, status = 'completed' } = {}) {
  // Helper to ensure data is numeric or null
  const formatPrice = (p) => p ? Number(String(p).replace(/[^0-9.]/g, '')) : null;

  try {
    console.log(`📡 [Google Sheet] 上傳數據 Row ${row}...`);
    console.log(`   👉 HASE: ${hangSengPrice}, Citi: ${citiPrice}, DBS: ${dbsPrice}, HSBC: ${hsbcPrice}`);

    await axios.post(process.env.GOOGLE_SCRIPT_URL, {
      action: 'updateValuation',
      row: row,
      hasePrice: formatPrice(hangSengPrice), // Correct Key for Col L
      citiPrice: formatPrice(citiPrice),     // Correct Key for Col O
      dbsPrice: formatPrice(dbsPrice),       // Correct Key for Col P
      hsbcPrice: formatPrice(hsbcPrice),     // Correct Key for Col K
      status: status,
      token: process.env.GS_SECRET_TOKEN
    }, { timeout: 30000 });
    console.log(`✅ [Google Sheet] 更新成功！`);
  } catch (error) {
    console.error('❌ [Google Sheet] 更新失敗:', error.message);
  }
}

async function startWorker() {
  console.log('🔄 啟動背景工作器 (HSBC → Citi → DBS → Hang Seng)...');
  if (!process.env.GOOGLE_SCRIPT_URL) {
    console.error('❌ 缺少 GOOGLE_SCRIPT_URL');
    process.exit(1);
  }
  const isGitHubAction = !!process.env.CI;

  while (true) {
    try {
      console.log('\n📊 [Worker] 檢查待處理 Leads...');
      const leads = await getPendingLeads();
      console.log('🔍 DEBUG - Raw Leads:', JSON.stringify(leads));

      if (!leads || leads.length === 0) {
        console.log('[Worker] 無待處理項目，休眠 60 秒...');
        if (isGitHubAction) {
          console.log('✅ No leads pending. CI job finished.');
          process.exit(0);
        }
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }

      const lead = leads[0];
      const hasStructured = lead && (lead.district || lead.estate || lead.block || lead.floor || lead.flat);
      if (!lead || (!lead.address && !hasStructured)) {
        console.error('❌ Error: Received invalid lead data (missing address). Skipping...');
        if (lead && lead.row) {
          await updateValuation(lead.row, { status: 'failed_invalid_address' });
        }
        if (isGitHubAction) {
          process.exit(0);
        }
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }
      console.log(`\n🎯 處理 Lead #${lead.row}: ${lead.address || ''}`);
      const parsed = lead.address ? parseAddress(lead.address) : {};
      const propertyData = {
        address: lead.address || '',
        district: lead.district || parsed.district || '',
        estate: toTraditional(lead.estate || parsed.estate || ''),
        estateId: lead.estateId || '',
        block: lead.block || parsed.block || '',
        floor: lead.floor || parsed.floor || '',
        unit: lead.flat || lead.unit || parsed.unit || ''
      };
      propertyData.bankMap = mapToBankData(propertyData);
      console.log(`   解析: District=${propertyData.district}, Estate=${propertyData.estate}, Block=${propertyData.block}, Floor=${propertyData.floor}, Unit=${propertyData.unit}`);

      let citiValuation = null;
      let dbsValuation = null;
      let hangSengValuation = null;
      let hsbcValuation = null;
      try {
        console.log('🔍 [Worker] 開始爬取 HSBC 估價...');
        hsbcValuation = await scrapeHSBCValuation(propertyData);

        console.log('🔍 [Worker] 開始爬取 Citibank 估價...');
        citiValuation = await scrapeCitibankValuation(propertyData);

        let dbsBrowser = null;
        try {
          console.log('🔍 [Worker] 開始爬取 DBS 估價...');
          dbsBrowser = await chromium.launch({ headless: isCIEnv ? true : false, slowMo: 100 });
          const dbsContext = await dbsBrowser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          });
          const dbsPage = await dbsContext.newPage();
          dbsValuation = await scrapeDBSValuation(dbsPage, propertyData);
        } finally {
          if (dbsBrowser) await dbsBrowser.close();
        }

        console.log('🔍 [Worker] 開始爬取 Hang Seng 估價...');
        hangSengValuation = await scrapeHangSengValuation(propertyData);
      } catch (e) {
        console.log(`⚠️ 爬取過程中發生錯誤: ${e.message}`);
      }

      if (dbsValuation || hangSengValuation || citiValuation || hsbcValuation) {
        await updateValuation(lead.row, {
          citiPrice: citiValuation,
          hangSengPrice: hangSengValuation,
          dbsPrice: dbsValuation, // Add this
          hsbcPrice: hsbcValuation,
          status: 'completed'
        });
      } else {
        await updateValuation(lead.row, { status: 'failed' });
      }

      if (isGitHubAction) {
        console.log('✅ CI job processed one lead. Exiting to save resources.');
        process.exit(0);
      }

      console.log('[Worker] 休息 30 秒...');
      await new Promise(r => setTimeout(r, 30000));
    } catch (error) {
      console.error('❌ Worker 錯誤:', error);
      if (isGitHubAction) {
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 30000));
    }
  }
}

if (require.main === module) {
  startWorker();
}

module.exports = {
  scrapeHangSengValuation
};