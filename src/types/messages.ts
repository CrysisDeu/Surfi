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
