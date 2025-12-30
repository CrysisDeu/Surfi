import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Message } from '../../types'
import './ChatMessage.css'

interface Action {
  action: string
  selector?: string
  value?: string
  direction?: string
  url?: string
}

interface ToolCall {
  step: number
  name: string
  input: string
  result?: string
  success?: boolean
  fullText: string
  isDone?: boolean
  doneMessage?: string
}

interface ChatMessageProps {
  message: Message
  onExecuteAction?: (action: Action) => void
}

// Parse tool calls from message content
// Format: 🔧 Step X: toolName({...}) followed by ✅ Done or ❌ error
// Special handling for done() tool - extract its message for final response
function parseToolCalls(content: string): { text: string; toolCalls: ToolCall[]; finalResponse?: string } {
  const toolCalls: ToolCall[] = []
  let finalResponse: string | undefined
  
  // Match tool call pattern: 🔧 Step X: toolName({...})
  // Handle nested JSON objects by matching balanced braces
  const toolCallRegex = /🔧\s*Step\s+(\d+):\s*(\w+)\(/g
  const matches: Array<{ step: number; name: string; input: string; index: number; fullMatch: string }> = []
  
  let match
  while ((match = toolCallRegex.exec(content)) !== null) {
    const startIndex = match.index
    const nameStart = match.index + match[0].length
    
    // Find the matching closing parenthesis by counting braces
    let braceCount = 0
    let parenCount = 1
    let i = nameStart
    let inputStart = -1
    
    while (i < content.length && parenCount > 0) {
      if (content[i] === '{') {
        braceCount++
        if (inputStart === -1) inputStart = i
      } else if (content[i] === '}') {
        braceCount--
      } else if (content[i] === '(') {
        parenCount++
      } else if (content[i] === ')') {
        parenCount--
        if (parenCount === 0) {
          break
        }
      }
      i++
    }
    
    if (parenCount === 0 && inputStart !== -1) {
      const input = content.substring(inputStart, i)
      const fullMatch = content.substring(startIndex, i + 1)
      
      matches.push({
        step: parseInt(match[1], 10),
        name: match[2],
        input: input.trim(),
        index: startIndex,
        fullMatch
      })
    }
  }
  
  // For each tool call, find the result that follows
  for (let i = 0; i < matches.length; i++) {
    const toolMatch = matches[i]
    const startIndex = toolMatch.index + toolMatch.fullMatch.length
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length
    
    const toolSection = content.substring(startIndex, endIndex)
    
    // Special handling for done() tool
    if (toolMatch.name === 'done') {
      // Extract done message from the result format: ✅ **Result:**\n<message>
      const doneResultMatch = toolSection.match(/(?:✅|❌)\s*\*\*Result:\*\*\s*\n([\s\S]*?)(?:\n|$)/)
      if (doneResultMatch) {
        finalResponse = doneResultMatch[1].trim()
      }
      
      // Parse done input to get message
      try {
        const doneInput = JSON.parse(toolMatch.input)
        const doneMessage = doneInput.message || doneInput.text || 'Task completed'
        const doneSuccess = doneInput.success !== false
        
        toolCalls.push({
          step: toolMatch.step,
          name: toolMatch.name,
          input: toolMatch.input,
          result: 'Done',
          success: doneSuccess,
          fullText: toolSection.trim(),
          isDone: true,
          doneMessage: finalResponse || doneMessage
        })
      } catch {
        toolCalls.push({
          step: toolMatch.step,
          name: toolMatch.name,
          input: toolMatch.input,
          result: 'Done',
          success: true,
          fullText: toolSection.trim(),
          isDone: true,
          doneMessage: finalResponse || 'Task completed'
        })
      }
      continue
    }
    
    // Extract result (✅ Done or ❌ error message)
    const successMatch = toolSection.match(/✅\s*Done/)
    const errorMatch = toolSection.match(/❌\s*([^\n]+)/)
    
    let result: string | undefined
    let success: boolean | undefined
    
    if (successMatch) {
      result = 'Done'
      success = true
    } else if (errorMatch) {
      result = errorMatch[1].trim()
      success = false
    }
    
    // Get full text including any debug info (📋 Debug info blocks)
    const fullText = toolSection.trim()
    
    toolCalls.push({
      step: toolMatch.step,
      name: toolMatch.name,
      input: toolMatch.input,
      result,
      success,
      fullText
    })
  }
  
  // Remove tool call sections from display text
  let text = content
  if (toolCalls.length > 0) {
    // Remove each tool call section by replacing from start to end of each section
    for (let i = matches.length - 1; i >= 0; i--) {
      const toolMatch = matches[i]
      const startIndex = toolMatch.index
      const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length
      
      // Find where the result ends (next tool call, or end of content)
      const toolSection = content.substring(startIndex, endIndex)
      
      // For done() tool, remove everything including the result message
      if (toolMatch.name === 'done') {
        // Find the end of the done result message
        const doneResultMatch = toolSection.match(/(?:✅|❌)\s*\*\*Result:\*\*\s*\n([\s\S]*?)(?:\n\n|\n$|$)/)
        if (doneResultMatch && doneResultMatch.index !== undefined) {
          const resultEnd = startIndex + toolMatch.fullMatch.length + doneResultMatch.index + doneResultMatch[0].length
          text = text.substring(0, startIndex) + text.substring(resultEnd)
        } else {
          // Fallback: remove up to next tool or end
          text = text.substring(0, startIndex) + text.substring(endIndex)
        }
      } else {
        const resultEndMatch = toolSection.match(/(✅\s*Done|❌\s*[^\n]+)/)
        let sectionEnd = endIndex
        
        if (resultEndMatch && resultEndMatch.index !== undefined) {
          // Include the result line
          const resultEnd = startIndex + toolMatch.fullMatch.length + resultEndMatch.index + resultEndMatch[0].length
          // Find the end of the line
          const lineEnd = content.indexOf('\n', resultEnd)
          sectionEnd = lineEnd !== -1 ? lineEnd + 1 : resultEnd
        }
        
        // Remove this section
        text = text.substring(0, startIndex) + text.substring(sectionEnd)
      }
    }
    
    text = text.trim()
  }
  
  return { text, toolCalls, finalResponse }
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

// Tool Call Component (Grouped Collapsible)
function ToolCallsGroup({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const getToolIcon = (name: string) => {
    const iconMap: Record<string, string> = {
      click: '🖱️',
      type: '⌨️',
      scroll: '📜',
      navigate: '🔗',
      extract_content: '📋',
      search: '🔍',
      done: '✅',
    }
    return iconMap[name] || '🔧'
  }
  
  const formatInput = (input: string) => {
    try {
      const parsed = JSON.parse(input)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return input
    }
  }
  
  const formatInputPreview = (input: string): string => {
    try {
      const parsed = JSON.parse(input)
      // Create a compact preview of the input
      const entries = Object.entries(parsed)
      if (entries.length === 0) return ''
      
      // Show key-value pairs, truncate long values
      const preview = entries
        .slice(0, 3) // Show max 3 parameters
        .map(([key, value]) => {
          const valueStr = String(value)
          const truncated = valueStr.length > 30 ? valueStr.substring(0, 27) + '...' : valueStr
          return `${key}: ${truncated}`
        })
        .join(', ')
      
      return entries.length > 3 ? preview + '...' : preview
    } catch {
      // If not JSON, show first 50 chars
      return input.length > 50 ? input.substring(0, 47) + '...' : input
    }
  }
  
  const latestToolCall = toolCalls[toolCalls.length - 1]
  const totalSteps = toolCalls.length
  const isExecuting = latestToolCall && latestToolCall.result === undefined
  
  // When collapsed, show simple one-line preview with latest tool name and input
  if (!isExpanded && latestToolCall) {
    const inputPreview = formatInputPreview(latestToolCall.input)
    
    return (
      <div className="tool-calls-simple">
        <button
          className="tool-calls-simple-line"
          onClick={() => setIsExpanded(true)}
        >
          <div className="tool-calls-simple-content">
            <span className="tool-calls-simple-name">{latestToolCall.name}</span>
            {inputPreview && (
              <span className={`tool-calls-simple-input ${isExecuting ? 'loading' : ''}`}>
                ({inputPreview})
              </span>
            )}
          </div>
          <span className="tool-calls-simple-chevron">›</span>
        </button>
      </div>
    )
  }
  
  return (
    <div className="tool-calls-group">
      <button
        className="tool-calls-group-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="tool-calls-group-header-content">
          <span className="tool-calls-group-icon">🔧</span>
          <span className="tool-calls-group-title">
            {isExpanded ? `${totalSteps} steps` : latestToolCall ? `${latestToolCall.name}` : 'Tools'}
          </span>
          {latestToolCall && latestToolCall.success !== undefined && (
            <span className={`tool-calls-group-status ${latestToolCall.success ? 'success' : 'error'}`}>
              {latestToolCall.success ? '✅' : '❌'}
            </span>
          )}
        </div>
        <span className="tool-calls-group-toggle">{isExpanded ? '▼' : '›'}</span>
      </button>
      
      <div className="tool-calls-group-content">
        {isExpanded && (
          <div className="tool-calls-list">
            {toolCalls.map((toolCall, index) => (
              <div key={index} className="tool-call-item">
                <div className="tool-call-item-header">
                  <span className="tool-call-item-step">Step {toolCall.step}</span>
                  <span className="tool-call-item-icon">{getToolIcon(toolCall.name)}</span>
                  <span className="tool-call-item-name">{toolCall.name}</span>
                  {toolCall.success !== undefined && (
                    <span className={`tool-call-item-status ${toolCall.success ? 'success' : 'error'}`}>
                      {toolCall.success ? '✅' : '❌'}
                    </span>
                  )}
                </div>
                <div className="tool-call-item-content">
                  <div className="tool-call-section">
                    <div className="tool-call-label">Input:</div>
                    <pre className="tool-call-code">{formatInput(toolCall.input)}</pre>
                  </div>
                  {toolCall.result && (
                    <div className="tool-call-section">
                      <div className="tool-call-label">Result:</div>
                      <div className={`tool-call-result ${toolCall.success ? 'success' : 'error'}`}>
                        {toolCall.result}
                      </div>
                    </div>
                  )}
                  {toolCall.fullText && toolCall.fullText.length > 0 && (
                    <div className="tool-call-section">
                      <div className="tool-call-label">Details:</div>
                      <pre className="tool-call-details">{toolCall.fullText}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatMessage({ message, onExecuteAction }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [executingAction, setExecutingAction] = useState<number | null>(null)
  const [actionResults, setActionResults] = useState<Record<number, 'success' | 'error'>>({})
  
  // Handle system messages (like stop notifications)
  if (message.role === 'system') {
    return (
      <div className="message message-system">
        <div className="message-content">
          <div className="message-text message-system-text">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    )
  }
  
  // Parse tool calls and regular content
  const { text: textAfterToolCalls, toolCalls, finalResponse } = isUser
    ? { text: message.content, toolCalls: [], finalResponse: undefined }
    : parseToolCalls(message.content)
  
  // Parse actions from remaining text
  const { text, actions } = isUser 
    ? { text: message.content, actions: [] } 
    : parseActions(textAfterToolCalls)

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
        {toolCalls.length > 0 && (
          <ToolCallsGroup toolCalls={toolCalls} />
        )}
        
        {/* Show final response from done() tool below tool container */}
        {finalResponse && (
          <div className="message-text">
            <ReactMarkdown>{finalResponse}</ReactMarkdown>
          </div>
        )}
        
        {/* Show any other text content (fallback) */}
        {text && !finalResponse && (
          <div className="message-text">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
        
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
