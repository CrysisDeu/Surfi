
import type { ModelConfig, BedrockModelConfig, OpenAIModelConfig, AnthropicModelConfig, CustomModelConfig } from '../../types'
import {
    callBedrockWithTools,
    callOpenAIWithTools,
    callAnthropicWithTools,
    callCustomWithTools
} from '../providers'

export interface LLMResponse {
    stopReason: 'end_turn' | 'tool_use' | 'error' | 'max_tokens'
    textContent?: string
    toolCalls: Array<{ name: string; input: any }>
    thinking: string
    error?: string
}

export class LLMClient {
    private model: ModelConfig | undefined

    constructor(model: ModelConfig | undefined) {
        this.model = model
    }

    async callWithTools(messages: Array<{ role: string, content: string }>): Promise<LLMResponse> {
        if (!this.model) {
            return { stopReason: 'error', error: 'No model configured', toolCalls: [], thinking: '' }
        }

        try {
            // Extract system message if present (usually first message)
            let systemPrompt = ''
            const conversationMessages = messages.filter(m => {
                if (m.role === 'system') {
                    systemPrompt = m.content
                    return false
                }
                return true
            })

            // Route to appropriate provider
            switch (this.model.provider) {
                case 'bedrock':
                    return await this.handleBedrock(this.model as BedrockModelConfig, systemPrompt, conversationMessages)
                case 'openai':
                    return await this.handleOpenAI(this.model as OpenAIModelConfig, systemPrompt, conversationMessages)
                case 'anthropic':
                    return await this.handleAnthropic(this.model as AnthropicModelConfig, systemPrompt, conversationMessages)
                case 'custom':
                    return await this.handleCustom(this.model as CustomModelConfig, systemPrompt, conversationMessages)
                default:
                    // @ts-ignore - this.model.provider might not match known types if config is invalid
                    return { stopReason: 'error', error: `Unknown provider: ${this.model?.provider}`, toolCalls: [], thinking: '' }
            }
        } catch (error) {
            return {
                stopReason: 'error',
                error: error instanceof Error ? error.message : 'Unknown LLM error',
                toolCalls: [],
                thinking: ''
            }
        }
    }

    private async handleBedrock(
        model: BedrockModelConfig,
        systemPrompt: string,
        messages: Array<{ role: string, content: string }>
    ): Promise<LLMResponse> {
        // Bedrock expects structured content array
        const bedrockMessages = messages.map(m => ({
            role: m.role,
            content: [{ text: m.content }]
        }))

        const response = await callBedrockWithTools(model, systemPrompt, bedrockMessages)

        // Normalize response
        const toolCalls: Array<{ name: string; input: any }> = []
        let thinking = ''

        if (response.stopReason === 'tool_use') {
            const toolUseBlocks = response.output?.message?.content?.filter((block: any) => block.toolUse) || []
            const textBlocks = response.output?.message?.content?.filter((block: any) => block.text) || []
            thinking = textBlocks.map((b: any) => b.text).join('\n')

            for (const block of toolUseBlocks) {
                if (block.toolUse) {
                    toolCalls.push({ name: block.toolUse.name, input: block.toolUse.input })
                }
            }
            return { stopReason: 'tool_use', toolCalls, thinking }
        } else {
            const textContent = response.output?.message?.content?.find((block: any) => block.text)?.text || ''
            return { stopReason: 'end_turn', textContent, toolCalls: [], thinking: '' }
        }
    }

    private async handleOpenAI(
        model: OpenAIModelConfig,
        systemPrompt: string,
        messages: Array<{ role: string, content: string }>
    ): Promise<LLMResponse> {
        // OpenAI expects simple string content usually, assuming callOpenAIWithTools handles it
        const response = await callOpenAIWithTools(model, systemPrompt, messages)

        const toolCalls: Array<{ name: string; input: any }> = []
        let thinking = ''

        if (response.stopReason === 'tool_calls' && response.message.tool_calls) {
            thinking = response.message.content || ''
            for (const toolCall of response.message.tool_calls) {
                try {
                    const input = JSON.parse(toolCall.function.arguments)
                    toolCalls.push({ name: toolCall.function.name, input })
                } catch (e) {
                    console.error('Failed to parse tool arguments:', e)
                }
            }
            return { stopReason: 'tool_use', toolCalls, thinking }
        } else {
            return { stopReason: 'end_turn', textContent: response.message.content || '', toolCalls: [], thinking: '' }
        }
    }

    private async handleCustom(
        model: CustomModelConfig,
        systemPrompt: string,
        messages: Array<{ role: string, content: string }>
    ): Promise<LLMResponse> {
        // Custom behaves like OpenAI
        // Cast to OpenAIModelConfig structure if they share response format, or handle specifically
        // Assuming callCustomWithTools returns similar structure to OpenAI
        const response = await callCustomWithTools(model, systemPrompt, messages)

        const toolCalls: Array<{ name: string; input: any }> = []
        let thinking = ''

        if (response.stopReason === 'tool_calls' && response.message.tool_calls) {
            thinking = response.message.content || ''
            for (const toolCall of response.message.tool_calls) {
                try {
                    const input = JSON.parse(toolCall.function.arguments)
                    toolCalls.push({ name: toolCall.function.name, input })
                } catch (e) {
                    console.error('Failed to parse tool arguments:', e)
                }
            }
            return { stopReason: 'tool_use', toolCalls, thinking }
        } else {
            return { stopReason: 'end_turn', textContent: response.message.content || '', toolCalls: [], thinking: '' }
        }
    }

    private async handleAnthropic(
        model: AnthropicModelConfig,
        systemPrompt: string,
        messages: Array<{ role: string, content: string }>
    ): Promise<LLMResponse> {
        const response = await callAnthropicWithTools(model, systemPrompt, messages)

        const toolCalls: Array<{ name: string; input: any }> = []
        let thinking = ''

        if (response.stopReason === 'tool_use') {
            for (const block of response.content) {
                if (block.type === 'text' && block.text) {
                    thinking += block.text
                } else if (block.type === 'tool_use' && block.name && block.input) {
                    toolCalls.push({ name: block.name, input: block.input })
                }
            }
            return { stopReason: 'tool_use', toolCalls, thinking }
        } else {
            const textContent = response.content.find(b => b.type === 'text')?.text || ''
            return { stopReason: 'end_turn', textContent, toolCalls: [], thinking: '' }
        }
    }
}
