import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false); // 新增：是否已同意狀態
  
  const [messages, setMessages] = useState([
    { role: 'model', text: '你好！想買樓定賣樓？我可以幫你計下數或者解答流程問題。👋' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 初始化：檢查用戶之前是否已經同意過
  useEffect(() => {
    const agreed = localStorage.getItem('chat_disclaimer_agreed');
    if (agreed === 'true') {
      setHasAgreed(true);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (hasAgreed && isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, hasAgreed]);

  const handleAgree = () => {
    setHasAgreed(true);
    localStorage.setItem('chat_disclaimer_agreed', 'true'); // 記住佢既選擇
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const historyForApi = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: historyForApi, 
          message: userMessage 
        }),
      });

      const data = await res.json();
      
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'model', text: data.reply }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: '對不起，連線出現問題，請稍後再試。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end font-sans">
      
      {/* 聊天視窗容器 */}
      {isOpen && (
        <div className="mb-4 w-[350px] h-[550px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in-up">
          
          {/* Header (標題欄 - 無論是否同意都會顯示) */}
          <div className="bg-blue-800 p-4 text-white flex justify-between items-center shadow-md shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${hasAgreed ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
              <h3 className="font-bold text-sm">HK Valuation 小助手</h3>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white hover:text-gray-200 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 內容區域：根據 hasAgreed 切換顯示 */}
          {!hasAgreed ? (
            // === 頁面 A: 免責聲明同意頁 ===
            <div className="flex-1 flex flex-col p-6 bg-white overflow-y-auto">
              <div className="flex-1">
                <div className="flex justify-center mb-4">
                  <div className="p-3 bg-blue-50 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-blue-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>
                
                <h4 className="text-lg font-bold text-gray-800 mb-4 text-center">使用前請閱讀</h4>
                
                <div className="text-sm text-gray-600 space-y-3 leading-relaxed border-t border-b border-gray-100 py-4 my-2">
                  <p>歡迎使用 AI 智能助理。在使用本服務前，請同意以下條款：</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>本 AI 提供的所有估價、按揭計算及建議<strong>僅供參考</strong>。</li>
                    <li>實際按揭批核結果視乎<strong>銀行最終決定</strong>。</li>
                    <li>我們不會收集您的個人敏感資料，但請勿在對話中透露身分證號碼或銀行密碼。</li>
                  </ul>
                </div>
              </div>

              <button 
                onClick={handleAgree}
                className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-lg mt-4"
              >
                我明白，開始諮詢
              </button>
            </div>
          ) : (
            // === 頁面 B: 聊天介面 (原本的 Code) ===
            <>
              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                    }`}>
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-bl-none text-xs text-gray-500 shadow-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-gray-100 flex gap-2 items-center shrink-0">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="輸入問題 (例如：印花稅點計?)"
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800 transition-all placeholder:text-gray-400"
                />
                <button 
                  type="submit" 
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-600 text-white rounded-full p-2.5 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </form>

              {/* 底部簡易免責聲明 */}
              <div className="bg-gray-50 p-1.5 text-center border-t border-gray-100 shrink-0">
                <p className="text-[10px] text-gray-400 leading-tight">
                  資訊僅供參考，實際結果以銀行為準。
                </p>
              </div>
            </>
          )}

        </div>
      )}

      {/* 開關按鈕 (Bubble) - 維持不變 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center z-50"
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-7 h-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        ) : (
          <div className="relative">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          </div>
        )}
      </button>
    </div>
  );
}