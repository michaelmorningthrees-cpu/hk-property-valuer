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

  const map = { '蓝': '藍', '湾': '灣', '邨': '村', '号': '號', '楼': '樓', '层': '層', '座': '座' };
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

  const citiCandidates = CITI_DATA.filter(item =>
    (!bankDistrict?.district || item.district === bankDistrict.district)
  );
  const dbsCandidates = DBS_DATA.filter(item =>
    (!bankDistrict?.district || item.district === bankDistrict.district)
  );
  const haseCandidates = HASE_DATA;

  const citiEstate = pickBestEstate(citiCandidates, estate);
  const dbsEstate = pickBestEstate(dbsCandidates, estate);
  const haseEstate = pickBestEstate(haseCandidates, estate);

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
// 4. DBS 估價 (DIV-based dropdowns)
// ==========================================

async function scrapeDBSValuation(page, propertyData) {
  const targetUrl = 'https://evalhk.cushmanwakefield.com.hk/e-valuation/DBSV2/Home/Index/cn';
  const waitAfterSelectMs = 1500;

  const calculateScore = (target, candidate) => {
    const normalize = (s) => String(s || '')
      .replace(/\s+/g, '')
      .replace(/[座期苑樓室層棟]/g, '')
      .toUpperCase();
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

  const selectDivOption = async (containerId, targetText, label, targetValue = null) => {
    if (!targetText) {
      console.log(`⚠️ [DBS] 跳過 ${label} (無數值)`);
      return false;
    }

    const containerSelector = `#${containerId}`;
    const citeSelector = `${containerSelector} cite`;
    const listSelector = `${containerSelector} ul`;
    const optionSelector = `${containerSelector} ul li a`;

    console.log(`👇 [DBS] 正在選擇 ${label}: ${targetText}`);
    await page.waitForSelector(citeSelector, { state: 'visible', timeout: 10000 });
    await page.click(citeSelector);
    await page.waitForSelector(listSelector, { state: 'visible', timeout: 10000 });

    if (targetValue) {
      const exactSelector = `${optionSelector}[selectid="${targetValue}"]`;
      const exactExists = await page.$(exactSelector);
      if (exactExists) {
        console.log(`   ✅ [DBS] 直接選取 ${label} (ID: ${targetValue})`);
        await page.click(exactSelector);
        await page.waitForTimeout(waitAfterSelectMs);
        return true;
      }
    }

    const optionsText = await page.$$eval(optionSelector, options =>
      options.map(o => o.innerText.trim()).filter(t => t.length > 0)
    );

    let bestIndex = -1;
    let bestScore = 0;
    let bestText = '';

    const normalize = (s) => String(s || '').trim().replace(/\s+/g, '').toUpperCase();
    const targetNorm = normalize(targetText);

    optionsText.forEach((text, index) => {
      if (normalize(text) === targetNorm) {
        bestScore = 999;
        bestIndex = index;
        bestText = text;
        return;
      }
      const score = calculateScore(targetText, text);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
        bestText = text;
      }
    });

    if (bestIndex < 0 || bestScore < 20) {
      console.warn(`⚠️ [DBS] 找不到合適的 ${label} 選項 (最高分: ${bestScore})`);
      return false;
    }

    console.log(`   ✅ 選中最高分選項: "${bestText}" (分: ${bestScore.toFixed(1)})`);
    await page.locator(optionSelector).nth(bestIndex).click();
    await page.waitForTimeout(waitAfterSelectMs);
    return true;
  };

  try {
    await page.setExtraHTTPHeaders({ Referer: 'https://www.dbs.com.hk/' });
    console.log(`📄 [DBS] 前往估價頁: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    const district = toTraditional(propertyData.bankMap?.dbs?.district || propertyData.district || '');
    const estateKeyword = toTraditional(propertyData.bankMap?.dbs?.estate || propertyData.estate || '');
    const bankDistrict = mapDistrictToBankOption(district);
    const area = bankDistrict?.region || getRegionByDistrict(district) || '新界/離島';
    const districtForSelect = bankDistrict?.district || district;

    await selectDivOption('divselect_area', area, '區域');
    await selectDivOption('divselect_dist', districtForSelect, '分區');
    await selectDivOption('divselect_est', estateKeyword, '屋苑', propertyData.bankMap?.dbs?.estateValue || null);
    await selectDivOption('divselect_block', propertyData.block, '座數');
    await selectDivOption('divselect_floor', propertyData.floor, '樓層');
    await selectDivOption('divselect_flat', propertyData.unit, '單位');

    console.log('🔘 [DBS] 點擊提交...');
    const submitBtn = page.locator('.btn-red, button, a').filter({ hasText: '提交' }).first();
    await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await submitBtn.click();

    console.log('⏳ [DBS] 等待估價結果...');
    const labelCell = page.locator('td', { hasText: '估價' }).first();
    await labelCell.waitFor({ state: 'visible', timeout: 20000 });

    const valueCell = labelCell.locator('xpath=following-sibling::td[1]');
    let valueText = '';
    try {
      valueText = (await valueCell.innerText()).trim();
    } catch (e) {
      valueText = '';
    }

    let price = null;
    const cellMatch = valueText.match(/[\d,]+/);
    if (cellMatch) {
      price = Number(cellMatch[0].replace(/,/g, ''));
    } else {
      const bodyText = await page.innerText('body');
      const bodyMatch = bodyText.match(/估價\s*\(港幣\)\s*[:：]?\s*([0-9,]+)/);
      if (bodyMatch) {
        price = Number(bodyMatch[1].replace(/,/g, ''));
      }
    }

    if (price) {
      console.log(`💰 [DBS] 估價成功: ${price}`);
      return price;
    }

    console.warn('⚠️ [DBS] 找不到估價結果，保存截圖: dbs-result-error.png');
    await page.screenshot({ path: 'dbs-result-error.png', fullPage: true });
    return null;
  } catch (error) {
    console.error('❌ [DBS] 發生錯誤:', error.message);
    await page.screenshot({ path: 'dbs-error.png', fullPage: true }).catch(() => {});
    return null;
  }
}

// ==========================================
// 4. Citibank 估價
// ==========================================

async function scrapeCitibankValuation(propertyData) {
  let browser = null;
  try {
    console.log('🚀 [Citi] 啟動瀏覽器...');
    browser = await chromium.launch({ headless: isCIEnv ? true : false, slowMo: 100 });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const targetUrl = 'https://www.citibank.com.hk/acquisition/mortgage/index.html?locale=zh_HK';
    console.log(`📄 [Citi] 前往估價頁: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    const normalizeCitiRegion = (value) => {
      if (!value) return '新界/離島';
      if (value === '新界') return '新界/離島';
      if (value === '香港') return '香港島';
      return value;
    };

    const district = toTraditional(propertyData.bankMap?.citi?.district || propertyData.district || '');
    const region = normalizeCitiRegion(propertyData.bankMap?.citi?.region || getRegionByDistrict(district || '')) || '新界/離島';
    const estateKeyword = toTraditional(propertyData.bankMap?.citi?.estate || propertyData.estate || '');

    const waitReady = async (selector) => {
      await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 20000 });
      await page.waitForFunction((sel) => {
        const select = document.querySelector(sel);
        return select && select.options && select.options.length > 1;
      }, selector, { timeout: 20000 });
    };

    const getOptions = async (selector) => {
      return page.$$eval(`${selector} option`, options =>
        options.map(o => ({
          value: o.value,
          label: o.label || o.textContent || '',
        })).filter(o => o.label && o.label.trim().length > 0)
      );
    };

    const normalizeNumeric = (value) => String(value || '').replace(/[^\d]/g, '');

    const isPlaceholderOption = (label) => {
      const text = (label || '').replace(/\s+/g, '');
      return text === '' || text === '請選擇' || text === '屋苑名稱';
    };

    const scoreText = (target, candidate) => {
      const normalize = (s) => String(s || '')
        .replace(/\s+/g, '')
        .replace(/[座期苑樓室層棟]/g, '')
        .toUpperCase();
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

    const selectByScore = async (selector, targetValue) => {
      if (!targetValue) return false;
      const options = await getOptions(selector);
      const filtered = options.filter(o => !isPlaceholderOption(o.label));
      if (filtered.length === 0) return false;

      const targetText = String(targetValue).trim();
      const targetNumeric = normalizeNumeric(targetValue);

      let best = null;
      let bestScore = 0;
      const normalizeLabel = (s) => String(s || '')
        .replace(/\s+/g, '')
        .replace(/[座期苑樓室層棟]/g, '')
        .toUpperCase();
      const targetNorm = normalizeLabel(targetText);

      for (const opt of filtered) {
        if (normalizeLabel(opt.label) === targetNorm) {
          best = opt;
          bestScore = 999;
          break;
        }
        let score = scoreText(targetText, opt.label);
        if (targetNumeric) {
          const optNumeric = normalizeNumeric(opt.label);
          if (optNumeric === targetNumeric) score = Math.max(score, 100);
          if (optNumeric.endsWith(targetNumeric)) score = Math.max(score, 85);
        }
        if (score > bestScore) {
          bestScore = score;
          best = opt;
        }
      }

      if (best && bestScore >= 20) {
        await page.selectOption(selector, { value: best.value });
        return true;
      }

      return false;
    };

    const selectCiti = async (selector, text, value = null) => {
      if (!text) return false;
      if (value) {
        const selected = await page.selectOption(selector, { value }).catch(() => null);
        if (selected && selected.length > 0) {
          console.log(`   ✅ [Citi] 直接選取 value: "${value}"`);
          await page.waitForTimeout(1000);
          return true;
        }
      }
      const options = await page.$$eval(`${selector} option`, opts =>
        opts.map(o => ({ val: o.value, txt: (o.textContent || '').trim() }))
      );
      let match = options.find(o => o.txt === text);
      if (!match) {
        match = options.find(o => o.txt.startsWith(text));
      }
      if (!match) {
        match = options.find(o => o.txt.includes(text) || text.includes(o.txt));
      }
      if (match) {
        console.log(`   ✅ [Citi] 精確選取: "${match.txt}" (目標: "${text}")`);
        await page.selectOption(selector, match.val);
        await page.waitForTimeout(1000);
        return true;
      }
      console.warn(`   ⚠️ [Citi] 找不到選項: "${text}"`);
      return false;
    };

    const logSelected = async (selector, label) => {
      const selectedText = await page.$eval(selector, (sel) => {
        const opt = sel.selectedOptions && sel.selectedOptions[0];
        return opt ? opt.textContent : '';
      }).catch(() => '');
      console.log(`✅ [Citi] 已選 ${label}: ${selectedText || '(無法讀取)'}`);
    };

    const selectPhaseIfAny = async () => {
      const phaseSelector = '#phase';
      const exists = await page.$(phaseSelector);
      if (!exists) return;
      const options = await getOptions(phaseSelector);
      if (options.length > 1) {
        await page.selectOption(phaseSelector, { index: 1 });
      } else if (options.length === 1) {
        await page.selectOption(phaseSelector, { index: 0 });
      }
      await page.waitForTimeout(2000);
    };

    console.log(`👇 [Citi] 區域: ${region}`);
    await waitReady('#zone');
    await selectCiti('#zone', region);
    await logSelected('#zone', '區域');
    await page.waitForTimeout(2000);

    if (district) {
      console.log(`👇 [Citi] 地區: ${district}`);
      await waitReady('#district');
      await selectCiti('#district', district);
      await logSelected('#district', '地區');
      await page.waitForTimeout(2000);
    }

    console.log(`👇 [Citi] 屋苑: ${estateKeyword}`);
    await waitReady('#estName');
    await page.waitForFunction((sel) => {
      const select = document.querySelector(sel);
      if (!select) return false;
      const opts = Array.from(select.options || []);
      const nonPlaceholders = opts.filter(o => {
        const text = (o.textContent || '').replace(/\s+/g, '');
        return text && text !== '請選擇' && text !== '屋苑名稱';
      });
      return nonPlaceholders.length > 0;
    }, '#estName', { timeout: 20000 });

    const estateSelected = await selectCiti('#estName', estateKeyword, propertyData.bankMap?.citi?.estateValue || null);
    await logSelected('#estName', '屋苑');
    await page.waitForTimeout(2000);

    await selectPhaseIfAny();

    if (propertyData.block) {
      console.log(`👇 [Citi] 座數: ${propertyData.block}`);
      await waitReady('#bckBuilding');
      await selectCiti('#bckBuilding', propertyData.block);
      await logSelected('#bckBuilding', '座數');
      await page.waitForTimeout(2000);
    }

    if (propertyData.floor) {
      console.log(`👇 [Citi] 樓層: ${propertyData.floor}`);
      await waitReady('#floor');
      await selectCiti('#floor', propertyData.floor);
      await logSelected('#floor', '樓層');
      await page.waitForTimeout(2000);
    }

    if (propertyData.unit) {
      console.log(`👇 [Citi] 單位: ${propertyData.unit}`);
      await waitReady('#flatUnit');
      await selectCiti('#flatUnit', String(propertyData.unit).toUpperCase());
      await logSelected('#flatUnit', '單位');
      await page.waitForTimeout(2000);
    }

    console.log('🔘 [Citi] 準備點擊估價按鈕...');
    await page.evaluate(() => {
      const banner = document.querySelector('#onetrust-banner-sdk');
      if (banner) banner.remove();
      document.querySelectorAll('footer, .cmp-container, .navbar').forEach(el => el.remove());
    });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    const possibleSelectors = [
      'text=進行物業估價',
      'text=估價',
      'text=Get Valuation',
      'text=Submit',
      'a:has-text("進行物業估價")',
      'button:has-text("進行物業估價")',
      'div[role="button"]:has-text("估價")',
      '.citi-btn',
      'button.primary',
      'input[type="submit"]'
    ];

    let clicked = false;
    for (const selector of possibleSelectors) {
      try {
        const btn = page.locator(selector).first();
        const count = await btn.count();
        if (!count) continue;
        if (await btn.isVisible()) {
          console.log(`   👉 [Citi] 嘗試點擊: ${selector}`);
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.hover().catch(() => {});
          await page.waitForTimeout(200);
          await btn.click({ force: true, timeout: 3000 });
          clicked = true;
          break;
        }
      } catch (e) {
        // ignore and try next selector
      }
    }

    if (!clicked) {
      console.warn('⚠️ [Citi] 找不到明確按鈕，改用 Enter 嘗試提交...');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(3000);

    console.log('⏳ [Citi] 等待結果...');
    try {
      await page.waitForFunction(() => {
        const nodes = Array.from(document.querySelectorAll('td, th, div, span'));
        const labelEl = nodes.find(el => {
          const text = (el.textContent || '').replace(/\s+/g, '');
          return text.includes('估價') && text.includes('港幣');
        });
        if (!labelEl) return false;
        const row = labelEl.closest('tr');
        if (row) {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length >= 2) {
            const valueText = (cells[cells.length - 1].textContent || '').trim();
            return /[\d,]+/.test(valueText);
          }
        }
        const next = labelEl.nextElementSibling;
        if (next) return /[\d,]+/.test(next.textContent || '');
        return false;
      }, { timeout: 30000 });
    } catch (e) {
      const bodyText = await page.innerText('body');
      if (/未能提供|System busy/i.test(bodyText)) {
        console.warn('⚠️ [Citi] 系統繁忙或未能提供估價，略過。');
        await browser.close();
        return null;
      }
      throw e;
    }

    const price = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('td, th, div, span'));
      const labelEl = nodes.find(el => {
        const text = (el.textContent || '').replace(/\s+/g, '');
        return text.includes('估價') && text.includes('港幣');
      });
      if (!labelEl) return null;
      const row = labelEl.closest('tr');
      let valueText = '';
      if (row) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length >= 2) valueText = (cells[cells.length - 1].textContent || '').trim();
      } else if (labelEl.nextElementSibling) {
        valueText = (labelEl.nextElementSibling.textContent || '').trim();
      }
      const match = valueText.match(/[\d,]+/);
      return match ? Number(match[0].replace(/,/g, '')) : null;
    });

    if (price) {
      console.log(`💰 [Citi] 估價成功: ${price}`);
    } else {
      console.log('⚠️ [Citi] 找不到估價結果，保存截圖: citi-result-error.png');
      await page.screenshot({ path: 'citi-result-error.png', fullPage: true });
    }

    await browser.close();
    return price;
  } catch (error) {
    console.error('❌ [Citi] 發生錯誤:', error.message);
    if (browser) await browser.close();
    return null;
  }
}

async function scrapeHSBCValuation() {
  console.warn('⚠️ [HSBC] 尚未實作，暫時略過。');
  return null;
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

async function updateValuation(row, { citiPrice = null, hangSengPrice = null, dbsPrice = null, status = 'completed' } = {}) {
  // Helper to ensure data is numeric or null
  const formatPrice = (p) => p ? Number(String(p).replace(/[^0-9.]/g, '')) : null;

  try {
    console.log(`📡 [Google Sheet] 上傳數據 Row ${row}...`);
    console.log(`   👉 HASE: ${hangSengPrice}, Citi: ${citiPrice}, DBS: ${dbsPrice}`);

    await axios.post(process.env.GOOGLE_SCRIPT_URL, {
      action: 'updateValuation',
      row: row,
      hasePrice: formatPrice(hangSengPrice), // Correct Key for Col G
      citiPrice: formatPrice(citiPrice),     // Correct Key for Col J
      dbsPrice: formatPrice(dbsPrice),       // Correct Key for Col K
      status: status,
      token: process.env.GS_SECRET_TOKEN
    }, { timeout: 30000 });
    console.log(`✅ [Google Sheet] 更新成功！`);
  } catch (error) {
    console.error('❌ [Google Sheet] 更新失敗:', error.message);
  }
}

async function startWorker() {
  console.log('🔄 啟動背景工作器 (Citi → DBS → Hang Seng → HSBC)...');
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

        console.log('🔍 [Worker] 開始爬取 HSBC 估價...');
        hsbcValuation = await scrapeHSBCValuation(propertyData);
      } catch (e) {
        console.log(`⚠️ 爬取過程中發生錯誤: ${e.message}`);
      }

      if (dbsValuation || hangSengValuation || citiValuation || hsbcValuation) {
        await updateValuation(lead.row, {
          citiPrice: citiValuation,
          hangSengPrice: hangSengValuation,
          dbsPrice: dbsValuation, // Add this
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