import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import EstateAutocomplete from '../components/EstateAutocomplete'

const MAX_QUOTA = 10

export default function Home() {
  const [formData, setFormData] = useState({
    district: '',
    estate: '',
    estateId: '',
    block: '',
    floor: '',
    flat: '',
    email: '',
    purpose: ''
  })
  const [isServiceActive, setIsServiceActive] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [purposeError, setPurposeError] = useState('')
  const [remainingQuota, setRemainingQuota] = useState(MAX_QUOTA)

  // Initialize daily quota from localStorage
  useEffect(() => {
    const initializeQuota = () => {
      if (typeof window === 'undefined') return

      const today = new Date().toDateString()
      const storedDate = localStorage.getItem('quotaDate')
      const storedQuota = localStorage.getItem('remainingQuota')

      // If it's a new day or no stored data, reset quota
      if (storedDate !== today || !storedQuota) {
        localStorage.setItem('quotaDate', today)
        localStorage.setItem('remainingQuota', MAX_QUOTA.toString())
        setRemainingQuota(MAX_QUOTA)
      } else {
        setRemainingQuota(parseInt(storedQuota, 10))
      }
    }

    initializeQuota()
  }, [])

  // Check Hong Kong time to determine service status
  useEffect(() => {
    const checkServiceStatus = () => {
      const now = new Date()
      // Convert to Hong Kong time (UTC+8)
      const hkTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }))
      const hours = hkTime.getHours()
      // Service is active between 09:00 and 22:00
      setIsServiceActive(hours >= 9 && hours < 22)
    }

    // Check immediately
    checkServiceStatus()

    // Check every minute to update status
    const interval = setInterval(checkServiceStatus, 60000)

    return () => clearInterval(interval)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Reset error
    setPurposeError('')

    // Validate purpose field
    if (!formData.purpose || formData.purpose === '') {
      setPurposeError('請選擇查詢目的')
      return
    }

    // Only proceed if all fields are valid
    if (!formData.district || !formData.estate || !formData.block || !formData.floor || !formData.flat || !formData.email || !formData.purpose) {
      return
    }

    setIsSubmitting(true)

    try {
      // Submit to Google Sheets via API route
      const response = await fetch('/api/valuation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Track Google Ads conversion event - HK_Valuation_Submit
        if (typeof window !== 'undefined' && window.gtag) {
          window.gtag('event', 'conversion', {
            'send_to': 'AW-17861479339/BI_iCLfbm-IbEKuXgsVC'
          })
        }
        
        // Decrease remaining quota
        const newQuota = Math.max(0, remainingQuota - 1)
        setRemainingQuota(newQuota)
        if (typeof window !== 'undefined') {
          localStorage.setItem('remainingQuota', newQuota.toString())
        }
        
        setIsSuccess(true)
      } else {
        throw new Error(data.error || 'Submission failed')
      }
    } catch (error) {
      console.error('Error submitting form:', error)
      // Show more detailed error message
      const errorMessage = error.message || '提交失敗，請稍後再試。'
      alert(`提交失敗：${errorMessage}\n\n請檢查終端機的錯誤訊息以獲取更多詳情。`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    
    setFormData({
      ...formData,
      [name]: value
    })

    // Clear error when user selects a purpose
    if (name === 'purpose' && value !== '') {
      setPurposeError('')
    }
  }

  return (
    <>
      <Head>
        <title>HK Property Valuer - 一鍵對比四大銀行估價</title>
        <meta name="description" content="只需輸入地址，30 分鐘內收到估價報告" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
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
          <div className="w-full max-w-2xl">
            {/* Hero Section */}
            <div className="text-center mb-10 sm:mb-12">
              <h2 className="text-deep-navy text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
                一鍵對比四大銀行估價
              </h2>
              <p className="text-gray-600 text-base sm:text-lg lg:text-xl max-w-xl mx-auto">
                只需輸入地址，30 分鐘內收到估價報告。
              </p>
            </div>

            {/* Form Card */}
            <div className="bg-white rounded-lg shadow-lg p-6 sm:p-8 lg:p-10 relative">
              {!isSuccess ? (
                <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
                  {/* Service Status Indicator - Above Quota Card */}
                  <div className="flex items-center justify-end space-x-2 text-xs text-gray-600 mb-2">
                    <div className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${isServiceActive ? 'bg-emerald-green animate-pulse' : 'bg-gray-400'}`}></div>
                    <span className="leading-tight">
                      {isServiceActive 
                        ? '服務中：分析師在線 | 承諾 30 分鐘內發送'
                        : '休息中：非辦公時間 | 報告將於翌日 10:30 前發送'
                      }
                    </span>
                  </div>

                  {/* Daily Quota Banner */}
                  <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-deep-navy text-sm font-semibold">
                        每日限量估價報告
                      </h4>
                      <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-emerald-green rounded-full animate-pulse"></div>
                        <span className="text-emerald-700 text-xs font-medium">
                          今日尚餘名額: {remainingQuota} 份
                        </span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-emerald-200 rounded-full h-2.5 overflow-hidden shadow-inner">
                      <div 
                        className="bg-emerald-green h-2.5 rounded-full transition-all duration-500 ease-out shadow-sm"
                        style={{ width: `${(remainingQuota / MAX_QUOTA) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* District Select */}
                  <div>
                    <label htmlFor="district" className="block text-deep-navy text-sm font-medium mb-2">
                      地區
                    </label>
                    <select
                      id="district"
                      name="district"
                      value={formData.district}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-green focus:border-emerald-green transition-colors text-gray-900 bg-white"
                      required
                      disabled={isSubmitting}
                    >
                      <option value="">請選擇區域</option>
                      <optgroup label="香港島">
                        <option value="堅尼地城/西營盤">堅尼地城 / 西營盤</option>
                        <option value="中環/上環">中環 / 上環</option>
                        <option value="半山">半山</option>
                        <option value="山頂">山頂</option>
                        <option value="灣仔">灣仔</option>
                        <option value="銅鑼灣">銅鑼灣</option>
                        <option value="跑馬地/黃泥涌">跑馬地 / 黃泥涌</option>
                        <option value="大坑/渣甸山">大坑 / 渣甸山</option>
                        <option value="北角">北角</option>
                        <option value="鰂魚涌">鰂魚涌</option>
                        <option value="太古城">太古城</option>
                        <option value="西灣河">西灣河</option>
                        <option value="筲箕灣">筲箕灣</option>
                        <option value="柴灣">柴灣</option>
                        <option value="小西灣">小西灣</option>
                        <option value="薄扶林">薄扶林</option>
                        <option value="香港仔/鴨脷洲">香港仔 / 鴨脷洲</option>
                        <option value="南區">南區 (其他)</option>
                      </optgroup>
                      <optgroup label="九龍">
                        <option value="尖沙咀">尖沙咀</option>
                        <option value="佐敦">佐敦</option>
                        <option value="油麻地">油麻地</option>
                        <option value="旺角/何文田">旺角 / 何文田</option>
                        <option value="太子">太子</option>
                        <option value="大角咀">大角咀</option>
                        <option value="深水埗">深水埗</option>
                        <option value="長沙灣/荔枝角">長沙灣 / 荔枝角</option>
                        <option value="石硤尾/又一村">石硤尾 / 又一村</option>
                        <option value="九龍塘">九龍塘</option>
                        <option value="九龍城">九龍城</option>
                        <option value="土瓜灣">土瓜灣</option>
                        <option value="紅磡">紅磡</option>
                        <option value="啟德">啟德</option>
                        <option value="黃大仙/橫頭磡">黃大仙 / 橫頭磡</option>
                        <option value="鑽石山">鑽石山</option>
                        <option value="新蒲崗/慈雲山">新蒲崗 / 慈雲山</option>
                        <option value="牛池灣/彩虹">牛池灣 / 彩虹</option>
                        <option value="九龍灣">九龍灣</option>
                        <option value="牛頭角">牛頭角</option>
                        <option value="觀塘/秀茂坪">觀塘 / 秀茂坪</option>
                        <option value="藍田">藍田</option>
                        <option value="油塘/茶果嶺">油塘 / 茶果嶺</option>
                      </optgroup>
                      <optgroup label="新界及離島">
                        <option value="將軍澳">將軍澳</option>
                        <option value="西貢/清水灣">西貢 / 清水灣</option>
                        <option value="沙田">沙田</option>
                        <option value="馬鞍山">馬鞍山</option>
                        <option value="火炭">火炭</option>
                        <option value="大圍">大圍</option>
                        <option value="大埔">大埔</option>
                        <option value="粉嶺">粉嶺</option>
                        <option value="上水">上水</option>
                        <option value="葵涌">葵涌</option>
                        <option value="青衣">青衣</option>
                        <option value="荃灣">荃灣</option>
                        <option value="深井/青龍頭">深井 / 青龍頭</option>
                        <option value="馬灣">馬灣</option>
                        <option value="屯門">屯門</option>
                        <option value="元朗/天水圍">元朗 / 天水圍</option>
                        <option value="大嶼山/離島">大嶼山 / 離島 (其他)</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Estate Name */}
                  <div>
                    <label htmlFor="estate" className="block text-deep-navy text-sm font-medium mb-2">
                      屋苑名稱
                    </label>
                    <EstateAutocomplete
                      district={formData.district}
                      value={formData.estate}
                      estateId={formData.estateId}
                      onChange={({ name, id }) => setFormData({ ...formData, estate: name, estateId: id })}
                      disabled={isSubmitting}
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      如找不到屋苑，可直接輸入自訂名稱
                    </p>
                  </div>

                  {/* Block / Floor / Flat */}
                  <div>
                    <label className="block text-deep-navy text-sm font-medium mb-2">
                      座數 / 樓層 / 單位
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="block" className="block text-xs text-gray-500 mb-1">
                          座
                        </label>
                        <input
                          type="text"
                          id="block"
                          name="block"
                          value={formData.block}
                          onChange={handleChange}
                          placeholder="座"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-green focus:border-emerald-green transition-colors text-gray-900 placeholder-gray-400"
                          required
                          disabled={isSubmitting}
                        />
                      </div>
                      <div>
                        <label htmlFor="floor" className="block text-xs text-gray-500 mb-1">
                          樓
                        </label>
                        <input
                          type="text"
                          id="floor"
                          name="floor"
                          value={formData.floor}
                          onChange={handleChange}
                          placeholder="樓"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-green focus:border-emerald-green transition-colors text-gray-900 placeholder-gray-400"
                          required
                          disabled={isSubmitting}
                        />
                      </div>
                      <div>
                        <label htmlFor="flat" className="block text-xs text-gray-500 mb-1">
                          室
                        </label>
                        <input
                          type="text"
                          id="flat"
                          name="flat"
                          value={formData.flat}
                          onChange={handleChange}
                          placeholder="室"
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-green focus:border-emerald-green transition-colors text-gray-900 placeholder-gray-400"
                          required
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Email Address Input */}
                  <div>
                    <label htmlFor="email" className="block text-deep-navy text-sm font-medium mb-2">
                      Email 地址
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="接收報告的 Email"
                      className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-green focus:border-emerald-green transition-colors text-gray-900 placeholder-gray-400"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Purpose Dropdown */}
                  <div>
                    <label htmlFor="purpose" className="block text-deep-navy text-sm font-medium mb-2">
                      目的
                    </label>
                    <select
                      id="purpose"
                      name="purpose"
                      value={formData.purpose}
                      onChange={handleChange}
                      className={`w-full px-4 py-3 border rounded-md shadow-sm focus:outline-none focus:ring-2 transition-colors text-gray-900 bg-white ${
                        purposeError 
                          ? 'border-red-500 focus:ring-red-500 focus:border-red-500' 
                          : 'border-gray-300 focus:ring-emerald-green focus:border-emerald-green'
                      }`}
                      disabled={isSubmitting}
                    >
                      <option value="" disabled>
                        請選擇目的
                      </option>
                      <option value="selling">出售</option>
                      <option value="refinancing">再融資</option>
                      <option value="purchase">購買</option>
                      <option value="other">其他</option>
                    </select>
                    {purposeError && (
                      <p className="mt-2 text-sm text-red-600">{purposeError}</p>
                    )}
                  </div>


                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || remainingQuota === 0}
                    className="w-full bg-emerald-green text-white py-3 sm:py-4 px-6 rounded-md text-base sm:text-lg font-semibold hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-green focus:ring-offset-2 transition-colors shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting 
                      ? 'Loading...' 
                      : remainingQuota === 0 
                        ? '今日名額已滿，請明天再試' 
                        : '立即獲取免費報告'
                    }
                  </button>

                  {/* Trust Note */}
                  <p className="text-gray-500 text-xs sm:text-sm text-center pt-2">
                    承諾不打擾，僅發送一次性報告。
                  </p>
                </form>
              ) : (
                /* Success Message */
                <div className="text-center space-y-6 py-4">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 bg-emerald-green rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-deep-navy text-xl sm:text-2xl font-bold mb-3">
                      Thank You!
                    </h3>
                    <p className="text-gray-600 text-base sm:text-lg mb-6">
                      估價報告將於 30 分鐘內發送到你的 Email。
                    </p>
                  </div>
                  
                  {/* Contact Information */}
                  <div className="pt-4 border-t border-gray-200">
                    <p className="text-gray-600 text-sm sm:text-base">
                      有任何疑問？歡迎透過電郵聯絡我們：
                      <a
                        href="mailto:michaelmorningthrees@gmail.com"
                        className="text-emerald-green hover:text-emerald-700 font-medium ml-1 transition-colors"
                      >
                        michaelmorningthrees@gmail.com
                      </a>
                    </p>
                  </div>
                </div>
              )}
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
