
import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { ChatMessage } from './components/ChatMessage'
import { ChatInput } from './components/ChatInput'
import { Header } from './components/Header'
import { HistoryView } from './components/HistoryView'
import { AgentActivity } from './components/AgentActivity'
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
          content: 'Connection error. Please try again.',
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
      // Notify background to clear in-memory state
      await chrome.runtime.sendMessage({ type: 'CLEAR_TASK', taskId: latestTaskId })
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
        content: 'Paused',
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
            <h2>🏄 Welcome to Surfi</h2>
            <p>I can <strong>see</strong>, <strong>interact</strong>, and <strong>navigate</strong> any webpage for you.</p>
            
            <div className="capability-section">
              <h3>🔍 Multi-Step Research</h3>
              <div className="suggestion-buttons">
                <button onClick={() => handleSendMessage('Find the top 3 news stories today and summarize each one')}>Top 3 news today</button>
                <button onClick={() => handleSendMessage('Search for the best restaurants nearby and compare their ratings')}>Find & compare restaurants</button>
                <button onClick={() => handleSendMessage('Look up this product on 3 different sites and compare prices')}>Compare prices</button>
              </div>
            </div>

            <div className="capability-section">
              <h3>📖 Read & Analyze</h3>
              <div className="suggestion-buttons">
                <button onClick={() => handleSendMessage('Summarize this page for me')}>Summarize this page</button>
                <button onClick={() => handleSendMessage('What are the pros and cons mentioned here?')}>Pros & cons</button>
                <button onClick={() => handleSendMessage('Extract all the key points from this article')}>Key points</button>
              </div>
            </div>

            <div className="capability-section">
              <h3>🖱️ Click, Type & Interact</h3>
              <h3>Analysis</h3>
              <div className="suggestion-buttons">
                <button onClick={() => handleSendMessage('Fill out the form on this page with test data')}>Fill out form</button>
                <button onClick={() => handleSendMessage('Search for "AI tools" using the search box')}>Search the page</button>
                <button onClick={() => handleSendMessage('Click the sign up button and start the registration')}>Start signup</button>
              </div>
            </div>

            <div className="capability-section">
              <h3>🔄 Navigate & Multi-Tab</h3>
              <div className="suggestion-buttons">
                <button onClick={() => handleSendMessage('Open all the links in this article and summarize each one')}>Read all links</button>
                <button onClick={() => handleSendMessage('Switch to my other tab and tell me what it\'s about')}>Check other tab</button>
                <button onClick={() => handleSendMessage('Find the contact page and extract the email address')}>Find contact info</button>
              </div>
            </div>

          </div>
        ) : (
          (() => {
            const renderedElements: React.ReactNode[] = []
            let currentGroup: UIMessage[] = []
            let groupFinalOutput: UIMessage | null = null

            const flushGroup = (isActive: boolean) => {
              if (currentGroup.length > 0 || groupFinalOutput) {
                // Render as a unified assistant response
                renderedElements.push(
                  <div key={`response-${currentGroup[0]?.id || groupFinalOutput?.id}`} className="message message-assistant">
                    <div className="message-avatar">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path>
                        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path>
                      </svg>
                    </div>
                    <div className="message-content">
                      {currentGroup.length > 0 && (
                        <AgentActivity
                          messages={[...currentGroup]}
                          isActive={isActive && !groupFinalOutput}
                        />
                      )}
                      {groupFinalOutput && (
                        <div className="message-text">
                          <ReactMarkdown>{groupFinalOutput.content || ''}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                )
                currentGroup = []
                groupFinalOutput = null
              }
            }

            messages.forEach((msg) => {
              const isProcessMsg = ['thinking', 'tool_use', 'tool_result'].includes(msg.type)
              const isAssistantText = msg.role === 'assistant' && msg.type === 'text'
              
              if (isProcessMsg) {
                currentGroup.push(msg)
              } else if (isAssistantText && currentGroup.length > 0) {
                // This is the final output for the current process group
                groupFinalOutput = msg
                flushGroup(false)
              } else {
                // User, system, or standalone assistant message
                flushGroup(false)
                renderedElements.push(<ChatMessage key={msg.id} message={msg} />)
              }
            })

            // Flush any remaining active group
            flushGroup(isLoading)

            return renderedElements
          })()
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
