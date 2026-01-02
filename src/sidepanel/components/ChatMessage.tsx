
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
        <div className="message-avatar">👤</div>
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
        <div className="message-avatar">🧠</div>
        <div className="message-content">
          <div className="thinking-header" onClick={() => setIsExpanded(!isExpanded)}>
            <span className="thinking-title">Thinking process...</span>
            <span className="thinking-toggle">{isExpanded ? '▼' : '▶'}</span>
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
        <div className="message-avatar">🛠️</div>
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
        <div className="message-avatar">{isSuccess ? '✅' : '❌'}</div>
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
      <div className="message-avatar">🤖</div>
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
