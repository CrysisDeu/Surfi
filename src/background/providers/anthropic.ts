import type { AnthropicModelConfig } from '../../types'

interface ChatMessage {
  role: string
  content: string
}

export async function callAnthropic(
  model: AnthropicModelConfig,
  messages: ChatMessage[]
): Promise<string> {
  const response = await fetch(model.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': model.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.model,
      max_tokens: model.maxTokens || 4096,
      messages: messages.filter((m) => m.role !== 'system'),
      system: messages.find((m) => m.role === 'system')?.content,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}
