import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from './components/ChatMessage'
import { ChatInput } from './components/ChatInput'
import { Header } from './components/Header'
import type { Message } from '../types'
import './App.css'

interface PromptDebug {
  stepNumber: number
  systemPrompt: string
  url: string
  interactiveCount: number
  timestamp: number
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [promptDebugList, setPromptDebugList] = useState<PromptDebug[]>([])
  const [showPromptDebug, setShowPromptDebug] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const portRef = useRef<chrome.runtime.Port | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent])

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)
    setStreamingContent('')

    try {
      // Use streaming via chrome.runtime.connect
      const port = chrome.runtime.connect({ name: 'chat-stream' })
      portRef.current = port
      
      let fullContent = ''
      
      port.onMessage.addListener((message) => {
        if (message.type === 'prompt_debug') {
          setPromptDebugList((prev) => [...prev, {
            stepNumber: message.stepNumber,
            systemPrompt: message.systemPrompt,
            url: message.url,
            interactiveCount: message.interactiveCount,
            timestamp: Date.now(),
          }])
        } else if (message.type === 'chunk') {
          fullContent += message.content
          setStreamingContent(fullContent)
        } else if (message.type === 'done') {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: fullContent,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, assistantMessage])
          setStreamingContent('')
          setIsLoading(false)
          portRef.current = null
          port.disconnect()
        } else if (message.type === 'error') {
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Error: ${message.error}`,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, errorMessage])
          setStreamingContent('')
          setIsLoading(false)
          portRef.current = null
          port.disconnect()
        }
      })

      port.onDisconnect.addListener(() => {
        portRef.current = null
        if (isLoading) {
          setIsLoading(false)
        }
      })

      // Send the streaming message request
      port.postMessage({
        type: 'CHAT_MESSAGE_STREAM',
        payload: {
          messages: [...messages, userMessage],
        },
      })
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to get response'}`,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMessage])
      setIsLoading(false)
    }
  }

  const handleClearChat = () => {
    setMessages([])
    setStreamingContent('')
    setPromptDebugList([])
    setShowPromptDebug(null)
  }

  const handleStopAgent = () => {
    if (portRef.current) {
      // Add a message indicating the agent was stopped
      if (streamingContent) {
        const stoppedMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: streamingContent + '\n\n⏹️ *Agent stopped by user*',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, stoppedMessage])
      }
      
      portRef.current.disconnect()
      portRef.current = null
      setStreamingContent('')
      setIsLoading(false)
    }
  }

  return (
    <div className="app">
      <Header onClearChat={handleClearChat} />
      
      <div className="messages-container">
        {messages.length === 0 && !streamingContent ? (
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
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {streamingContent && (
              <ChatMessage 
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  content: streamingContent,
                  timestamp: Date.now(),
                }}
              />
            )}
          </>
        )}
        {isLoading && !streamingContent && (
          <div className="loading-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput 
        onSendMessage={handleSendMessage} 
        isLoading={isLoading} 
        onStop={handleStopAgent}
      />

      {/* Prompt Debug Panel */}
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
              <button 
                className="copy-prompt-button"
                onClick={() => {
                  navigator.clipboard.writeText(promptDebugList[showPromptDebug].systemPrompt)
                    .then(() => {
                      // Show brief feedback
                      const btn = document.querySelector('.copy-prompt-button')
                      if (btn) {
                        btn.textContent = '✓ Copied!'
                        setTimeout(() => { btn.textContent = '📋 Copy' }, 1500)
                      }
                    })
                }}
                title="Copy prompt to clipboard"
              >
                📋 Copy
              </button>
              <button className="close-button" onClick={() => setShowPromptDebug(null)}>✕</button>
            </div>
            <div className="prompt-debug-meta">
              <span>URL: {promptDebugList[showPromptDebug].url}</span>
              <span>Elements: {promptDebugList[showPromptDebug].interactiveCount}</span>
            </div>
            <pre className="prompt-debug-text">
              {promptDebugList[showPromptDebug].systemPrompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
