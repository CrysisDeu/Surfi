import type { ModelConfig } from '../../types'
import { callOpenAI } from './openai'
import { callAnthropic } from './anthropic'
import { callBedrock } from './bedrock'
import { callCustom } from './custom'

export { callOpenAI, callOpenAIWithTools, type OpenAIToolResponse } from './openai'
export { callAnthropic, callAnthropicWithTools, type AnthropicToolResponse } from './anthropic'
export { callBedrock, callBedrockWithTools, type BedrockToolResponse } from './bedrock'
export { callCustom, callCustomWithTools, type CustomToolResponse } from './custom'

interface ChatMessage {
  role: string
  content: string
}

/**
 * Unified API call function that routes to the appropriate provider
 */
export async function callModelAPI(
  model: ModelConfig,
  messages: ChatMessage[]
): Promise<string> {
  switch (model.provider) {
    case 'openai':
      return callOpenAI(model, messages)
    case 'anthropic':
      return callAnthropic(model, messages)
    case 'bedrock':
      return callBedrock(model, messages)
    case 'custom':
      return callCustom(model, messages)
    default:
      throw new Error(`Unknown provider: ${(model as ModelConfig).provider}`)
  }
}

/**
 * Check if a model has valid credentials configured
 */
export function hasValidCredentials(model: ModelConfig): boolean {
  switch (model.provider) {
    case 'bedrock':
      return !!(model.awsAccessKeyId && model.awsSecretAccessKey && model.awsRegion)
    case 'openai':
    case 'anthropic':
    case 'custom':
      return !!model.apiKey
    default:
      return false
  }
}
