require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
const fs = require('fs');
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

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

const chineseNumerals = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

function chineseToArabic(chinese) {
  if (!chinese) return null;
  if (chinese === '十') return '10';
  if (chinese.length === 2 && chinese.startsWith('十')) {
    const unit = chineseNumerals[chinese[1]] || 0;
    return String(10 + unit);
  }
  if (chinese.length === 2 && chinese.endsWith('十')) {
    const tens = chineseNumerals[chinese[0]] || 0;
    return String(tens * 10);
  }
  const value = chineseNumerals[chinese];
  return value ? String(value) : null;
}

function normalizeAddress(address) {
  if (!address) return '';
  let normalized = address.toLowerCase();
  for (const [alias, zh] of Object.entries(englishDistrictAliases)) {
    if (normalized.includes(alias)) {
      normalized = normalized.replace(new RegExp(alias, 'g'), zh);
    }
  }
  normalized = normalized.replace(/[台广东关门湾岛区龙马里楼层栋园厦]/g, (ch) => simplifiedToTraditional[ch] || ch);
  return normalized;
}

function cleanAddress(address) {
  const normalized = normalizeAddress(address);
  return normalized
    .replace(/\s+/g, '')
    .replace(/[樓室座號層棟]/g, '')
    .replace(/[,-]/g, '');
}

function extractFloorAndUnit(address) {
  const normalized = normalizeAddress(address).toUpperCase();
  let remainder = normalized;

  const blockMatch = normalized.match(/(\d+)\s*(座|棟)/);
  if (blockMatch && blockMatch.index !== undefined) {
    remainder = normalized.slice(blockMatch.index + blockMatch[0].length);
  }
  remainder = remainder.replace(/^\s*[,，\-]*/, '').trim();

  let match = remainder.match(/FLAT\s*([A-Z]?\d{0,4})\s*(\d{1,3})\s*(\/?F|樓|層)/i);
  if (match && match[1] && match[2]) return { floor: match[2], unit: match[1] };

  match = remainder.match(/(\d{1,3})\s*(樓|層|\/?F)\s*([A-Z]?\d{0,4})?/i);
  if (match && match[1]) return { floor: match[1], unit: match[3] || null };

  match = remainder.match(/([一二三四五六七八九十])\s*(樓|層)\s*([A-Z]?\d{0,4})?/i);
  if (match && match[1]) return { floor: chineseToArabic(match[1]), unit: match[3] || null };

  match = remainder.match(/(\d{1,3})\s*([A-Z]\d{0,4})/i);
  if (match && match[1] && match[2]) return { floor: match[1], unit: match[2] };

  match = remainder.match(/(\d{2,4})\s*室/);
  if (match && match[1]) return { floor: null, unit: match[1] };

  match = remainder.match(/([A-Z])\s*室/);
  if (match && match[1]) return { floor: null, unit: match[1] };

  return { floor: null, unit: null };
}

function extractBlock(address) {
  const normalized = normalizeAddress(address);
  const blockMatch = normalized.match(/(\d+)\s*(座|棟)/);
  if (blockMatch) return blockMatch[1];
  const chineseMatch = normalized.match(/([一二三四五六七八九十])\s*(座|棟)/);
  if (chineseMatch) return chineseToArabic(chineseMatch[1]);
  return null;
}

function parseAddress(address) {
  const floorUnit = extractFloorAndUnit(address);
  return {
    address,
    cleanedAddress: cleanAddress(address),
    block: extractBlock(address),
    floor: floorUnit.floor,
    unit: floorUnit.unit
  };
}

const districtToRegion = {
  '新界': ['屯門', '元朗', '粉嶺', '上水', '大埔', '沙田', '馬鞍山', '將軍澳', '西貢', '荃灣', '葵涌', '青衣', '離島'],
  '九龍': ['尖沙咀', '油麻地', '旺角', '深水埗', '長沙灣', '九龍城', '何文田', '黃大仙', '新蒲崗', '觀塘', '藍田'],
  '香港': ['中環', '上環', '西環', '灣仔', '銅鑼灣', '北角', '鰂魚涌', '太古', '柴灣', '香港仔', '薄扶林'],
};

function findDistrictAndRegion(address) {
  const normalized = normalizeAddress(address);
  for (const [region, districts] of Object.entries(districtToRegion)) {
    for (const district of districts) {
      if (normalized.includes(district)) {
        return { region, district };
      }
    }
  }
  return null;
}

function extractAddressKeywords(address) {
  const keywords = new Set();
  const cleaned = normalizeAddress(address)
    .replace(/[0-9]/g, '')
    .replace(/[樓室座號層棟]/g, '');
  const matches = cleaned.match(/[一-龥]{2,6}/g) || [];
  for (const word of matches) {
    if (word.length >= 2) keywords.add(word);
  }
  return Array.from(keywords);
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
    const normalize = (s) => s.replace(/\s+/g, '').replace(/[座期苑樓室]/g, '').toUpperCase();
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
      headless: false,
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

    const regionDistrict = findDistrictAndRegion(propertyData.address);
    if (!regionDistrict) {
      throw new Error('ESTATE_NOT_FOUND');
    }

    const keywords = extractAddressKeywords(propertyData.address);
    let estateKeyword = propertyData.address;
    if (keywords.length > 0) {
      const chineseKeywords = keywords.filter(k => /[\u4e00-\u9fa5]/.test(k));
      estateKeyword = chineseKeywords.length > 0 ? chineseKeywords[0] : keywords[0];
    } else {
      estateKeyword = propertyData.cleanedAddress.substring(0, 4);
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

    await fillSelect2(page, 'select2-areaValue-container', regionDistrict.region, '區域');
    await page.waitForTimeout(800);

    await fillSelect2(page, 'select2-districtValue-container', regionDistrict.district, '分區');
    await page.waitForTimeout(800);

    await fillSelect2(page, 'select2-estateValue-container', estateKeyword, '屋苑');
    await page.waitForTimeout(800);

    if (propertyData.block) {
      await fillSelect2(page, 'select2-blockValue-container', propertyData.block, '座數');
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

    await fillSelect2(page, 'select2-floorValue-container', propertyData.floor, '樓層');
    await page.waitForTimeout(800);

    await fillSelect2(page, 'select2-flatValue-container', propertyData.unit, '單位');
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

  const selectDivOption = async (containerId, targetText, label) => {
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

    const regionDistrict = findDistrictAndRegion(propertyData.address || '');
    const keywords = extractAddressKeywords(propertyData.address || '');
    const estateKeyword = propertyData.estate
      || (keywords.length > 0 ? keywords[0] : propertyData.cleanedAddress?.substring(0, 4));

    const area = propertyData.area || regionDistrict?.region || '新界';
    const district = propertyData.district || regionDistrict?.district;

    await selectDivOption('divselect_area', area, '區域');
    await selectDivOption('divselect_dist', district, '分區');
    await selectDivOption('divselect_est', estateKeyword, '屋苑');
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
    browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    const targetUrl = 'https://www.citibank.com.hk/acquisition/mortgage/index.html?locale=zh_HK';
    console.log(`📄 [Citi] 前往估價頁: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    const regionDistrict = findDistrictAndRegion(propertyData.address || '');
    const normalizeCitiRegion = (value) => {
      if (!value) return '新界/離島';
      if (value === '新界') return '新界/離島';
      if (value === '香港') return '香港島';
      return value;
    };

    const region = normalizeCitiRegion(regionDistrict?.region);
    const district = regionDistrict?.district || '';
    const keywords = extractAddressKeywords(propertyData.address || '');
    const estateKeyword = propertyData.estate
      || (keywords.length > 0 ? keywords[0] : propertyData.cleanedAddress?.substring(0, 4));

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
    await selectByScore('#zone', region);
    await logSelected('#zone', '區域');
    await page.waitForTimeout(2000);

    if (district) {
      console.log(`👇 [Citi] 地區: ${district}`);
      await waitReady('#district');
      await selectByScore('#district', district);
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

    const estateSelected = await selectByScore('#estName', estateKeyword);
    await logSelected('#estName', '屋苑');
    await page.waitForTimeout(2000);

    await selectPhaseIfAny();

    if (propertyData.block) {
      console.log(`👇 [Citi] 座數: ${propertyData.block}`);
      await waitReady('#bckBuilding');
      await selectByScore('#bckBuilding', propertyData.block);
      await logSelected('#bckBuilding', '座數');
      await page.waitForTimeout(2000);
    }

    if (propertyData.floor) {
      console.log(`👇 [Citi] 樓層: ${propertyData.floor}`);
      await waitReady('#floor');
      await selectByScore('#floor', propertyData.floor);
      await logSelected('#floor', '樓層');
      await page.waitForTimeout(2000);
    }

    if (propertyData.unit) {
      console.log(`👇 [Citi] 單位: ${propertyData.unit}`);
      await waitReady('#flatUnit');
      await selectByScore('#flatUnit', String(propertyData.unit).toUpperCase());
      await logSelected('#flatUnit', '單位');
      await page.waitForTimeout(2000);
    }

    console.log('🔘 [Citi] 點擊進行物業估價...');
    await page.evaluate(() => {
      const banner = document.querySelector('#onetrust-banner-sdk');
      if (banner) banner.remove();
      document.querySelectorAll('footer, .cmp-container').forEach(el => el.remove());
    });

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const submitBtn = page.getByText('進行物業估價', { exact: false }).last();
    const box = await submitBtn.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.waitForTimeout(500);
      await page.mouse.down();
      await page.mouse.up();
    } else {
      console.warn('⚠️ [Citi] 找不到估價按鈕座標，略過物理點擊');
    }

    await page.waitForTimeout(3000);
    const hasResult = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes('估值') || text.includes('估價');
    });
    if (!hasResult) {
      await page.evaluate(() => {
        const targets = Array.from(document.querySelectorAll('a, button, div'));
        const target = targets.find(el => (el.textContent || '').includes('進行物業估價'));
        if (target) target.click();
      });
    }

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
      if (!lead || !lead.address) {
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
      console.log(`\n🎯 處理 Lead #${lead.row}: ${lead.address}`);
      const propertyData = parseAddress(lead.address);
      console.log(`   解析: Block=${propertyData.block}, Floor=${propertyData.floor}, Unit=${propertyData.unit}`);

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
          dbsBrowser = await chromium.launch({ headless: false, slowMo: 100 });
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
  scrapeHangSengValuation,
  parseAddress
};