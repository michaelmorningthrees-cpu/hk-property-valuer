import Head from 'next/head'
import Link from 'next/link'

export default function Privacy() {
  return (
    <>
      <Head>
        <title>私隱政策 - HK Property Valuer</title>
        <meta name="description" content="HK Property Valuer 私隱政策 - 我們承諾遵守香港《個人資料（私隱）條例》" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-light-gray flex flex-col">
        {/* Header */}
        <header className="w-full py-4 px-4 sm:px-6 lg:px-8 bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-deep-navy rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">HK</span>
              </div>
              <h1 className="text-deep-navy text-lg sm:text-xl font-semibold">HK Property Valuer</h1>
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-grow px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8 lg:p-10">
              {/* Back Button */}
              <Link
                href="/"
                className="inline-flex items-center text-gray-600 hover:text-deep-navy mb-6 text-sm transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                返回首頁
              </Link>

              {/* Content */}
              <div className="space-y-8">
                <h2 className="text-deep-navy text-2xl sm:text-3xl lg:text-4xl font-bold">
                  私隱政策
                </h2>
                
                <div className="prose prose-sm sm:prose-base lg:prose-lg max-w-none prose-headings:text-deep-navy prose-p:text-gray-700 prose-strong:text-deep-navy">
                  
                  {/* 承諾 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      我們的承諾
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      HK Property Valuer（「我們」或「本公司」）承諾遵守香港《個人資料（私隱）條例》（第 486 章）（「條例」）的規定，並致力保護用戶的個人資料私隱。我們會以負責任的態度處理所有收集到的個人資料，確保資料的安全性和保密性。
                    </p>
                  </section>

                  {/* 資料收集 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      資料收集
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      為提供物業估價服務，我們會收集以下個人資料：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li><strong className="text-deep-navy">物業地址</strong>：用於查詢和生成物業估價報告</li>
                      <li><strong className="text-deep-navy">電郵地址</strong>：用於發送估價報告及相關服務資訊</li>
                      <li><strong className="text-deep-navy">查詢目的</strong>：了解你的查詢用途（如出售、再融資、購買等），以便提供更準確的服務</li>
                    </ul>
                    <p className="text-gray-700 leading-relaxed mt-4">
                      我們只會收集為提供服務所必需的個人資料，並會以合法和公平的方式收集。
                    </p>
                  </section>

                  {/* 資料用途 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      資料用途
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      我們會將收集到的個人資料用於以下用途：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li><strong className="text-deep-navy">製作估價報告</strong>：根據你提供的物業地址，生成並發送物業估價報告</li>
                      <li><strong className="text-deep-navy">改善服務</strong>：分析用戶需求，持續改進我們的服務質素和用戶體驗</li>
                      <li><strong className="text-deep-navy">發送樓市資訊</strong>：在取得你的明確同意後，我們可能會向你發送物業市場資訊、樓市趨勢分析等相關內容</li>
                    </ul>
                    <p className="text-gray-700 leading-relaxed mt-4">
                      除非獲得你的同意或法律要求，否則我們不會將你的個人資料用於其他用途。
                    </p>
                  </section>

                  {/* 第三方分析與追蹤 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      第三方分析與追蹤
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      我們使用第三方分析工具來了解用戶與網站的互動情況，以改善服務體驗：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
                      <li><strong className="text-deep-navy">Microsoft Clarity</strong>：記錄網頁瀏覽過程中的點擊、捲動及滑動行為，但會自動遮蔽敏感個人資料。如欲了解更多，請參閱 <a href="https://privacy.microsoft.com/zh-hk/privacystatement" target="_blank" rel="noopener noreferrer" className="text-emerald-green hover:text-emerald-700 font-medium">Microsoft 的私隱聲明</a>。</li>
                    </ul>
                  </section>

                  {/* 廣告及追蹤技術 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      廣告及追蹤技術
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      我們使用 Google Ads 及其追蹤技術（如 Google Tag 和轉換追蹤）來衡量廣告成效並改善服務。Google 會使用 Cookie（小文字檔案）來收集用戶與本網站互動的數據。這些數據幫助我們分析哪些廣告最有效，並向合適的對象展示相關內容。閣下可以透過 <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className="text-emerald-green hover:text-emerald-700 font-medium">Google 的廣告設定</a> 隨時停止 Cookie 追蹤或選擇停用個人化廣告。
                    </p>
                  </section>

                  {/* 資料披露 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      資料披露
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      我們非常重視你的個人資料私隱，並承諾：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li>除非獲得你的明確同意（例如，當你選擇申請按揭轉介服務時），否則我們<strong className="text-deep-navy">不會將你的個人資料轉售、出租或披露給任何第三方</strong></li>
                      <li>我們不會將你的個人資料用於直接促銷，除非你已明確同意接收此類資訊</li>
                      <li>在以下情況下，我們可能會披露你的個人資料：
                        <ul className="list-circle pl-6 mt-2 space-y-1">
                          <li>法律要求或法院命令</li>
                          <li>保護我們的權利、財產或安全</li>
                          <li>防止欺詐或其他非法活動</li>
                        </ul>
                      </li>
                    </ul>
                  </section>

                  {/* 資料保安 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      資料保安
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      我們採取合理和適當的技術及行政措施來保護你的個人資料，包括但不限於：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li><strong className="text-deep-navy">加密技術</strong>：使用加密技術保護資料傳輸和儲存</li>
                      <li><strong className="text-deep-navy">限制存取</strong>：只有獲授權的員工才能存取個人資料，且僅限於履行職責所需</li>
                      <li><strong className="text-deep-navy">安全措施</strong>：實施防火牆、入侵檢測系統等安全措施，防止未經授權的存取</li>
                      <li><strong className="text-deep-navy">定期檢討</strong>：定期檢討和更新安全措施，以應對新的安全威脅</li>
                    </ul>
                    <p className="text-gray-700 leading-relaxed mt-4">
                      儘管我們已採取上述措施，但請注意，互聯網上的資料傳輸並非完全安全。我們無法保證資料傳輸的絕對安全，你使用本服務即表示接受此風險。
                    </p>
                  </section>

                  {/* 用戶權利 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      用戶權利
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-4">
                      根據《個人資料（私隱）條例》，你有權：
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-gray-700">
                      <li><strong className="text-deep-navy">查閱權</strong>：要求查閱我們持有的你的個人資料</li>
                      <li><strong className="text-deep-navy">更正權</strong>：要求更正不準確或不完整的個人資料</li>
                      <li><strong className="text-deep-navy">停止接收資訊</strong>：隨時要求停止接收我們的推廣資訊或市場資訊</li>
                      <li><strong className="text-deep-navy">撤回同意</strong>：撤回你先前給予的任何同意</li>
                    </ul>
                    <p className="text-gray-700 leading-relaxed mt-4">
                      如欲行使上述權利，請透過電郵聯絡我們：<a href="mailto:michaelmorningthrees@gmail.com" className="text-emerald-green hover:text-emerald-700 font-medium">michaelmorningthrees@gmail.com</a>。我們會盡快處理你的要求，並在合理時間內回覆。
                    </p>
                  </section>

                  {/* 政策更新 */}
                  <section className="mb-8">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      政策更新
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      我們可能會不時更新本私隱政策。任何重大變更將透過本網站公布，並在適當情況下透過電郵通知你。建議你定期查閱本政策，以了解我們如何保護你的個人資料。
                    </p>
                  </section>

                  {/* 聯絡我們 */}
                  <section className="mb-8 pt-6 border-t border-gray-200">
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-semibold mb-4">
                      聯絡我們
                    </h3>
                    <p className="text-gray-700 leading-relaxed mb-2">
                      如你對本私隱政策有任何疑問、意見或要求，或希望行使你的權利，請透過以下方式聯絡我們：
                    </p>
                    <p className="text-gray-700">
                      電郵：<a href="mailto:michaelmorningthrees@gmail.com" className="text-emerald-green hover:text-emerald-700 font-medium">michaelmorningthrees@gmail.com</a>
                    </p>
                  </section>

                  {/* 最後更新日期 */}
                  <div className="pt-6 border-t border-gray-200">
                    <p className="text-gray-500 text-sm">
                      最後更新日期：{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="w-full py-6 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-100 mt-auto">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-2 sm:space-y-0 sm:space-x-6 text-sm text-gray-500 mb-4">
              <Link href="/about" className="hover:text-deep-navy transition-colors">關於我們</Link>
              <Link href="/contact" className="hover:text-deep-navy transition-colors">聯絡我們</Link>
              <Link href="/disclaimer" className="hover:text-deep-navy transition-colors">免責聲明</Link>
              <Link href="/blog" className="hover:text-deep-navy transition-colors">Blog 資訊</Link>
              <Link href="/privacy" className="hover:text-deep-navy transition-colors">私隱政策</Link>
            </div>
            <p className="text-center text-gray-400 text-xs sm:text-sm">
              © {new Date().getFullYear()} HK Property Valuer. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </>
  )
}
