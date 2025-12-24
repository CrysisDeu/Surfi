import type { ModelConfig } from '../types'

// Form data type that can hold all fields from any provider
export interface ModelFormData {
  id: string
  name: string
  provider: 'openai' | 'anthropic' | 'bedrock' | 'custom'
  model: string
  maxTokens: number
  temperature: number
  // API-based providers
  apiEndpoint: string
  apiKey: string
  // Bedrock-specific
  awsRegion: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsSessionToken: string
}

export function createEmptyFormData(provider: ModelFormData['provider'] = 'custom'): ModelFormData {
  return {
    id: `model-${Date.now()}`,
    name: 'New Model',
    provider,
    apiEndpoint: '',
    apiKey: '',
    model: '',
    maxTokens: 4096,
    temperature: 0.7,
    awsRegion: 'us-east-1',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsSessionToken: '',
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
        awsRegion: data.awsRegion,
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
    provider: config.provider,
    model: config.model,
    maxTokens: config.maxTokens || 4096,
    temperature: config.temperature || 0.7,
    apiEndpoint: '',
    apiKey: '',
    awsRegion: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsSessionToken: '',
  }

  switch (config.provider) {
    case 'openai':
    case 'anthropic':
    case 'custom':
      return { ...base, apiEndpoint: config.apiEndpoint, apiKey: config.apiKey }
    case 'bedrock':
      return {
        ...base,
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
