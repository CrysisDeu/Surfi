import type { ModelConfig } from '../types'

// Base form fields shared by all providers
interface BaseModelFormData {
  id: string
  name: string
  model: string
  maxTokens: number
  temperature: number
}

// Provider-specific form data types
export interface OpenAIFormData extends BaseModelFormData {
  provider: 'openai'
  apiEndpoint: string
  apiKey: string
}

export interface AnthropicFormData extends BaseModelFormData {
  provider: 'anthropic'
  apiEndpoint: string
  apiKey: string
}

export interface BedrockFormData extends BaseModelFormData {
  provider: 'bedrock'
  awsRegion: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsSessionToken: string
}

export interface CustomFormData extends BaseModelFormData {
  provider: 'custom'
  apiEndpoint: string
  apiKey: string
}

// Discriminated union of all form data types
export type ModelFormData = OpenAIFormData | AnthropicFormData | BedrockFormData | CustomFormData

// Type guard helpers
export function isAPIBasedForm(data: ModelFormData): data is OpenAIFormData | AnthropicFormData | CustomFormData {
  return data.provider === 'openai' || data.provider === 'anthropic' || data.provider === 'custom'
}

export function isBedrockForm(data: ModelFormData): data is BedrockFormData {
  return data.provider === 'bedrock'
}

// Factory functions for creating empty form data by provider
export function createEmptyFormData(provider: ModelFormData['provider'] = 'custom'): ModelFormData {
  const base = {
    id: `model-${Date.now()}`,
    name: 'New Model',
    maxTokens: 4096,
    temperature: 0.7,
  }

  switch (provider) {
    case 'openai':
      return {
        ...base,
        provider: 'openai',
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-4',
      }
    case 'anthropic':
      return {
        ...base,
        provider: 'anthropic',
        apiEndpoint: 'https://api.anthropic.com/v1/messages',
        apiKey: '',
        model: 'claude-3-sonnet-20240229',
      }
    case 'bedrock':
      return {
        ...base,
        provider: 'bedrock',
        awsRegion: 'us-east-1',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsSessionToken: '',
        model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      }
    case 'custom':
      return {
        ...base,
        provider: 'custom',
        apiEndpoint: '',
        apiKey: '',
        model: '',
      }
  }
}

export function formDataToModelConfig(data: ModelFormData): ModelConfig {
  const base = {
    id: data.id,
    name: data.name,
    model: data.model,
    maxTokens: data.maxTokens,
    temperature: data.temperature,
  }

  switch (data.provider) {
    case 'openai':
      return { ...base, provider: 'openai', apiEndpoint: data.apiEndpoint, apiKey: data.apiKey }
    case 'anthropic':
      return { ...base, provider: 'anthropic', apiEndpoint: data.apiEndpoint, apiKey: data.apiKey }
    case 'bedrock':
      return {
        ...base,
        provider: 'bedrock',
        awsRegion: data.awsRegion || 'us-east-1',
        awsAccessKeyId: data.awsAccessKeyId,
        awsSecretAccessKey: data.awsSecretAccessKey,
        ...(data.awsSessionToken ? { awsSessionToken: data.awsSessionToken } : {}),
      }
    case 'custom':
      return { ...base, provider: 'custom', apiEndpoint: data.apiEndpoint, apiKey: data.apiKey }
  }
}

export function modelConfigToFormData(config: ModelConfig): ModelFormData {
  const base = {
    id: config.id,
    name: config.name,
    model: config.model,
    maxTokens: config.maxTokens || 4096,
    temperature: config.temperature || 0.7,
  }

  switch (config.provider) {
    case 'openai':
      return { ...base, provider: 'openai', apiEndpoint: config.apiEndpoint, apiKey: config.apiKey }
    case 'anthropic':
      return { ...base, provider: 'anthropic', apiEndpoint: config.apiEndpoint, apiKey: config.apiKey }
    case 'custom':
      return { ...base, provider: 'custom', apiEndpoint: config.apiEndpoint, apiKey: config.apiKey }
    case 'bedrock':
      return {
        ...base,
        provider: 'bedrock',
        awsRegion: config.awsRegion,
        awsAccessKeyId: config.awsAccessKeyId,
        awsSecretAccessKey: config.awsSecretAccessKey,
        awsSessionToken: config.awsSessionToken || '',
      }
  }
}

export function getModelEndpointDisplay(model: ModelConfig): string {
  switch (model.provider) {
    case 'bedrock':
      return `AWS Bedrock (${model.awsRegion})`
    default:
      return model.apiEndpoint
  }
}

/**
 * Parse AWS credentials from export statements blob
 * Handles formats like:
 * - export AWS_ACCESS_KEY_ID=value
 * - AWS_ACCESS_KEY_ID=value
 */
export function parseAWSCredentialsBlob(blob: string): {
  awsAccessKeyId?: string
  awsSecretAccessKey?: string
  awsSessionToken?: string
} {
  const result: {
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsSessionToken?: string
  } = {}

  const accessKeyMatch = blob.match(/(?:export\s+)?AWS_ACCESS_KEY_ID=([^\s\n]+)/)
  const secretKeyMatch = blob.match(/(?:export\s+)?AWS_SECRET_ACCESS_KEY=([^\s\n]+)/)
  const sessionTokenMatch = blob.match(/(?:export\s+)?AWS_SESSION_TOKEN=([^\s\n]+)/)

  if (accessKeyMatch) result.awsAccessKeyId = accessKeyMatch[1]
  if (secretKeyMatch) result.awsSecretAccessKey = secretKeyMatch[1]
  if (sessionTokenMatch) result.awsSessionToken = sessionTokenMatch[1]

  return result
}
