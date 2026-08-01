import '../styles/globals.css'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import ChatWidget from '../components/ChatWidget' 

export default function App({ Component, pageProps }) {
  // 檢查環境變數，如果係 'true' 先顯示chat
  const showChat = process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true';

  return (
    <>
      {/* Google tag (gtag.js) - Using Next.js Script for better performance */}
      <Script
        strategy="afterInteractive"
        src="https://www.googletagmanager.com/gtag/js?id=AW-17861479339"
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'AW-17861479339');
          `,
        }}
      />
      {/* Microsoft Clarity */}
      <Script
        id="microsoft-clarity"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "v0unm481lh");
          `,
        }}
      />
      {/* Google AdSense */}
      <Script
        id="google-adsense-script"
        async
        strategy="afterInteractive"
        crossOrigin="anonymous"
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9064903152751202"
      />
      <Component {...pageProps} />
      <Analytics />
      {/* 👇 只有當變數係 true 時先顯示 */}
      {showChat && <ChatWidget />}
    </>
  )
}
