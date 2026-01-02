export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ChatRequest {
  type: 'CHAT_MESSAGE' | 'CHAT_MESSAGE_STREAM'
  payload: {
    messages: Message[]
    pageContext?: PageContext
  }
}

export interface ChatResponse {
  content: string
  actions?: ActionRequest[]
  error?: string
}

export interface PageContext {
  url: string
  title: string
  content: string
  selectedText?: string
  interactiveElements?: InteractiveElement[]
}

export interface InteractiveElement {
  tag: string
  text: string
  selector: string
  type?: string
}

export interface ActionRequest {
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'extract'
  selector?: string
  value?: string
  url?: string
  direction?: 'up' | 'down'
}

export interface ActionResult {
  success: boolean
  error?: string
  content?: string
}

export interface UIMessage {
  id: string
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'system'
  role: 'user' | 'assistant' | 'system'
  content?: string
  tool?: string
  input?: Record<string, unknown>
  output?: string
  success?: boolean
  error?: string
  evaluation?: string
  memory?: string
  nextGoal?: string
  stepNumber?: number
  timestamp: number
}
