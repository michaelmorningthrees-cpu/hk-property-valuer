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
  '广': '廣', '东': '東', '关': '關', '门': '門', '湾': '灣',
  '岛': '島', '区': '區', '龙': '龍', '马': '馬', '里': '里', '楼': '樓',
  '层': '層', '栋': '棟', '园': '園', '厦': '廈',
};

// ==========================================
// [新增] 香港異體字對照表 (強制統一標準)
// ==========================================
const HK_VARIANTS_MAP = {
  '峯': '峰',  // 蝶翠峯 -> 蝶翠峰
  '台': '臺', 
  '邨': '村',  // 屋邨 -> 屋村 (部分銀行混用)
  '滙': '匯',  // 滙景 -> 匯景
  '汇': '匯',
  '栢': '柏',  // 栢慧 -> 柏慧
  '恒': '恆',  // 恒生 -> 恆生
  '厦': '廈',  // 大厦 -> 大廈
  '綫': '線',  // 鐵路綫 -> 鐵路線
  '衞': '衛',  // 衞星 -> 衛星
  '着': '著',
  '涌': '涌',  // 防止 OpenCC 誤轉 "東湧"
  '湧': '涌',  // 強制轉回 涌 (東涌)
  '麪': '麵',
  '冲': '沖',
  '温': '溫'
};

function unifyCharacters(text) {
  if (!text) return '';
  let s = String(text);
  // 逐字替換
  return s.replace(/[峯台邨滙汇栢恒厦綫衞着湧麪冲温]/g, (char) => HK_VARIANTS_MAP[char] || char);
}

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

  const map = { '蓝': '藍', '湾': '灣', '号': '號', '楼': '樓', '层': '層', '座': '座','悦': '悅', '峰': '峰', '柏': '柏'};
  result = result.replace(/./g, char => map[char] || char);
  result = result.replace(/東湧/g, '東涌');

  // [新增] 最後一步：執行異體字統一
  return unifyCharacters(result); 
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

// ==========================================
// [新增] 1. 數據清洗 Helper (清洗 /, -, 四樓, 全層)
// ==========================================
function cleanInputData(str, type = 'normal') {
  if (!str) return '';
  let s = String(str).trim();

  // 🔥【關鍵修改】如果前端傳來 "單幢 / 無座數"，將其轉換為空值
  // 這會觸發 pickBestBlock 的 "Auto-pick" 邏輯：如果銀行資料庫只有一個選項，就自動選它。
  if (s === '單幢 / 無座數') return '';

  // 處理無效符號
  if (/^[\/\-\—_]+$/.test(s) || s.toUpperCase() === 'N/A') return '';
  
  // 中文數字轉阿拉伯數字
  const cnMap = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10', '地下': 'G' };
  s = s.replace(/[一二三四五六七八九十]|地下/g, m => cnMap[m]);
  
  // 移除雜質
  if (type === 'floor') s = s.replace(/樓|層|Level|\/F|F/ig, '');
  else if (type === 'unit') s = s.replace(/室|Flat|Unit|全層|Whole Floor/ig, '');
  
  // 移除空格並轉大寫
  return s.replace(/\s+/g, '').toUpperCase();
}
  
// ==========================================
// [最終版] 智能座數匹配 (支援 Phase/Block 識別)
// ==========================================
function pickBestBlock(fullBankData, estateValue, inputBlock) {
  if (!fullBankData || !estateValue) return null;
  
  // 1. 篩選該屋苑資料
  const estateBlocks = fullBankData.filter(item => item.value === estateValue);
  if (estateBlocks.length === 0) return null;

  // 情況 A: 單幢 (User 輸入空或 N/A，且銀行只有一個選項)
  const isInputEmpty = !inputBlock || inputBlock === '單幢 / 無座數' || inputBlock === 'N/A';
  if (isInputEmpty && estateBlocks.length === 1) {
    return { name: estateBlocks[0].block, value: estateBlocks[0].block_value };
  }
  if (isInputEmpty) return null;

  // ✨ 核心升級：智能標準化函數
  // 將 "第1期 -- 第1座" 轉為 "P1B1"
  // 將 "Block 5" 轉為 "B5"
  // 將 "Begonia Mansion" 轉為 "BEGONIAMANSION" (純名)
  const smartNormalize = (s) => {
    if (!s) return '';
    let str = String(s).trim().toUpperCase();
    
    // 中文數字轉阿拉伯
    const cnMap = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
    str = str.replace(/[一二三四五六七八九十]/g, m => cnMap[m]);

    // 1. 嘗試提取「期」與「座」的結構 (Pattern Matching)
    const phaseMatch = str.match(/(?:PHASE|期)\s*([0-9A-Z]+)/);
    const blockMatch = str.match(/(?:BLOCK|TOWER|座)\s*([0-9A-Z]+)/);

    if (phaseMatch && blockMatch) {
        // 命中結構：Phase X Block Y -> 轉成 PxBy
        return `P${phaseMatch[1]}B${blockMatch[1]}`;
    } else if (phaseMatch && !blockMatch) {
        // 只有期 (少見，但以防萬一)
        return `P${phaseMatch[1]}`;
    } else if (!phaseMatch && blockMatch) {
        // 只有座 -> Bx
        return `B${blockMatch[1]}`;
    } else {
        // 2. 結構提取失敗，退回「暴力清洗」模式 (針對命名大廈，如 "海景閣")
        // 移除所有符號，只留英數
        return str.replace(/[^A-Z0-9]/g, '')
                  .replace(/BLOCK|TOWER|PHASE|MANSION|COURT|BUILDING/g, ''); 
    }
  };

  // User 的輸入 (例如 Dropdown 傳來 "第1期 第1座") -> 轉成 "P1B1"
  const targetKey = smartNormalize(inputBlock);
  if (!targetKey) return null;

  // 在銀行列表尋找同樣 Key 的選項
  // 銀行資料 "Phase 1 - Tower 1" -> 轉成 "P1B1" -> ✅ MATCH!
  const match = estateBlocks.find(item => smartNormalize(item.block) === targetKey);

  return match ? { name: match.block, value: match.block_value } : null;
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

// ==========================================
// [優化] 屋苑匹配 (針對 Dropdown：標準化 + 相互包含)
// ==========================================
function pickBestEstate(data, estateName) {
  if (!estateName || data.length === 0) return null;

  // 1. 定義標準化: 統一異體字 + 去除空白 + 去除通用後綴
  // 目的：讓 "滙景" (User) 能匹配 "匯景花園" (Bank)
  const normalize = (s) => {
      // 呼叫上方定義好的 unifyCharacters (確保處理 滙/匯, 峯/峰)
      let str = unifyCharacters(String(s || '')); 
      return str.replace(/\s+/g, '')
                .replace(/[苑臺台樓閣]/g, '') // 移除中文後綴
                .replace(/GARDEN|COURT|MANSION|BUILDING|ESTATE/ig, '') // 移除英文後綴
                .toUpperCase();
  };

  const target = normalize(estateName);

  // 2. 策略 A: 完全匹配 (最理想)
  let match = data.find(item => normalize(item.name) === target);

  // 3. 策略 B: 相互包含 (Mutual Inclusion)
  // 例子：User="太古城", Bank="太古城 (海景花園)" -> 雖然不完全一樣，但包含關鍵字
  if (!match) {
    match = data.find(item => {
        const itemNorm = normalize(item.name);
        // 只要 A 包含 B，或者 B 包含 A，都算中
        return itemNorm.includes(target) || target.includes(itemNorm);
    });
  }

  return match || null;
}

function mapToBankData(propertyData) {
    const district = toTraditional(propertyData.district || '');
    const estate = toTraditional(propertyData.estate || '');
    const block = propertyData.block || ''; 
    const bankDistrict = mapDistrictToBankOption(district);
  
    // 1. 篩選候選名單
    const citiCandidates = CITI_DATA.filter(item => (!bankDistrict?.district || item.district === bankDistrict.district));
    const dbsCandidates = DBS_DATA.filter(item => (!bankDistrict?.district || item.district === bankDistrict.district));
    const haseCandidates = HASE_DATA; 
    let hsbcCandidates = HSBC_DATA.filter(item => item.district === district);
    if (hsbcCandidates.length === 0) hsbcCandidates = HSBC_DATA;
  
    // 2. 挑選最佳屋苑
    const citiEstate = pickBestEstate(citiCandidates, estate);
    const dbsEstate = pickBestEstate(dbsCandidates, estate);
    const haseEstate = pickBestEstate(haseCandidates, estate);
    const hsbcEstate = pickBestEstate(hsbcCandidates, estate);
  
    // 3. 挑選最佳座數 (傳入 Estate ID 進行查找)
    const citiBlock = citiEstate ? pickBestBlock(citiCandidates, citiEstate.value, block) : null;
    const dbsBlock = dbsEstate ? pickBestBlock(dbsCandidates, dbsEstate.value, block) : null;
    const haseBlock = haseEstate ? pickBestBlock(haseCandidates, haseEstate.value, block) : null;
    const hsbcBlock = hsbcEstate ? pickBestBlock(hsbcCandidates, hsbcEstate.value, block) : null;
  
    return {
      citi: {
        region: bankDistrict?.region,
        district: bankDistrict?.district || district,
        estate: citiEstate?.name || estate,
        estateValue: citiEstate?.value || null,
        blockValue: citiBlock?.value || null // 新增
      },
      dbs: {
        region: bankDistrict?.region,
        district: bankDistrict?.district || district,
        estate: dbsEstate?.name || estate,
        estateValue: dbsEstate?.value || null,
        blockValue: dbsBlock?.value || null // 新增
      },
      hase: {
        estate: haseEstate?.name || estate,
        estateValue: propertyData.estateId || haseEstate?.value || null,
        blockName: haseBlock?.name || null, 
        blockValue: haseBlock?.value || null // 新增
      },
      hsbc: {
        region: hsbcEstate?.region || null,
        district: hsbcEstate?.district || null,
        estate: hsbcEstate?.name || estate,
        estateValue: hsbcEstate?.value || null,
        blockValue: hsbcBlock?.value || null // 新增
      }
    };
  }

  const districtToRegion = {
    '新界/離島': [ // 改名配合 HTML Group Label
      '東涌', '屯門', '元朗', '天水圍', '粉嶺', '上水', '大埔', '沙田', '馬鞍山', '火炭', '大圍',
      '將軍澳', '西貢', '清水灣', '荃灣', '葵涌', '青衣', '深井', '青龍頭', '馬灣', '離島', '大嶼山'
    ],
    '九龍': [
      '油尖旺', '深水埗', '九龍城', '黃大仙', '觀塘', '尖沙咀', '佐敦', '油麻地', '旺角', '何文田', 
      '太子', '大角咀', '長沙灣', '荔枝角', '石硤尾', '又一村', '九龍塘', '土瓜灣', '紅磡', '啟德', 
      '橫頭磡', '鑽石山', '新蒲崗', '慈雲山', '牛池灣', '彩虹', '九龍灣', '牛頭角', '秀茂坪', '藍田', '油塘', '茶果嶺'
    ],
    '香港': [ // 改名配合 HTML Group Label
      '堅尼地城', '西營盤', '中環', '上環', '半山', '山頂', '灣仔', '銅鑼灣', '跑馬地', '黃泥涌', 
      '大坑', '渣甸山', '北角', '鰂魚涌', '太古', '太古城', '西灣河', '筲箕灣', '柴灣', '小西灣', 
      '薄扶林', '香港仔', '鴨脷洲', '南區'
    ],
  };

// ==========================================
// [更新] DBS/Cushman & Wakefield 專用區域/分區清單
// 跟據 HTML <option> value 更新，確保 100% 吻合
// ==========================================
const BANK_DISTRICT_MAP = {
  '香港': [ // HTML label="香港島"
    '堅尼地城/西營盤', '中環/上環', '半山', '山頂', '灣仔', 
    '銅鑼灣', '跑馬地/黃泥涌', '大坑/渣甸山', '北角', '鰂魚涌', 
    '太古城', '西灣河', '筲箕灣', '柴灣', '小西灣', 
    '薄扶林', '香港仔/鴨脷洲', '南區'
  ],
  '九龍': [ // HTML label="九龍"
    '尖沙咀', '佐敦', '油麻地', '旺角/何文田', '太子', 
    '大角咀', '深水埗', '長沙灣/荔枝角', '石硤尾/又一村', '九龍塘', 
    '九龍城', '土瓜灣', '紅磡', '啟德', '黃大仙/橫頭磡', 
    '鑽石山', '新蒲崗/慈雲山', '牛池灣/彩虹', '九龍灣', '牛頭角', 
    '觀塘/秀茂坪', '藍田', '油塘/茶果嶺'
  ],
  '新界/離島': [ // HTML label="新界/離島" (注意：係「/」)
    '將軍澳', '西貢/清水灣', '沙田', '馬鞍山', '火炭', 
    '大圍', '大埔', '粉嶺', '上水', '葵涌', 
    '青衣', '荃灣', '深井/青龍頭', '馬灣', '屯門', 
    '元朗/天水圍', '大嶼山/離島'
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
// 2. 爬蟲輔助函數 (Select2 Strict Match Only)
// [優化] 100% 嚴格匹配，移除模糊保底，增強文字標準化兼容性
// ==========================================

async function fillSelect2(page, containerId, targetText, label, strictMatch = true) {
  // 注意：雖然保留 strictMatch 參數以兼容舊代碼，但在本邏輯中我們主要依賴它為 true 的行為
  if (!targetText) {
    console.log(`⚠️ [HangSeng] 跳過 ${label} (無數值)`);
    return false;
  }

  // 強力標準化：移除空白、轉大寫、移除中文單位(座/樓/室/第/層/棟)、移除英文單位
 // 強力標準化：包含 異體字統一 (unifyCharacters)
 const normalize = (s) => {
  let str = String(s || '').trim();
  str = unifyCharacters(str); // <--- 加咗呢句！將「峯」轉做「峰」
  return str.replace(/\s+/g, '')
      .replace(/[座期苑樓室層棟第]/g, '')
      .replace(/BLOCK|TOWER|PHASE|FLAT|UNIT|FLOOR/ig, '')
      .toUpperCase();
};

  const targetNorm = normalize(targetText);

  try {
    console.log(`👇 [HangSeng] 正在選擇 ${label}: ${targetText} (嚴格模式: ${strictMatch})`);
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
      await page.waitForTimeout(800); 
      // 這裡不按 Enter，等待清單過濾，確保我們選的是透過比對邏輯確認過的
    } 
    
    console.log('   ...等待選項載入並嚴格比對');

    let options = [];
    for (let i = 0; i < 4; i += 1) {
      await page.waitForTimeout(800);
      options = await page.$$('.select2-results__option');
      if (options.length > 1) break;

      const firstText = options.length > 0 ? await options[0].innerText() : '';
      if (options.length === 1 && !firstText.includes('請選擇') && !firstText.includes('Select') && !firstText.includes('No results')) {
        break;
      }
      console.log(`   ⏳ 選項尚未載入，重試 (${i + 1}/4)...`);
    }

    let bestMatch = null;
    let matchedText = '';

    for (const option of options) {
      const text = await option.innerText();
      if (text.includes('請選擇') || text.includes('Select') || text.includes('No results') || text.includes('Searching')) continue;

      const optionNorm = normalize(text);

      // 🌟 100% 嚴格比對 (標準化後)
      if (optionNorm === targetNorm) {
          bestMatch = option;
          matchedText = text;
          break; // 找到完全一樣的，立即鎖定
      }
    }

    if (bestMatch) {
      console.log(`   ✅ [精確命中] "${matchedText}" (目標: "${targetText}")`);
      await bestMatch.click();
      await page.waitForTimeout(1000);
      return true;
    } else {
      console.warn(`   ❌ [匹配失敗] 找不到與 "${targetText}" (Norm: ${targetNorm}) 完全一致的選項。停止嘗試。`);
      // 列出前幾個選項供 Debug (可選)
      // for (const opt of options.slice(0, 3)) console.log(`      (參考選項: ${await opt.innerText()})`);
      
      await page.keyboard.press('Escape'); // 關閉下拉選單
      return false;
    }

  } catch (error) {
    console.error(`❌ [HangSeng] 選擇 ${label} 失敗:`, error.message);
    await page.keyboard.press('Escape');
    return false;
  }
}


// ==========================================
// 3. 爬蟲主邏輯
// [修正] 全面嚴格模式，任何欄位不準確立即停止
// ==========================================

// --- Hang Seng ---
async function scrapeHangSengValuation(propertyData) {
  let browser = null;
  try {
    console.log('🚀 [HASE] 啟動瀏覽器...');
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

    const d = propertyData.bankMap?.hase;
    const district = toTraditional(d?.district || propertyData.district || '');
    const region = getRegionByDistrict(district) || '新界/離島'; 
    const estateKeyword = toTraditional(d?.estate || propertyData.estate || '');
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

    if (!await fillSelect2(page, 'select2-areaValue-container', region, '區域', true)) return null;
    await page.waitForTimeout(800);

    if (!await fillSelect2(page, 'select2-districtValue-container', district, '分區', true)) return null;
    await page.waitForTimeout(800);

    const estateSuccess = await fillSelect2(page, 'select2-estateValue-container', estateKeyword, '屋苑', true);
    if (!estateSuccess) {
        console.warn(`❌ [HangSeng] 屋苑 "${estateKeyword}" 匹配失敗！停止估價。`);
        await browser.close();
        return null;
    }

    await page.waitForTimeout(1500);

    // 座數：嚴格模式 (修正部分)
    if (propertyData.block) {
      // 1. 嚴格守門員：檢查 JSON 是否有此座數 ID
      const haseBlockId = d?.blockValue;
      if (!haseBlockId) {
          console.warn(`❌ [HangSeng] 座數不匹配 (JSON 查無 ID: "${propertyData.block}")，跳過此銀行。`);
          await browser.close();
          return null;
      }

      // 2. 🔥 關鍵修正：只使用 blockName (如: "D座 文賀閣") 或 原輸入 (如: "D")
      // 絕對不要用 ID ("4721") 去搜尋 Select2 文字
      const targetBlockName = d?.blockName || String(propertyData.block);

      const blockSuccess = await fillSelect2(page, 'select2-blockValue-container', targetBlockName, '座數', true);
      if (!blockSuccess) {
          console.warn(`❌ [HangSeng] 座數 "${targetBlockName}" (原輸入: ${propertyData.block}) 匹配失敗！停止估價。`);
          await browser.close();
          return null;
      }
    } else {
      // 處理沒有座數的情況 (例如獨棟)
      try {
        const blockText = await page.innerText('#select2-blockValue-container');
        if (blockText.includes('請選擇') || blockText.includes('Select')) {
          console.log('ℹ️ 無座數資料，嘗試選取預設選項...');
          await page.click('#select2-blockValue-container');
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
        }
      } catch (e) {}
    }
    await page.waitForTimeout(800);

    if (!await fillSelect2(page, 'select2-floorValue-container', String(propertyData.floor || ''), '樓層', true)) {
        console.warn(`❌ [HangSeng] 樓層 "${propertyData.floor}" 匹配失敗！停止估價。`);
        await browser.close();
        return null;
    }
    await page.waitForTimeout(800);

    if (!await fillSelect2(page, 'select2-flatValue-container', String(propertyData.unit || ''), '單位', true)) {
        console.warn(`❌ [HangSeng] 單位 "${propertyData.unit}" 匹配失敗！停止估價。`);
        await browser.close();
        return null;
    }
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
// 4. DBS 估價 (嚴格匹配優化版 - 增強等待與除錯)
// [優化] 加入選項載入重試機制，並在失敗時印出可選項目
// ==========================================

// --- DBS ---
async function scrapeDBSValuation(page, propertyData) {
  const targetUrl = 'https://evalhk.cushmanwakefield.com.hk/e-valuation/DBSV2/Home/Index/cn';
  const waitAfterSelectMs = 1500;

  // 內部函數：處理 DIV 模擬的下拉選單 (嚴格模式)
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
    
    // 1. 打開選單
    try {
      await page.waitForSelector(citeSelector, { state: 'visible', timeout: 10000 });
      await page.click(citeSelector);
      await page.waitForSelector(listSelector, { state: 'visible', timeout: 10000 });
    } catch (e) {
      console.error(`❌ [DBS] 無法打開選單 ${label}`);
      return false;
    }

    // 2. 策略 A: ID 精確匹配 (最優先，最準確)
    if (targetValue) {
      const exactSelector = `${optionSelector}[selectid="${targetValue}"]`;
      const exactExists = await page.$(exactSelector);
      if (exactExists) {
        console.log(`   ✅ [DBS] ID 精確命中 ${label} (ID: ${targetValue})`);
        await exactExists.click();
        await page.waitForTimeout(waitAfterSelectMs);
        return true;
      }
    }

    // 3. 策略 B: 文字嚴格匹配 (Strict Text Match)
    let optionsText = [];
    let optionsElements = [];

    for (let i = 0; i < 5; i++) {
        optionsElements = await page.$$(optionSelector);
        optionsText = await Promise.all(optionsElements.map(o => o.innerText()));
        // 過濾掉空白選項
        optionsText = optionsText.map(t => t.trim()).filter(t => t.length > 0);
        
        if (optionsText.length > 0 && !optionsText[0].includes('Loading')) {
            break;
        }
        if (i < 4) {
            console.log(`   ⏳ [DBS] 選項載入中... (重試 ${i+1}/5)`);
            await page.waitForTimeout(1000);
        }
    }

    // 定義標準化函數
    const normalize = (s) => {
      let str = String(s || '').trim();
      str = unifyCharacters(str); // <--- 加入這行！
      return str.replace(/\s+/g, '') 
        .replace(/[座期苑樓室層棟第]/g, '') 
        .replace(/BLOCK|TOWER|PHASE|NO\.?/ig, '') 
        .toUpperCase();
    };

    const targetNorm = normalize(targetText);
    
    // 尋找完全相等的索引
    const matchIndex = optionsText.findIndex(opt => normalize(opt) === targetNorm);

    if (matchIndex !== -1) {
      const matchedText = optionsText[matchIndex];
      console.log(`   ✅ [DBS] 文字嚴格命中: "${matchedText}" (目標: "${targetText}")`);
      
      // 點擊對應索引的元素
      await optionsElements[matchIndex].click();
      await page.waitForTimeout(waitAfterSelectMs);
      return true;
    }

    // 4. 匹配失敗
    console.warn(`⚠️ [DBS] ${label} 匹配失敗！`);
    console.warn(`   👉 目標: "${targetText}" (Norm: ${targetNorm})`);
    console.warn(`   👉 現場選項: [${optionsText.join(', ')}]`);
    
    // 關閉選單
    await page.click('body').catch(() => {}); 
    return false;
  };

  try {
    await page.setExtraHTTPHeaders({ Referer: 'https://www.dbs.com.hk/' });
    console.log(`📄 [DBS] 前往估價頁: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // 🔥 [修正] 在這裡定義 d，避免下面 d is not defined
    const d = propertyData.bankMap?.dbs;

    const district = toTraditional(d?.district || propertyData.district || '');
    const estateKeyword = toTraditional(d?.estate || propertyData.estate || '');
    const bankDistrict = mapDistrictToBankOption(district);
    const area = bankDistrict?.region || getRegionByDistrict(district) || '新界/離島';
    const districtForSelect = bankDistrict?.district || district;

    // 依序執行選擇
    const s1 = await selectDivOption('divselect_area', area, '區域');
    const s2 = await selectDivOption('divselect_dist', districtForSelect, '分區');
    
    const s3 = await selectDivOption('divselect_est', estateKeyword, '屋苑', d?.estateValue || null);
    
    if (!s3) {
        console.error('❌ [DBS] 屋苑選擇失敗，中止此銀行估價');
        return null;
    }

    await page.waitForTimeout(1000);

    // 🔥 [修正] 使用定義好的 d 來獲取 blockValue
    const dbsBlockId = d?.blockValue;
    
    // 嚴格守門員
    if (propertyData.block && !dbsBlockId) {
        console.warn(`❌ [DBS] 座數不匹配 (JSON 查無 ID)，跳過。`);
        return null;
    }

    // 傳入 ID 進行選擇
    const s4 = await selectDivOption('divselect_block', propertyData.block, '座數', dbsBlockId);
    if (!s4) return null; 

    const s5 = await selectDivOption('divselect_floor', propertyData.floor, '樓層');
    if (!s5) return null; 

    const s6 = await selectDivOption('divselect_flat', propertyData.unit, '單位');
    if (!s6) return null; 

    console.log('🔘 [DBS] 點擊提交...');
    const submitBtn = page.locator('.btn-red, button, a').filter({ hasText: '提交' }).first();
    
    if (await submitBtn.isVisible()) {
        await submitBtn.click();
    } else {
        console.error('❌ [DBS] 找不到提交按鈕');
        return null;
    }

    console.log('⏳ [DBS] 等待估價結果...');
    const labelCell = page.locator('td', { hasText: '估價' }).first();
    
    try {
        await labelCell.waitFor({ state: 'visible', timeout: 15000 });
    } catch(e) {
        console.warn('⚠️ [DBS] 等待結果超時，可能估價失敗');
        return null;
    }

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

    console.warn('⚠️ [DBS] 找不到估價結果數值');
    return null;

  } catch (error) {
    console.error('❌ [DBS] 發生錯誤:', error.message);
    return null;
  }
}

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

    // --- 🛠️ 穩健選擇函數 (加入回傳值) ---
    const safeSelect = async (selector, label, text) => {
      if (!text) return false;
      console.log(`👇 正在選擇 ${label}: "${text}"...`);

      try {
        await page.waitForSelector(`${selector}:not([disabled])`, { timeout: 10000 });
        await page.waitForFunction((s) => {
            const el = document.querySelector(s);
            return el && el.options && el.options.length > 1;
        }, selector, { timeout: 10000 });
      } catch (e) {
        console.error(`   ❌ 失敗: ${label} 選單未載入或無選項`);
        return false;
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
        return true; // 成功回傳 true
      } else {
        console.warn(`   ⚠️ 找不到選項: "${text}"`);
        return false; // 失敗回傳 false
      }
    };

    // --- 填寫流程 ---
    const d = propertyData.bankMap?.citi;
    const region = (d?.region === '新界' ? '新界/離島' : d?.region) || '新界/離島';
    
    await safeSelect('#zone', '區域', region);
    await safeSelect('#district', '地區', toTraditional(d?.district || propertyData.district));
    
    // 🛑 [STOP] 嚴格檢查：屋苑
    const estateSuccess = await safeSelect('#estName', '屋苑', toTraditional(d?.estate || propertyData.estate));
    if (!estateSuccess) {
        console.warn(`❌ [Citi] 屋苑匹配失敗！停止估價。`);
        await browser.close();
        return null;
    }
    
    if (await page.isVisible('#phase')) {
        await page.waitForTimeout(500);
        const opts = await page.$$eval('#phase option', o => o.length);
        if (opts > 1) {
            await page.selectOption('#phase', { index: 1 });
            await page.waitForTimeout(500);
        }
    }
    
// ============================================================
    // 1. 處理期數 (Phase) - 優化：加入 N/A 兼容
    // ============================================================
    if (await page.isVisible('#phase')) {
      await page.waitForTimeout(500);

      // 嘗試從輸入 (e.g. "第1期") 提取期數數字
      const inputStr = String(propertyData.block || '');
      const phaseMatch = inputStr.match(/(?:Phase|期|P)\s*([0-9A-Z]+)/i);
      const targetPhase = phaseMatch ? phaseMatch[1] : null;

      // 獲取網頁上所有期數選項
      const phaseOptions = await page.$$eval('#phase option', opts =>
        opts.map(o => ({ val: o.value, text: o.innerText.trim() }))
      );

      let phaseSelected = false;

      // 策略 A: 嘗試匹配輸入的期數 (e.g. "1" -> "Phase 1")
      if (targetPhase) {
        const match = phaseOptions.find(o => o.text.includes(targetPhase));
        if (match) {
          await page.selectOption('#phase', match.val);
          phaseSelected = true;
        }
      }

      // 策略 B: (優化部分) 如果找不到，試下選 "N/A" (針對太湖花園等)
      if (!phaseSelected) {
        const naOption = phaseOptions.find(o => o.text === 'N/A' || o.text === 'n/a');
        if (naOption) {
          console.log(`      ⚠️ [Citi] 找不到期數，但發現 "N/A"，強制選取...`);
          await page.selectOption('#phase', naOption.val);
          phaseSelected = true;
        }
      }

      // 策略 C: 盲選第一項
      if (!phaseSelected && phaseOptions.length > 1) {
        await page.selectOption('#phase', { index: 1 });
        phaseSelected = true;
      }

      // 觸發刷新
      if (phaseSelected) {
        await page.evaluate(() => {
          const el = document.querySelector('#phase');
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        await page.waitForTimeout(2000); // 等待座數載入
      }
    }

    // ============================================================
    // 2. 處理座數 (Block) - 保留 Match ID 優先
    // ============================================================
    if (propertyData.block) {
      const citiBlockId = d?.blockValue; // 從 JSON 獲取 ID
      let blockSuccess = false;

      // 策略 A: (保留原邏輯) 優先嘗試用 JSON ID 選擇
      if (citiBlockId && citiBlockId !== 'null' && citiBlockId !== 'N/A') {
        try {
          console.log(`   🎯 [Citi] 嘗試使用 JSON ID: ${citiBlockId}`);
          await page.selectOption('#bckBuilding', citiBlockId);
          await page.evaluate(() => document.querySelector('#bckBuilding').dispatchEvent(new Event('change', { bubbles: true })));
          blockSuccess = true;
          console.log(`   ✅ [Citi] ID 命中座數`);
        } catch (e) {
          console.warn('      ...JSON ID 選擇失敗，轉用文字匹配');
        }
      }

      // 策略 B: (優化部分) 文字匹配 - 徹底清洗期數
      if (!blockSuccess) {
        let cleanBlock = String(propertyData.block);
        
        // 🔥 步驟 1: 先剷除中文格式 "第X期" (e.g. "第1期")
        cleanBlock = cleanBlock.replace(/第\s*[0-9A-Z]+\s*期/gi, '');
        
        // 🔥 步驟 2: 再剷除英文格式 "Phase X" 或 "P X"
        cleanBlock = cleanBlock.replace(/(?:Phase|P)\s*[0-9A-Z]+/gi, '');
        
        // 步驟 3: 清理頭尾空白及連接符
        cleanBlock = cleanBlock.replace(/[\-\s]+/, '').trim();

        // 提取核心數字 (e.g. "第5座" -> "5")
        const coreBlock = cleanBlock.replace(/[^0-9A-Z]/g, '');

        console.log(`   👇 [Citi] 嘗試文字匹配座數: "${cleanBlock}" (Core: "${coreBlock}")`);

        // 試 1: 完整中文 "第5座"
        blockSuccess = await safeSelect('#bckBuilding', '座數', cleanBlock);

        // 試 2: 核心數字 "5" (Citi 列表通常係 "1", "2", "3" 或 "Block 1")
        if (!blockSuccess && coreBlock) {
          blockSuccess = await safeSelect('#bckBuilding', '座數', coreBlock);
        }
      }

      if (!blockSuccess) {
        console.warn(`❌ [Citi] 座數匹配失敗 (Input: ${propertyData.block})，跳過。`);
        await browser.close();
        return null;
      }
    }
    

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

async function scrapeHSBCValuation(propertyData) {
  let browser = null;
  try {
    console.log('🚀 [HSBC] 啟動瀏覽器 (JSON ID 驅動模式)...');

    browser = await chromium.launch({
      headless: false,
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
      const type = response.request().resourceType();
      if (type === 'xhr' || type === 'fetch') {
        try {
          const json = await response.json();
          const str = JSON.stringify(json);
          if (str.includes('propertyValuation') || str.includes('valuationAmount') || str.includes('netPrice')) {
             const match = str.match(/("valuationAmount"|"netPrice"|"propertyValuation"|"price")\s*[:=]\s*"?([\d,]+(\.\d+)?)"?/i);
             if (match) {
                 const val = Number(match[2].replace(/,/g, ''));
                 if (val > 100000) {
                     console.log(`   💰 [API] 鎖定價格: ${val}`);
                     capturedPrice = val;
                 }
             }
          }
        } catch (e) {}
      }
    });

    const targetUrl = 'https://www.hsbc.com.hk/zh-hk/mortgages/tools/property-valuation/';
    console.log(`📄 [HSBC] 前往: ${targetUrl}`);
    
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
        const closeBanner = page.locator('.notification-close, [aria-label="Close"], .icon-close').first();
        if (await closeBanner.isVisible({ timeout: 5000 })) {
            await closeBanner.click();
            await page.waitForTimeout(500);
        }
    } catch (e) {}

    console.log('⏳ 等待表單載入...');
    try {
        await page.waitForSelector('.selectize-input', { state: 'visible', timeout: 30000 });
    } catch(e) {
        console.error('❌ 表單載入超時');
        await browser.close();
        return null;
    }

    // --- 🛠️ 智能選擇函數 (加入回傳值) ---
    const selectizePick = async (index, label, rawText, valueId = null) => {
        // ✨ 修正點 1: 強制將 rawText 轉為字串，避免數字導致 crash
        const text = rawText !== null && rawText !== undefined ? String(rawText) : '';

        if (!text && !valueId) return false;
        
        console.log(`👇 正在選擇 [${label}]: ${text} ${valueId ? `(ID: ${valueId})` : ''}`);
        
        const control = page.locator('.selectize-control').nth(index);
        const inputDiv = control.locator('.selectize-input');

        await control.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -150)); 

        try {
            await page.waitForFunction(
                (el) => !el.querySelector('.selectize-input').classList.contains('loading'),
                await control.elementHandle(),
                { timeout: 10000 }
            );
        } catch(e) {}

        await inputDiv.click();
        await page.waitForTimeout(800);

        let success = false;

        // 策略 A: ID 點擊
        if (valueId) {
            success = await page.evaluate((val) => {
                const visibleDropdowns = Array.from(document.querySelectorAll('.selectize-dropdown-content'))
                    .filter(el => el.offsetParent !== null);
                
                for (const dd of visibleDropdowns) {
                    const option = dd.querySelector(`.option[data-value="${val}"]`);
                    if (option) {
                        option.click();
                        return true;
                    }
                }
                return false;
            }, valueId);

            if (success) console.log(`   ✅ [精確命中] ID: ${valueId}`);
        }

        // 策略 B: 文字輸入
        if (!success) {
            if (!valueId && text) {
                console.log(`   ⌨️ 輸入文字篩選: "${text}"`);
                // ✨ 修正點 2: 這裡的 text 已經確保是 String 了
                await page.keyboard.type(text, { delay: 100 });
                await page.waitForTimeout(1000);
            }
            
            success = await page.evaluate((txt) => {
                const visibleDropdowns = Array.from(document.querySelectorAll('.selectize-dropdown-content'))
                    .filter(el => el.offsetParent !== null);

                for (const dd of visibleDropdowns) {
                    const options = Array.from(dd.querySelectorAll('.option'));
                    const match = options.find(opt => opt.innerText.includes(txt));
                    if (match) {
                        match.click();
                        return true;
                    }
                }
                return false;
            }, text);

            if (success) {
                console.log(`   ✅ [文字命中] "${text}"`);
            } else {
                console.log(`   ⚠️ 無法匹配，嘗試按 Enter...`);
                await page.keyboard.press('Enter');
            }
        }

        await page.waitForTimeout(1000);
        return success; // 回傳成功與否
    };

    // --- 填寫流程 ---
    
    const d = propertyData.bankMap?.hsbc || {};
    
    // 1. 區域
    const regionText = d.region || (getRegionByDistrict(propertyData.district) || '新界').replace('/離島', '');
    await selectizePick(0, '區域', regionText);
    
    // 2. 分區
    const districtText = d.district || propertyData.district;
    await selectizePick(1, '分區', districtText);
    
    // 3. 屋苑
    // 🛑 [STOP] 嚴格檢查：屋苑
    const estateSuccess = await selectizePick(2, '屋苑', d.estate || propertyData.estate, d.estateValue);
    if (!estateSuccess) {
        console.warn(`❌ [HSBC] 屋苑匹配失敗！停止估價。`);
        await browser.close();
        return null;
    }

    // 4. 座數 (✨ 修正點: 強制轉 String)
    if (propertyData.block) {
        const hsbcBlockId = d.blockValue;
        if (!hsbcBlockId) {
             console.warn(`❌ [HSBC] 座數不匹配 (JSON 查無 ID)，跳過。`);
             await browser.close();
             return null;
        }
        // 第4個參數傳入 ID
        await selectizePick(3, '座數', String(propertyData.block), hsbcBlockId);
    }

    // 5. 樓層 (✨ 修正點: 強制轉 String)
    if (propertyData.floor) {
        await selectizePick(4, '樓層', String(propertyData.floor));
    }

    // 6. 單位
    if (propertyData.unit) {
        await selectizePick(5, '單位', String(propertyData.unit).toUpperCase());
    }

    // --- 提交 ---
    console.log('🔘 [HSBC] 點擊估價...');
    const btn = page.locator('a.search-button').first();
    
    if (await btn.isVisible()) {
         const box = await btn.boundingBox();
         if (box) {
             await page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 10 });
             await page.waitForTimeout(200);
             await page.mouse.down();
             await page.waitForTimeout(100);
             await page.mouse.up();
         } else {
             await btn.click();
         }
    } else {
        console.error('❌ 找不到估價按鈕');
    }

    console.log('⏳ [HSBC] 等待結果顯示...');

    // 1. 優先檢查 API 是否已攔截到
    const startTime = Date.now();
    while (!capturedPrice && Date.now() - startTime < 10000) {
        await page.waitForTimeout(500);
    }

    if (capturedPrice) {
        console.log(`✅ [HSBC] API 攔截成功: ${capturedPrice}`);
        await browser.close();
        return capturedPrice;
    }

    // 2. 嘗試讀取頁面數值 (DOM Parsing)
    console.log('🔍 [HSBC] 嘗試讀取頁面數值...');
    try {
        await page.waitForFunction(() => {
            return /[\d,]{7,}/.test(document.body.innerText);
        }, { timeout: 5000 });
    } catch (e) {}

    const bodyText = await page.innerText('body');
    let foundPrice = null;

    // 策略 A: Regex 匹配常見格式
    const patterns = [
        /(?:港幣估價|物業價值|Valuation)\s*[:：]?\s*(?:HKD|\$)?\s*([0-9,]{6,})/i,
        /港幣\s*([0-9,]{6,})/i,
        /([0-9,]{6,})\s*\(港元\)/
    ];

    for (const pattern of patterns) {
        const match = bodyText.match(pattern);
        if (match && match[1]) {
            const num = Number(match[1].replace(/,/g, ''));
            if (num > 800000) {
                foundPrice = num;
                console.log(`✅ [HSBC] 文字匹配成功: ${num}`);
                break;
            }
        }
    }

    // 策略 B: 尋找頁面上最大的純數字 (通常是房價)
    if (!foundPrice) {
        try {
            const potentialPrices = await page.$$eval('*', (els) => {
                return els.map(el => el.innerText)
                          .filter(t => /^[0-9,]{6,}$/.test(t.trim()))
                          .map(t => Number(t.replace(/,/g, '')));
            });
            const maxVal = Math.max(...potentialPrices);
            if (maxVal > 800000 && isFinite(maxVal)) {
                 foundPrice = maxVal;
                 console.log(`✅ [HSBC] 最大數值匹配成功: ${foundPrice}`);
            }
        } catch (e) {}
    }

    if (foundPrice) {
        await browser.close();
        return foundPrice;
    } else {
        console.log('⚠️ [HSBC] 頁面已顯示但無法提取數值');
        await page.screenshot({ path: 'hsbc-read-fail.png', fullPage: true });
        console.log('📄 Body Snapshot:', bodyText.substring(0, 200).replace(/\n/g, ' '));
    }

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
        // 🔥 修改這三行：加入清洗功能
        block: cleanInputData(lead.block || parsed.block || ''),
        floor: cleanInputData(lead.floor || parsed.floor || '', 'floor'),
        unit: cleanInputData(lead.flat || lead.unit || parsed.unit || '', 'unit')
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