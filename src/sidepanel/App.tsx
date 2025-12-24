import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from './components/ChatMessage'
import { ChatInput } from './components/ChatInput'
import { Header } from './components/Header'
import type { Message } from '../types'

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
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
        if (message.type === 'chunk') {
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
            <h2>👋 Welcome to Browser AI</h2>
            <p>I can help you navigate and interact with web pages.</p>
            <p>Try asking me to:</p>
            <ul>
              <li>Summarize this page</li>
              <li>Find specific information</li>
              <li>Click on elements</li>
              <li>Fill out forms</li>
            </ul>
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
    </div>
  )
}

export default App
