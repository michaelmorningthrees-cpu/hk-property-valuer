require('dotenv').config({ path: '.env.local' });
const axios = require('axios');
const qs = require('querystring');

// ── Payload（直接從 Network > Payload 複製）──────────────────────────────
// inputBean.captcha 故意填入錯誤值，測試後端是否有做 server-side 驗證
const payload = qs.stringify({
  'inputBean.area':        'HK',
  'inputBean.district':    'HKCB',
  'inputBean.building':    'HKCB 0000024400000901',
  'inputBean.estatePhase': '',
  'inputBean.block':       '',
  'inputBean.floor':       '003',
  'inputBean.street':      '',
  'inputBean.streetNo':    '',
  'inputBean.flatRoom':    '000A',
  'inputBean.unitType':    'building',
  'inputBean.captcha':     '1234',          // ← 故意填錯，測試是否有驗證
  't':                     Date.now(),       // timestamp
});

// ── Headers（直接從 Network > Headers 複製）─────────────────────────────
const headers = {
  'Accept':           'application/json, text/javascript, */*; q=0.01',
  'Accept-Language':  'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Content-Type':     'application/x-www-form-urlencoded; charset=UTF-8',
  'Origin':           'https://www.bochk.com',
  'Referer':          'https://www.bochk.com/whk/form/freePropertyValuation/freePropertyValuation-input.action',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent':       'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36',
  // ⚠️ Cookie 含有效 JSESSIONID（從 Network 面板複製），過期需重新獲取
  'Cookie': 'FontSize=0; _gcl_au=1.1.1523876091.1774739018; _ga=GA1.1.883078700.1774739018; JSESSIONID=0000NPAJgi8v0OYkFiOSibuGYLH:-1; lang=zh_HK; _ga_3KBF7CGYMH=GS2.1.s1774756968$o2$g1$t1774758881$j60$l0$h0',
};

async function testBochkCaptcha() {
  console.log('📤 發送 POST 請求到中銀估價 API...');
  console.log(`   inputBean.captcha = "1234" (故意填錯)`);
  console.log('─'.repeat(60));

  try {
    const response = await axios.post(
      'https://www.bochk.com/whk/form/freePropertyValuation/freePropertyValuation-valuation.action',
      payload,
      { headers, timeout: 15000 }
    );

    console.log(`✅ HTTP 狀態碼: ${response.status}`);
    console.log('📥 回應內容 (response.data):');
    console.log(JSON.stringify(response.data, null, 2));

    // 快速判斷結果
    const data = response.data;
    if (typeof data === 'string' && data.includes('驗證碼')) {
      console.log('\n🔒 結論：後端有做 server-side 驗證碼檢查（返回錯誤訊息）');
    } else if (data && (data.valuation || data.value || data.price || data.amount)) {
      console.log('\n🎉 結論：後端無驗證碼檢查，直接返回估價數據！可繞過 CAPTCHA');
    } else {
      console.log('\n❓ 結論：回應格式未知，請自行分析上方 response.data');
    }

  } catch (error) {
    if (error.response) {
      console.error(`❌ HTTP 錯誤: ${error.response.status}`);
      console.error('回應內容:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ 請求失敗:', error.message);
    }
  }
}

testBochkCaptcha();
