
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { UIMessage } from '../../types'
import './ChatMessage.css'

interface ChatMessageProps {
  message: UIMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [isExpanded, setIsExpanded] = useState(false)

  // 1. User Message (Text)
  if (isUser) {
    return (
      <div className="message message-user">
        <div className="message-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div className="message-content">
          <div className="message-text">
            <ReactMarkdown>{message.content || ''}</ReactMarkdown>
          </div>
          <div className="message-time">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    )
  }

  // 2. System Message
  if (message.type === 'system') {
    return (
      <div className="message message-system">
        <div className="message-content">
          <div className="message-text message-system-text">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  // 3. Thinking (Accordion)
  if (message.type === 'thinking') {
    return (
      <div className="message message-assistant message-thinking">
        <div className="message-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"></path>
            <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"></path>
          </svg>
        </div>
        <div className="message-content">
          <div className="thinking-header" onClick={() => setIsExpanded(!isExpanded)}>
            <span className="thinking-title">Thinking process...</span>
            <span className="thinking-toggle">
              {isExpanded ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              )}
            </span>
          </div>
          {isExpanded && (
            <div className="thinking-details">
              {message.evaluation && (
                <div className="thinking-section">
                  <strong>Evaluation:</strong> {message.evaluation}
                </div>
              )}
              {message.memory && (
                <div className="thinking-section">
                  <strong>Memory:</strong> {message.memory}
                </div>
              )}
              {message.nextGoal && (
                <div className="thinking-section">
                  <strong>Goal:</strong> {message.nextGoal}
                </div>
              )}
              {/* Fallback if structured fields are missing but raw content exists */}
              {!message.evaluation && !message.nextGoal && message.content && (
                <div className="thinking-raw">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // 4. Tool Use (Action)
  if (message.type === 'tool_use') {
    return (
      <div className="message message-assistant message-tool-use">
        <div className="message-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
          </svg>
        </div>
        <div className="message-content">
          <div className="tool-use-header">
            <strong>Using Tool:</strong> <code>{message.tool}</code>
          </div>
          {message.input && (
            <pre className="tool-use-input">
              {JSON.stringify(message.input, null, 2)}
            </pre>
          )}
        </div>
      </div>
    )
  }

  // 5. Tool Result (Outcome)
  if (message.type === 'tool_result') {
    const isSuccess = message.success !== false
    return (
      <div className={`message message-assistant message-tool-result ${isSuccess ? 'success' : 'error'}`}>
        <div className="message-avatar">
          {isSuccess ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          )}
        </div>
        <div className="message-content">
          <div className="tool-result-header">
            <strong>Result:</strong> {message.tool}
          </div>
          <div className="tool-result-content">
            {message.content ? <ReactMarkdown>{message.content}</ReactMarkdown> : (message.error || 'No content')}
          </div>
        </div>
      </div>
    )
  }

  // 6. Generic/Fallback (Text)
  return (
    <div className="message message-assistant">
      <div className="message-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"></path>
          <rect x="5" y="9" width="14" height="10" rx="2"></rect>
          <path d="M9 22v-3"></path>
          <path d="M15 22v-3"></path>
          <path d="M9 14h.01"></path>
          <path d="M15 14h.01"></path>
        </svg>
      </div>
      <div className="message-content">
        <div className="message-text">
          <ReactMarkdown>{message.content || ''}</ReactMarkdown>
        </div>
        <div className="message-time">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
