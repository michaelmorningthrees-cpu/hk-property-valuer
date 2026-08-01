import { useEffect, useRef } from 'react'

const AD_CLIENT = 'ca-pub-9064903152751202'

export default function AdSenseAd({ adSlot, className = '' }) {
  const adRef = useRef(null)

  const normalizedSlot = adSlot?.trim()
  const isValidSlot = Boolean(normalizedSlot && /^[0-9]+$/.test(normalizedSlot))

  useEffect(() => {
    if (!isValidSlot) return

    const ins = adRef.current
    if (!ins) return

    if (ins.getAttribute('data-adsbygoogle-status')) return

    try {
      window.adsbygoogle = window.adsbygoogle || []
      window.adsbygoogle.push({})
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Google AdSense could not be initialized.', error)
      }
    }
  }, [isValidSlot])

  if (!isValidSlot) {
    return null
  }

  return (
    <div className={className}>
      <ins
        ref={adRef}
        className="adsbygoogle block w-full"
        style={{ display: 'block', minHeight: '100px' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={normalizedSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
