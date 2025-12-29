import type { CustomModelConfig } from '../../types'
import { allBrowserTools } from '../tools/browser-tools'

interface ChatMessage {
  role: string
  content: string
}

export async function callCustom(
  model: CustomModelConfig,
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
    throw new Error(`API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

// Convert browser tools to OpenAI-compatible function format (used by Ollama, vLLM, etc.)
function getOpenAICompatibleTools() {
  return allBrowserTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))
}

export interface CustomToolResponse {
  stopReason: 'tool_calls' | 'stop' | 'length'
  message: {
    content: string | null
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: {
        name: string
        arguments: string
      }
    }>
  }
}

export async function callCustomWithTools(
  model: CustomModelConfig,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): Promise<CustomToolResponse> {
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const response = await fetch(model.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${model.apiKey}`,
    },
    body: JSON.stringify({
      model: model.model,
      messages: fullMessages,
      max_tokens: model.maxTokens || 4096,
      temperature: model.temperature || 0.7,
      tools: getOpenAICompatibleTools(),
      tool_choice: 'auto',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const choice = data.choices?.[0]

  if (!choice) {
    throw new Error('No response from API')
  }

  // Map finish reasons to our format (compatible with OpenAI, Ollama, vLLM)
  let stopReason: 'tool_calls' | 'stop' | 'length'
  if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'function_call') {
    stopReason = 'tool_calls'
  } else if (choice.finish_reason === 'length') {
    stopReason = 'length'
  } else {
    stopReason = 'stop'
  }

  return {
    stopReason,
    message: choice.message,
  }
}
