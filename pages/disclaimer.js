import Head from 'next/head'
import Link from 'next/link'

export default function Disclaimer() {
  return (
    <>
      <Head>
        <title>免責聲明 - HK Property Valuer</title>
        <meta name="description" content="HK Property Valuer 免責聲明" />
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
        <main className="flex-grow flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="w-full max-w-3xl">
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
              <div className="space-y-6">
                <h2 className="text-deep-navy text-2xl sm:text-3xl lg:text-4xl font-bold">
                  免責聲明
                </h2>
                
                <div className="prose prose-sm sm:prose-base max-w-none">
                  <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                    本網站提供的物業估價僅供參考，並不構成任何法律建議、要約或正式估價報告。所有數據均源自各大銀行公開估價系統及市場成交紀錄，最終按揭審批結果以銀行最終決定為準。本站不對因使用此數據而導致的任何損失負責。
                  </p>
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
