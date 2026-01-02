
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage } from './components/ChatMessage'
import { ChatInput } from './components/ChatInput'
import { Header } from './components/Header'
import { HistoryView } from './components/HistoryView'
import type { UIMessage } from '../types'
import './App.css'

interface PromptDebug {
  stepNumber: number
  promptText: string
  url: string
  interactiveCount: number
  messageCount?: number
  totalChars?: number
  timestamp: number
}

function App() {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [promptDebugList, setPromptDebugList] = useState<PromptDebug[]>([])
  const [showPromptDebug, setShowPromptDebug] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const portRef = useRef<chrome.runtime.Port | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Load History Logic
  const loadHistory = useCallback(async () => {
    try {
      const meta = await chrome.storage.local.get('latest_surfi_task_id')
      const latestTaskId = meta.latest_surfi_task_id as string

      if (latestTaskId) {
        const data = await chrome.storage.local.get(latestTaskId)
        if (data && data[latestTaskId] && data[latestTaskId].uiMessages) {
          setMessages(data[latestTaskId].uiMessages)
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // ============================================================================
  // Robust Port Management
  // ============================================================================

  // Define listener separately to re-use
  const handlePortMessage = useCallback((message: any) => {
    if (message.type === 'ui_message') {
      const uiMsg = message.message as UIMessage
      setMessages((prev) => {
        if (prev.some(m => m.id === uiMsg.id)) return prev
        return [...prev, uiMsg]
      })

      if (uiMsg.role === 'assistant' && (uiMsg.type === 'thinking' || uiMsg.type === 'tool_use')) {
        setIsLoading(true)
      }
    }
    else if (message.type === 'done') {
      setIsLoading(false)
    }
    else if (message.type === 'prompt_debug') {
      setPromptDebugList((prev) => {
        if (prev.some(p => p.stepNumber === message.stepNumber)) return prev
        return [...prev, {
          stepNumber: message.stepNumber,
          promptText: message.promptText || message.systemPrompt || '',
          url: message.url,
          interactiveCount: message.interactiveCount,
          messageCount: message.messageCount,
          totalChars: message.totalChars,
          timestamp: Date.now(),
        }]
      })
    }
    else if (message.type === 'error') {
      const errorMsg: UIMessage = {
        id: Date.now().toString(),
        type: 'text',
        role: 'system',
        content: `Error: ${message.error}`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMsg])
      setIsLoading(false)
    }
  }, [])

  const connectPort = useCallback(() => {
    if (portRef.current) return portRef.current

    try {
      const port = chrome.runtime.connect({ name: 'chat-stream' })

      port.onMessage.addListener(handlePortMessage)

      port.onDisconnect.addListener(() => {
        console.log('Port disconnected')
        portRef.current = null
        setIsLoading(false)
      })

      portRef.current = port
      return port
    } catch (e) {
      console.error('Failed to connect port:', e)
      return null
    }
  }, [handlePortMessage])

  // Initial connection
  useEffect(() => {
    connectPort()
    return () => {
      if (portRef.current) {
        portRef.current.disconnect()
        portRef.current = null
      }
    }
  }, [connectPort])

  // ============================================================================
  // User Actions
  // ============================================================================

  const handleSendMessage = (content: string) => {
    const msgForUi: UIMessage = {
      id: Date.now().toString(),
      type: 'text',
      role: 'user',
      content,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, msgForUi])
    setIsLoading(true)

    const historyPayload = messages.map(m => ({
      role: m.role,
      content: m.content || (m.tool ? `Tool ${m.tool}` : ''),
    }))

    // Ensure connection
    const port = connectPort()

    if (port) {
      try {
        port.postMessage({
          type: 'CHAT_MESSAGE_STREAM',
          payload: {
            messages: [...historyPayload, { role: 'user', content }]
          }
        })
      } catch (e) {
        console.error("Port error sending message", e)
        setIsLoading(false)
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          type: 'system',
          role: 'system',
          content: '❌ Connection error. Please try again.',
          timestamp: Date.now()
        }])
      }
    } else {
      setIsLoading(false)
    }
  }

  const handleClearChat = async () => {
    const meta = await chrome.storage.local.get('latest_surfi_task_id')
    const latestTaskId = meta.latest_surfi_task_id
    if (latestTaskId && typeof latestTaskId === 'string') {
      await chrome.storage.local.remove(latestTaskId)
    }
    await chrome.storage.local.remove('latest_surfi_task_id')

    setMessages([])
    setPromptDebugList([])
    setShowPromptDebug(null)
  }

  const handleStopAgent = () => {
    if (portRef.current) {
      portRef.current.disconnect()
      portRef.current = null
      setIsLoading(false)
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'system',
        role: 'system',
        content: '⏹️ Disconnected from agent.',
        timestamp: Date.now()
      }])
    }
  }

  const handleLoadSession = async (taskId: string) => {
    await chrome.storage.local.set({ 'latest_surfi_task_id': taskId })
    loadHistory() // Re-use load logic
    setShowHistory(false)
  }

  return (
    <div className="app">
      <Header
        onClearChat={handleClearChat}
        onHistory={() => setShowHistory(!showHistory)}
      />

      {showHistory && (
        <HistoryView
          onSelect={handleLoadSession}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h2>🏄 Surfi Agent</h2>
            <p>Ready to help.</p>

            <div className="capability-section">
              <h3>Navigation</h3>
              <div className="suggestion-buttons">
                <button onClick={() => handleSendMessage('Go to google.com')}>Go to Google</button>
                <button onClick={() => handleSendMessage('Scroll down')}>Scroll Down</button>
              </div>
            </div>

            <div className="capability-section">
              <h3>Analysis</h3>
              <div className="suggestion-buttons">
                <button onClick={() => handleSendMessage('Summarize this page')}>Summarize Page</button>
                <button onClick={() => handleSendMessage('Analyze the sentiment of this article')}>Analyze Sentiment</button>
              </div>
            </div>

            <div className="capability-section">
              <h3>Data</h3>
              <div className="suggestion-buttons">
                <button onClick={() => handleSendMessage('Extract main content from this page')}>Extract Content</button>
                <button onClick={() => handleSendMessage('Find all links on this page')}>Find Links</button>
              </div>
            </div>

          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
        {isLoading && (
          <div className="loading-indicator">
            <span className="dot"></span><span className="dot"></span><span className="dot"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        onStop={handleStopAgent}
      />

      {promptDebugList.length > 0 && (
        <div className="prompt-debug-fab">
          <button
            className="prompt-debug-button"
            onClick={() => setShowPromptDebug(showPromptDebug === null ? promptDebugList.length - 1 : null)}
            title="View LLM Prompts"
          >
            📋 {promptDebugList.length}
          </button>
        </div>
      )}

      {showPromptDebug !== null && promptDebugList[showPromptDebug] && (
        <div className="prompt-debug-modal" onClick={() => setShowPromptDebug(null)}>
          <div className="prompt-debug-content" onClick={(e) => e.stopPropagation()}>
            <div className="prompt-debug-header">
              <h3>LLM Prompt - Step {promptDebugList[showPromptDebug].stepNumber}</h3>
              <div className="prompt-debug-nav">
                <button
                  disabled={showPromptDebug === 0}
                  onClick={() => setShowPromptDebug(Math.max(0, showPromptDebug - 1))}
                >
                  ◀ Prev
                </button>
                <span>{showPromptDebug + 1} / {promptDebugList.length}</span>
                <button
                  disabled={showPromptDebug === promptDebugList.length - 1}
                  onClick={() => setShowPromptDebug(Math.min(promptDebugList.length - 1, showPromptDebug + 1))}
                >
                  Next ▶
                </button>
              </div>
              <button className="close-button" onClick={() => setShowPromptDebug(null)}>✕</button>
            </div>
            <pre className="prompt-debug-text">
              {promptDebugList[showPromptDebug].promptText}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
