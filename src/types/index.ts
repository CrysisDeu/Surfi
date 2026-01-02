
// Re-export all types from split modules
export type {
  Message,
  ChatRequest,
  ChatResponse,
  PageContext,
  InteractiveElement,
  ActionRequest,
  ActionResult,
  UIMessage,
} from './messages'

export type {
  OpenAIModelConfig,
  AnthropicModelConfig,
  BedrockModelConfig,
  CustomModelConfig,
  ModelConfig,
  ModelProvider,
  Settings,
} from './models'

export interface TaskMetadata {
  id: string
  timestamp: number
  preview: string
  messageCount: number
}
