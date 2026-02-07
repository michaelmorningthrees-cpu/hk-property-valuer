import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);
  
  const [messages, setMessages] = useState([
    { role: 'model', text: '你好！想買樓定賣樓？我可以幫你計下數或者解答流程問題。👋' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // 初始化：檢查 localStorage
  useEffect(() => {
    // 為了 Debug 方便，如果你想在手機重新測試 Agreement 頁面，可以暫時註解下面這行
    const agreed = localStorage.getItem('chat_disclaimer_agreed');
    if (agreed === 'true') {
      setHasAgreed(true);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      // 確保打開時滾動到底部 (延遲一點點以配合手機鍵盤彈出)
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, isOpen]);

  const handleAgree = () => {
    setHasAgreed(true);
    localStorage.setItem('chat_disclaimer_agreed', 'true');
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

      // 設定 20秒 timeout，避免手機網絡一直轉圈
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: historyForApi, 
          message: userMessage 
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error("Server Error");

      const data = await res.json();
      
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'model', text: data.reply }]);
      } else {
        throw new Error("Empty response");
      }
    } catch (error) {
      console.error(error);
      // 手機版 Alert 提示，方便你知道係咪網絡問題
      // alert("連線出現問題，請檢查網絡或稍後再試。"); 
      setMessages(prev => [...prev, { role: 'model', text: '⚠️ 連線不穩定，請重試 (如果你在手機，請確保訊號良好)。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="font-sans z-[9999]">
      
      {/* 
         主聊天視窗 
         電腦版 (sm:): 右下角懸浮
         手機版 (default): 全螢幕 (fixed inset-0)
      */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-[9999] 
                        w-full h-[100dvh] sm:w-[380px] sm:h-[600px] 
                        bg-white sm:rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          
          {/* Header */}
          <div className="bg-blue-800 p-4 text-white flex justify-between items-center shadow-md shrink-0 pt-safe-top">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${hasAgreed ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
              <h3 className="font-bold text-sm">HK Valuation 小助手</h3>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="p-2 rounded-full hover:bg-blue-700/50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 內容區域 */}
          {!hasAgreed ? (
            // === 免責聲明同意頁 ===
            <div className="flex-1 flex flex-col p-6 bg-white overflow-y-auto justify-center">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-blue-50 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-blue-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
              </div>
              
              <h4 className="text-xl font-bold text-gray-800 mb-4 text-center">使用前請閱讀</h4>
              
              <div className="text-sm text-gray-600 space-y-4 leading-relaxed border-t border-b border-gray-100 py-6 my-2">
                <p>歡迎使用 AI 智能助理。為了保障您的權益，請同意：</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>所有估價及計算結果<strong>僅供參考</strong>。</li>
                  <li>實際按揭批核以<strong>銀行最終決定</strong>為準。</li>
                  <li>請勿在對話中輸入個人私隱資料。</li>
                </ul>
              </div>

              <button 
                onClick={handleAgree}
                className="w-full bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-lg mt-auto sm:mt-4"
              >
                我同意並開始
              </button>
            </div>
          ) : (
            // === 聊天介面 ===
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 scroll-smooth">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3.5 rounded-2xl text-[15px] shadow-sm leading-relaxed ${
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
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-2" />
              </div>

              {/* Input Area */}
              <div className="bg-white border-t border-gray-100 p-3 pb-safe-bottom">
                <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="輸入問題..."
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-5 py-3 text-base focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-gray-800"
                    // 防止手機鍵盤放大頁面
                    style={{ fontSize: '16px' }}
                  />
                  <button 
                    type="submit" 
                    disabled={isLoading || !input.trim()}
                    className="bg-blue-600 text-white rounded-full p-3 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  </button>
                </form>
                <div className="text-center mt-2">
                  <p className="text-[10px] text-gray-400">AI 資訊僅供參考，結果以銀行為準。</p>
                </div>
              </div>
            </>
          )}

        </div>
      )}

      {/* 開關按鈕 (Bubble) - 固定在右下角 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[9999] bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95 flex items-center justify-center"
        >
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            {/* 紅點 (首次提示) */}
            {!hasAgreed && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
        </button>
      )}
    </div>
  );
}