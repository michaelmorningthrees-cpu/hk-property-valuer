import Head from 'next/head'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const MAX_QUOTA = 10

export default function Home() {
  const [formData, setFormData] = useState({
    address: '',
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
    if (!formData.address || !formData.email || !formData.purpose) {
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
        <meta name="description" content="只需輸入地址，30 分鐘內收到深度分析報告" />
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
                只需輸入地址，30 分鐘內收到深度分析報告。
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
                        每日限量深度報告
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

                  {/* Property Address Input */}
                  <div>
                    <label htmlFor="address" className="block text-deep-navy text-sm font-medium mb-2">
                      物業地址
                    </label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="例如：太古城金楓閣 10 樓 A"
                      className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-green focus:border-emerald-green transition-colors text-gray-900 placeholder-gray-400"
                      required
                      disabled={isSubmitting}
                    />
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
