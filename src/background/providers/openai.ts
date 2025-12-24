import type { OpenAIModelConfig } from '../../types'

interface ChatMessage {
  role: string
  content: string
}

export async function callOpenAI(
  model: OpenAIModelConfig,
  messages: ChatMessage[]
): Promise<string> {
  const response = await fetch(model.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages,
      max_tokens: model.maxTokens,
      temperature: model.temperature,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
