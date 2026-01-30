import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { district } = req.query;

  if (!district) {
    return res.status(400).json({ error: 'District is required' });
  }

  try {
    const dataDir = path.join(process.cwd(), 'data');
    const files = ['hsbc.json', 'hangseng.json', 'citi.json', 'dbs.json'];
    let rawList = [];

    // 1. 讀取所有檔案
    files.forEach(file => {
      try {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
          const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          // 初步篩選地區
          const filtered = jsonData.filter(item => item.district === district);
          rawList = [...rawList, ...filtered];
        }
      } catch (e) {
        console.error(`⚠️ Error reading ${file}:`, e.message);
      }
    });

    // 2. 異體字/簡體字轉換表 (確保 "大厦" == "大廈")
    const toTraditional = (str) => {
      const map = {
        '厦': '廈', '邨': '村', '台': '臺', '花园': '花園', '中心': '中心',
        '（': '(', '）': ')', '　': ' ' // 全形括號/空格轉半形
      };
      return str.replace(/[厦邨台（）　]/g, char => map[char] || char);
    };

    // 3. 超級清洗函數
    const normalizeName = (name) => {
      if (!name) return '';
      
      // A. Unicode 標準化 (解決編碼差異)
      let s = String(name).normalize('NFKC');
      
      // B. 統一繁體/半形符號
      s = toTraditional(s);

      // C. 移除地區後綴 (例如 " - 堅尼地城")
      if (district) {
          // 轉義 Regex 特殊字符
          const escapedDistrict = district.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // 移除結尾的地區名，容許前面有空格或橫線
          const districtRegex = new RegExp(`[\\s\\-]*${escapedDistrict}$`, 'i');
          s = s.replace(districtRegex, '');
      }

      // D. 移除所有隱形字符 (Zero-width)
      s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
      
      return s.trim();
    };

    // 4. 智能去重 (兩階段)
    
    // 階段一：精確名稱合併 (Merge Exact Name)
    // 使用 Map，Key 為「顯示名稱」。如果 Key 一樣，則視為同一個屋苑。
    const mergedMap = new Map();

    rawList.forEach(item => {
      if (!item.name) return;
      
      const cleanDisplayName = normalizeName(item.name);
      if (!cleanDisplayName) return;

      // 產生一個「指紋 Key」用來比對 (移除所有標點和空格，轉大寫)
      // 這能解決 "海昇大廈" vs "海昇 大廈" 的問題
      const fingerprint = cleanDisplayName.replace(/[\s\(\)\-\.]/g, '').toUpperCase();

      // 如果這個指紋還沒出現過，或者新的名字比舊的短 (更乾淨)，就更新 Map
      // 我們使用指紋來 Check 重複，但 Map 的 Value 存的是乾淨的 Display Name
      if (!mergedMap.has(fingerprint)) {
        mergedMap.set(fingerprint, {
          name: cleanDisplayName,
          id: item.value || ''
        });
      } else {
        const existing = mergedMap.get(fingerprint);
        // 如果新名字比舊名字短 (例如 "怡峰" vs "怡峰(高街)")，用短的取代舊的
        if (cleanDisplayName.length < existing.name.length) {
           mergedMap.set(fingerprint, {
             name: cleanDisplayName,
             id: item.value || existing.id
           });
        }
      }
    });

    // 階段二：變種過濾 (Variation Filtering)
    // 解決 "樂信大廈" vs "樂信大廈 (水街)" 這種指紋不同但其實重複的情況
    
    // 轉成 Array 並按長度排序 (短在前)
    let candidates = Array.from(mergedMap.values());
    candidates.sort((a, b) => a.name.length - b.name.length);

    const finalResult = [];
    
    candidates.forEach(item => {
      // 檢查這個名字是否已經是 finalResult 裡某個名字的「長變種」
      // 例如：如果 "樂信大廈" 已經在 finalResult
      // 當 "樂信大廈 (水街)" 進來時，它以 "樂信大廈" 開頭，我們就 Skip 它
      const isDuplicateVariant = finalResult.some(existing => {
         return item.name.startsWith(existing.name + '(') || 
                item.name.startsWith(existing.name + ' (') ||
                item.name.startsWith(existing.name + '-');
      });

      if (!isDuplicateVariant) {
        finalResult.push(item);
      }
    });

    // 5. 最後排序：中文筆劃
    finalResult.sort((a, b) => a.name.localeCompare(b.name, 'zh-HK'));

    res.status(200).json({ estates: finalResult });

  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ error: 'Failed to fetch estates' });
  }
}