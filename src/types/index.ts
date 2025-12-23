export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

// Base model configuration shared by all providers
interface BaseModelConfig {
  id: string
  name: string
  model: string
  maxTokens?: number
  temperature?: number
}

// OpenAI and OpenAI-compatible APIs
export interface OpenAIModelConfig extends BaseModelConfig {
  provider: 'openai'
  apiEndpoint: string
  apiKey: string
}

// Anthropic API
export interface AnthropicModelConfig extends BaseModelConfig {
  provider: 'anthropic'
  apiEndpoint: string
  apiKey: string
}

// AWS Bedrock
export interface BedrockModelConfig extends BaseModelConfig {
  provider: 'bedrock'
  awsRegion: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsSessionToken?: string // Optional for temporary credentials
}

// Custom OpenAI-compatible endpoints
export interface CustomModelConfig extends BaseModelConfig {
  provider: 'custom'
  apiEndpoint: string
  apiKey: string
}

// Discriminated union of all model configs
export type ModelConfig = 
  | OpenAIModelConfig 
  | AnthropicModelConfig 
  | BedrockModelConfig 
  | CustomModelConfig

export interface Settings {
  activeModelId: string
  models: ModelConfig[]
  theme: 'light' | 'dark' | 'system'
}

export interface PageContext {
  url: string
  title: string
  content: string
  selectedText?: string
}

export interface ActionRequest {
  type: 'click' | 'type' | 'scroll' | 'navigate' | 'extract'
  selector?: string
  value?: string
  url?: string
}

export interface ChatRequest {
  type: 'CHAT_MESSAGE'
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
