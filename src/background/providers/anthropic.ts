import type { AnthropicModelConfig } from '../../types'
import { allBrowserTools } from '../tools/browser-tools'

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
      'anthropic-dangerous-direct-browser-access': 'true',
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

// Convert browser tools to Anthropic tool format
function getAnthropicTools() {
  return allBrowserTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }))
}

export interface AnthropicToolResponse {
  stopReason: 'tool_use' | 'end_turn' | 'max_tokens'
  content: Array<{
    type: 'text' | 'tool_use'
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
  }>
}

export async function callAnthropicWithTools(
  model: AnthropicModelConfig,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): Promise<AnthropicToolResponse> {
  const response = await fetch(model.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': model.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model.model,
      max_tokens: model.maxTokens || 4096,
      system: systemPrompt,
      messages,
      tools: getAnthropicTools(),
      tool_choice: { type: 'auto' },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()

  // Map Anthropic stop reasons to our format
  let stopReason: 'tool_use' | 'end_turn' | 'max_tokens'
  if (data.stop_reason === 'tool_use') {
    stopReason = 'tool_use'
  } else if (data.stop_reason === 'max_tokens') {
    stopReason = 'max_tokens'
  } else {
    stopReason = 'end_turn'
  }

  return {
    stopReason,
    content: data.content || [],
  }
}
