require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
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

      for (const option of options) {
        const text = await option.innerText();
        if (text.includes('請選擇') || text.includes('Select')) continue;

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

async function updateValuation(row, { citiPrice = null, hangSengPrice = null, status = 'completed' } = {}) {
  try {
    await axios.post(process.env.GOOGLE_SCRIPT_URL, {
      action: 'updateValuation',
      row: row,
      citiPrice: citiPrice,
      hsbcPrice: hangSengPrice,
      status: status,
      token: process.env.GS_SECRET_TOKEN
    }, { timeout: 30000 });
    console.log(`✅ 更新成功: Citi=${citiPrice} | HangSeng=${hangSengPrice}`);
  } catch (error) {
    console.error('❌ 更新失敗:', error.message);
  }
}

async function startWorker() {
  console.log('🔄 啟動背景工作器 (Hang Seng Mode)...');
  if (!process.env.GOOGLE_SCRIPT_URL) {
    console.error('❌ 缺少 GOOGLE_SCRIPT_URL');
    process.exit(1);
  }

  while (true) {
    try {
      console.log('\n📊 [Worker] 檢查待處理 Leads...');
      const leads = await getPendingLeads();

      if (!leads || leads.length === 0) {
        console.log('[Worker] 無待處理項目，休眠 60 秒...');
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }

      const lead = leads[0];
      console.log(`\n🎯 處理 Lead #${lead.row}: ${lead.address}`);
      const propertyData = parseAddress(lead.address);
      console.log(`   解析: Block=${propertyData.block}, Floor=${propertyData.floor}, Unit=${propertyData.unit}`);

      let citiValuation = null;
      let hangSengValuation = null;
      try {
        hangSengValuation = await scrapeHangSengValuation(propertyData);
      } catch (e) {
        console.log(`⚠️ Hang Seng 失敗: ${e.message}`);
      }

      if (hangSengValuation || citiValuation) {
        await updateValuation(lead.row, {
          citiPrice: citiValuation,
          hangSengPrice: hangSengValuation,
          status: 'completed'
        });
      } else {
        await updateValuation(lead.row, { status: 'failed' });
      }

      console.log('[Worker] 休息 30 秒...');
      await new Promise(r => setTimeout(r, 30000));
    } catch (error) {
      console.error('❌ Worker 錯誤:', error);
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
