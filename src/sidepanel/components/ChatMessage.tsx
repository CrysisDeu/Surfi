import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Message } from '../../types'

interface Action {
  action: string
  selector?: string
  value?: string
  direction?: string
  url?: string
}

interface ChatMessageProps {
  message: Message
  onExecuteAction?: (action: Action) => void
}

// Parse JSON action blocks from message content
function parseActions(content: string): { text: string; actions: Action[] } {
  const actions: Action[] = []
  const jsonRegex = /```json\s*(\{[^`]+\})\s*```/g
  let match
  let text = content
  
  while ((match = jsonRegex.exec(content)) !== null) {
    try {
      const action = JSON.parse(match[1])
      if (action.action) {
        actions.push(action)
      }
    } catch {
      // Not valid JSON, ignore
    }
  }
  
  // Remove JSON blocks from display text if we found actions
  if (actions.length > 0) {
    text = content.replace(/```json\s*\{[^`]+\}\s*```/g, '').trim()
  }
  
  return { text, actions }
}

function getActionLabel(action: Action): string {
  switch (action.action) {
    case 'click':
      return `🖱️ Click: ${action.selector}`
    case 'type':
      return `⌨️ Type "${action.value}" in ${action.selector}`
    case 'scroll':
      return `📜 Scroll ${action.direction || 'down'}`
    case 'navigate':
      return `🔗 Go to ${action.url}`
    default:
      return `▶️ ${action.action}`
  }
}

export function ChatMessage({ message, onExecuteAction }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [executingAction, setExecutingAction] = useState<number | null>(null)
  const [actionResults, setActionResults] = useState<Record<number, 'success' | 'error'>>({})
  
  const { text, actions } = isUser 
    ? { text: message.content, actions: [] } 
    : parseActions(message.content)

  const handleActionClick = async (action: Action, index: number) => {
    if (executingAction !== null) return
    
    setExecutingAction(index)
    
    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('No active tab')
      
      // Send action to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXECUTE_ACTION',
        action: {
          type: action.action,
          selector: action.selector,
          value: action.value,
          url: action.url,
        },
      })
      
      if (response?.success) {
        setActionResults(prev => ({ ...prev, [index]: 'success' }))
      } else {
        throw new Error(response?.error || 'Action failed')
      }
      
      onExecuteAction?.(action)
    } catch (error) {
      console.error('Action failed:', error)
      setActionResults(prev => ({ ...prev, [index]: 'error' }))
    } finally {
      setExecutingAction(null)
    }
  }

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        <div className="message-text">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
        
        {actions.length > 0 && (
          <div className="message-actions">
            {actions.map((action, index) => (
              <button
                key={index}
                className={`action-btn ${actionResults[index] || ''} ${executingAction === index ? 'executing' : ''}`}
                onClick={() => handleActionClick(action, index)}
                disabled={executingAction !== null}
              >
                {executingAction === index ? '⏳ ' : ''}
                {actionResults[index] === 'success' ? '✅ ' : ''}
                {actionResults[index] === 'error' ? '❌ ' : ''}
                {getActionLabel(action)}
              </button>
            ))}
          </div>
        )}
        
        <div className="message-time">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
