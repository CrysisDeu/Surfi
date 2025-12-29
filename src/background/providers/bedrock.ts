import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  ConverseCommand,
  ConverseCommandInput,
  ConverseCommandOutput,
  Tool,
} from '@aws-sdk/client-bedrock-runtime'
import type { BedrockModelConfig } from '../../types'
import { getBedrockToolConfig } from '../tools/definitions'

interface ChatMessage {
  role: string
  content: string
}

/**
 * Create Bedrock client with credentials from config.
 * 
 * Note: Chrome extensions cannot access ~/.aws/credentials or environment variables
 * due to browser sandboxing. Users must either:
 * 1. Enter credentials manually in the extension settings
 * 2. Use the "Paste AWS Credentials" feature to import from CLI
 * 3. Set up a credential refresh workflow using `aws configure export-credentials`
 * 
 * The awsProfile field is stored for reference/documentation but cannot be used
 * directly in the browser environment.
 */
function createBedrockClient(model: BedrockModelConfig): BedrockRuntimeClient {
  const config: BedrockRuntimeClientConfig = {
    region: model.awsRegion || 'us-east-1',
  }

  // Use explicit credentials from model config
  if (model.awsAccessKeyId && model.awsSecretAccessKey) {
    config.credentials = {
      accessKeyId: model.awsAccessKeyId,
      secretAccessKey: model.awsSecretAccessKey,
      ...(model.awsSessionToken && { sessionToken: model.awsSessionToken }),
    }
  }
  // If no credentials provided, SDK will fail with clear error
  // This is better than silently failing with "default credential chain" in browser

  return new BedrockRuntimeClient(config)
}

export async function callBedrock(
  model: BedrockModelConfig,
  messages: ChatMessage[]
): Promise<string> {
  const client = createBedrockClient(model)

  const systemMessages = messages.filter((m) => m.role === 'system')
  const conversationMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: [{ text: m.content }],
    }))

  const input: ConverseCommandInput = {
    modelId: model.model,
    messages: conversationMessages,
    inferenceConfig: {
      maxTokens: model.maxTokens || 4096,
      temperature: model.temperature || 0.7,
    },
  }

  if (systemMessages.length > 0) {
    input.system = systemMessages.map((m) => ({ text: m.content }))
  }

  const command = new ConverseCommand(input)
  const response = await client.send(command)

  const textContent = response.output?.message?.content?.find(
    (block) => 'text' in block
  )
  return textContent && 'text' in textContent ? textContent.text || '' : ''
}

export interface BedrockToolResponse {
  stopReason: string
  output?: {
    message?: {
      content?: Array<{ text?: string; toolUse?: ToolUseBlock }>
    }
  }
}

interface ToolUseBlock {
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

export async function callBedrockWithTools(
  model: BedrockModelConfig,
  systemPrompt: string,
  conversationMessages: Array<{ role: string; content: unknown[] }>
): Promise<BedrockToolResponse> {
  const client = createBedrockClient(model)

  const mappedMessages = conversationMessages.map((m) => ({
    role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: m.content as Array<{ text: string }>,
  }))

  const toolConfig = getBedrockToolConfig()
  
  const input: ConverseCommandInput = {
    modelId: model.model,
    messages: mappedMessages,
    system: [{ text: systemPrompt }],
    toolConfig: {
      tools: toolConfig.tools as unknown as Tool[],
    },
    inferenceConfig: {
      maxTokens: model.maxTokens || 4096,
      temperature: model.temperature || 0.7,
    },
  }

  const command = new ConverseCommand(input)
  const response: ConverseCommandOutput = await client.send(command)

  return {
    stopReason: response.stopReason || 'end_turn',
    output: {
      message: {
        content: response.output?.message?.content?.map((block) => {
          if ('text' in block) {
            return { text: block.text }
          }
          if ('toolUse' in block && block.toolUse) {
            return {
              toolUse: {
                toolUseId: block.toolUse.toolUseId || '',
                name: block.toolUse.name || '',
                input: (block.toolUse.input as Record<string, unknown>) || {},
              },
            }
          }
          return {}
        }),
      },
    },
  }
}
