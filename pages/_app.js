import '../styles/globals.css'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import ChatWidget from '../components/ChatWidget'

export default function App({ Component, pageProps }) {
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
      <Component {...pageProps} />
      <Analytics />
      {/* 👈 動作 2：加呢行，這就是你的聊天機械人！ */}
      <ChatWidget /> 
    </>
  )
}
