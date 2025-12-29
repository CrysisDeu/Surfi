import type { Settings } from '../types'

export const DEFAULT_SETTINGS: Settings = {
  activeModelId: 'default',
  models: [
    {
      id: 'default',
      name: 'OpenAI GPT-4',
      provider: 'openai',
      apiEndpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      model: 'gpt-4',
      maxTokens: 4096,
      temperature: 0.7,
    },
  ],
  theme: 'dark',
}

export const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
] as const

export const MODEL_PRESETS = {
  openai: {
    id: 'openai',
    name: 'OpenAI GPT-4',
    provider: 'openai' as const,
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    provider: 'anthropic' as const,
    apiEndpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-sonnet-20240229',
  },
  bedrock: {
    id: 'bedrock',
    name: 'AWS Bedrock Claude Sonnet 4.5',
    provider: 'bedrock' as const,
    model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    awsRegion: 'us-east-1',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    provider: 'custom' as const,
    apiEndpoint: 'http://localhost:11434/v1/chat/completions',
    apiKey: 'ollama',
    model: 'llama2',
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    provider: 'custom' as const,
    apiEndpoint: '',
    model: '',
  },
} as const
