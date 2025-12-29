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
  awsSessionToken?: string  // Optional - for temporary credentials (STS)
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

export type ModelProvider = ModelConfig['provider']

export interface Settings {
  activeModelId: string
  models: ModelConfig[]
  theme: 'light' | 'dark' | 'system'
  maxIterations?: number
}
