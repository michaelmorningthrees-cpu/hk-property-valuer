import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { district, estate } = req.query;

  if (!district || !estate) {
    return res.status(400).json({ error: 'Missing district or estate' });
  }

  try {
    const dataDir = path.join(process.cwd(), 'data');
    const files = ['hsbc.json', 'citi.json', 'dbs.json', 'hangseng.json']; 
    
    let blockMap = new Map();

    // 1. 輔助函數：中文數字轉阿拉伯數字
    const cnMap = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };
    const toNum = (s) => String(s).replace(/[一二三四五六七八九十]/g, m => cnMap[m]);

    // 2. 輔助函數：屋苑名稱標準化
    const normalizeName = (str) => {
      if (!str) return '';
      let s = String(str).replace(/\s+/g, '').replace(/[（(].*?[）)]/g, ''); 
      const map = {'厦':'廈', '邨':'村', '台':'臺', '花园':'花園', '滙':'匯', '汇':'匯'};
      s = s.replace(/[厦邨台花园滙汇]/g, char => map[char] || char);
      return s.toUpperCase();
    };

    const targetEstateNorm = normalizeName(estate);

    // 3. 遍歷檔案
    files.forEach(file => {
      try {
        const filePath = path.join(dataDir, file);
        if (!fs.existsSync(filePath)) return;

        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        jsonData.forEach(item => {
          // ============================================================
          // [修復 1] 嚴格執行地區檢查
          // ============================================================
          // 必須 normalize 後比對，避免 "Cheung Sha Wan" vs "CheungShaWan"
          if (item.district) {
             const d1 = normalizeName(item.district);
             const d2 = normalizeName(district);
             // 如果地區名稱長度夠長且不匹配，直接跳過
             if (d1.length > 1 && d2.length > 1 && d1 !== d2 && !d1.includes(d2) && !d2.includes(d1)) {
                 return;
             }
          }

          const itemEstateNorm = normalizeName(item.name || item.estate); 
          
          // ============================================================
          // [修復 2] 嚴格匹配邏輯 (防止空字串災難)
          // ============================================================
          // 1. 確保 itemEstateNorm 不是空值 (否則 includes 會永遠 true)
          // 2. 移除 `target.includes(item)` (反向包含)，避免 User搜 "Grand Yoho" 誤中 "Yoho"
          // 3. 只允許: 完全相等 OR 銀行名稱包含User輸入 (e.g. Bank="太古城中心" includes User="太古城")
          if (itemEstateNorm && itemEstateNorm.length > 1) {
            if (itemEstateNorm === targetEstateNorm || itemEstateNorm.includes(targetEstateNorm)) {
              
              // C. 提取座數
              let rawBlockName = item.block || item.block_name || item.label; 

              // ============================================================
              // [修復 3] 過濾垃圾數據
              // ============================================================
              if (rawBlockName) {
                const cleanRaw = String(rawBlockName).trim();
                const upperRaw = cleanRaw.toUpperCase();

                // 過濾無效關鍵字
                if (['--', 'N/A', 'NULL', 'UNDEFINED'].includes(upperRaw)) return;
                
                // 過濾看起來像地址的座數 (例如 "33號銅鑼灣道")
                if (cleanRaw.includes('號') && cleanRaw.length > 5) return;

                // 過濾「座數名稱」等於「屋苑名稱」的情況 (這通常代表單幢，稍後會由單幢邏輯處理，不要加進列表)
                // 例如: Yoo Residence 的座數叫 "Yoo Residence" -> 過濾
                if (normalizeName(cleanRaw) === targetEstateNorm) return;

                // --- 核心提取邏輯 ---
                const numStr = toNum(cleanRaw);
                const phaseMatch = numStr.match(/(?:Phase|期)\s*([0-9A-Z]+)/i);
                const blockMatch = numStr.match(/(?:Block|Tower|座)\s*([0-9A-Z]+)/i);

                let uniqueKey = '';
                let displayName = '';

                if (phaseMatch && blockMatch) {
                    const p = phaseMatch[1];
                    const b = blockMatch[1];
                    uniqueKey = `P${p}B${b}`; 
                    displayName = `第${p}期 第${b}座`;
                } else if (phaseMatch && !blockMatch) {
                    const p = phaseMatch[1];
                    uniqueKey = `P${p}`;
                    displayName = `第${p}期`;
                } else if (!phaseMatch && blockMatch) {
                    const b = blockMatch[1];
                    uniqueKey = `B${b}`;
                    displayName = `第${b}座`;
                } else {
                    // 非標準命名 (例如 "海景閣")
                    // 這裡加個長度檢查，太長的可能是雜訊
                    if (cleanRaw.length > 10 && !cleanRaw.includes('閣') && !cleanRaw.includes('樓') && !cleanRaw.includes('大廈')) {
                        return; 
                    }
                    uniqueKey = cleanRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                    displayName = cleanRaw;
                }

                if (uniqueKey && !blockMap.has(uniqueKey)) {
                    blockMap.set(uniqueKey, displayName);
                }
              }
            }
          }
        });

      } catch (e) {
        console.error(`Error reading ${file}:`, e);
      }
    });

    let result = Array.from(blockMap.values());

    // 5. 排序
    result.sort((a, b) => {
      const extractNum = (str) => {
          const match = str.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
      };
      const numA = extractNum(a);
      const numB = extractNum(b);
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b, 'zh-HK');
    });

    // 6. 單幢判斷
    let isSingleBlock = false;
    if (result.length === 0) {
        // 如果完全找不到座數，默認為單幢
        isSingleBlock = true;
    } else if (result.length === 1) {
        isSingleBlock = true;
    } 

    if (isSingleBlock) {
      // 就算 result 是空，或者只有一個怪名，都統一回傳這個，觸發 Scraper 自動選擇
      result = ['單幢 / 無座數'];
    }

    res.status(200).json({ blocks: result });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch blocks' });
  }
}