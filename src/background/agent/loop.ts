// Agent Loop (Browser-Use Style ReAct Loop)
// Main agent loop that orchestrates model calls and action execution

import type { ChatRequest, Settings, ModelConfig, BedrockModelConfig, OpenAIModelConfig, AnthropicModelConfig, CustomModelConfig } from '../../types'
import { callModelAPI, callBedrockWithTools, callOpenAIWithTools, callAnthropicWithTools, callCustomWithTools, hasValidCredentials } from '../providers'
import { agentFocusTabId, getTabsInfo } from '../tab-manager'
import { getPageContext, getPageContextWithRetry, type PageContext } from '../browser'
import { executeAction, toolInputToAction } from '../controller'
import { 
  tabTools, 
  navigationTools, 
  interactionTools, 
  dropdownTools, 
  extractionTools, 
  completionTools 
} from '../tools/browser-tools'

// ============================================================================
// Types
// ============================================================================

interface HistoryItem {
  stepNumber: number
  evaluation?: string  // "Success: clicked login" or "Failed: element not found"
  memory?: string      // Key information to remember
  nextGoal?: string    // What the model planned to do
  result?: string      // Action execution result
  error?: string       // Error if any
}

interface AgentState {
  historyItems: HistoryItem[]
  stepNumber: number
}

// ============================================================================
// History Formatting
// ============================================================================

function formatAgentHistory(historyItems: HistoryItem[], maxItems: number = 10): string {
  if (historyItems.length === 0) return ''
  
  const items = historyItems.length > maxItems
    ? [
        historyItems[0],
        { stepNumber: -1, result: `[... ${historyItems.length - maxItems} steps omitted ...]` },
        ...historyItems.slice(-maxItems + 1)
      ]
    : historyItems
  
  return items.map(item => {
    if (item.stepNumber === -1) return item.result
    
    const parts = [`Step ${item.stepNumber}:`]
    if (item.evaluation) parts.push(`  Eval: ${item.evaluation}`)
    if (item.memory) parts.push(`  Memory: ${item.memory}`)
    if (item.nextGoal) parts.push(`  Goal: ${item.nextGoal}`)
    if (item.result) parts.push(`  Result: ${item.result}`)
    if (item.error) parts.push(`  Error: ${item.error}`)
    return parts.join('\n')
  }).join('\n\n')
}

// ============================================================================
// Tool List Formatting
// ============================================================================

function formatToolForPrompt(tool: { name: string; description: string; inputSchema: { properties: Record<string, unknown>; required: string[] } }): string {
  const params: string[] = []
  
  // Build parameter list from inputSchema
  for (const [paramName, paramDef] of Object.entries(tool.inputSchema.properties)) {
    const param = paramDef as { type?: string; description?: string; enum?: unknown[] }
    const isRequired = tool.inputSchema.required.includes(paramName)
    const paramType = param.type || 'string'
    const optional = isRequired ? '' : '?'
    
    // Handle enum types
    let typeStr = paramType
    if (param.enum && Array.isArray(param.enum)) {
      typeStr = param.enum.map(e => String(e)).join('|')
    }
    
    params.push(`${paramName}${optional}: ${typeStr}`)
  }
  
  const paramsStr = params.length > 0 ? `(${params.join(', ')})` : '()'
  return `- ${tool.name}${paramsStr}: ${tool.description}`
}

function formatToolsSectionForPrompt(): string {
  const sections = [
    { title: 'Navigation', tools: navigationTools },
    { title: 'Tab Management', tools: tabTools },
    { title: 'Element Interaction', tools: interactionTools },
    { title: 'Dropdowns', tools: dropdownTools },
    { title: 'Content', tools: extractionTools },
    { title: 'Completion', tools: completionTools },
  ]
  
  const lines: string[] = []
  for (const section of sections) {
    if (section.tools.length > 0) {
      lines.push(`${section.title}:`)
      for (const tool of section.tools) {
        lines.push(formatToolForPrompt(tool))
      }
      lines.push('') // Empty line between sections
    }
  }
  
  return lines.join('\n').trim()
}

// ============================================================================
// System Prompt Building
// ============================================================================

function buildSimpleSystemPrompt(pageContext: PageContext): string {
  return `You are Surfi, an autonomous browser agent that helps users interact with web pages.

You can see the current state of the page and use tools to interact with it.
Interactive elements are marked with [id] numbers that you can reference in actions.
Scrollable containers are marked with |SCROLL| or |SCROLL[id]|.

## Current Page State
URL: ${pageContext.url}
Title: ${pageContext.title}
Interactive Elements: ${pageContext.interactiveCount}
${pageContext.selectedText ? `Selected Text: ${pageContext.selectedText}` : ''}

## DOM Structure
\`\`\`
${pageContext.domTree || 'Page content not available'}
\`\`\`

## How to Use Tools
- To click an element: Use click tool with the [id] number as "index" (e.g., index: 5)
- To type text: Use type tool with index and text (e.g., index: 5, text: "hello")
- To scroll: Use scroll tool with direction "up" or "down"
- To navigate: Use navigate tool with a URL
- To send keys: Use send_keys tool with keys like "Enter", "Tab", "Control+a"
- To go back: Use go_back tool
- To wait: Use wait tool with seconds (default 3)
- To extract data: Use extract tool with a query
- To select dropdown option: Use select_option tool with index and option text

## Guidelines
1. When asked to do something, use your tools to actually DO it
2. Reference elements by their [id] number shown in the DOM structure
3. After each action, you'll receive updated page state
4. Be proactive - perform actions rather than just explaining
5. If an element isn't visible, try scrolling first`
}

function buildSystemPromptWithHistory(
  pageContext: PageContext, 
  task: string, 
  agentState: AgentState,
  readState?: string | null,
  extractionResults?: Array<{ query: string; content: string; step: number }>
): string {
  const historySection = agentState.historyItems.length > 0
    ? `<agent_history>\n${formatAgentHistory(agentState.historyItems)}\n</agent_history>\n`
    : ''

  // Browser-use style: Add read_state for one-time extraction results
  const readStateSection = readState
    ? `<read_state>\n${readState}\n</read_state>\n`
    : ''

  // Nanobrowser style: Add persistent extraction results
  const extractionSection = extractionResults && extractionResults.length > 0
    ? `<extracted_data>\n${extractionResults.map((e, i) => 
        `[Extraction ${i + 1} from Step ${e.step}]\nQuery: "${e.query}"\nResult:\n${e.content}\n`
      ).join('\n')}</extracted_data>\n`
    : ''

  // Browser-use style page markers
  let domContent = pageContext.domTree || 'empty page'
  if (domContent && domContent !== 'empty page') {
    domContent = `[Start of page]\n${domContent}\n[End of page]`
  }

  // Get tabs info for multi-tab awareness
  const tabsInfo = getTabsInfo()

  return `You are an AI agent designed to automate browser tasks. Your goal is to accomplish the <user_request>.

<user_request>
${task}
</user_request>

${historySection}${readStateSection}${extractionSection}<open_tabs>
The arrow (→) indicates your current focused tab. Use switch_tab(tab_id) to change focus.
${tabsInfo}
</open_tabs>

<browser_state>
Current URL: ${pageContext.url}
Title: ${pageContext.title}
Interactive Elements: ${pageContext.interactiveCount}

Interactive elements are shown as [index]<type>text</type> where:
- index: Numeric identifier for interaction (use this in tool calls)
- type: HTML element type (button, input, link, etc.)
- text: Element description or content

${domContent}
</browser_state>

<available_tools>
${formatToolsSectionForPrompt()}
</available_tools>

<browser_rules>
- Only interact with elements that have a numeric [index]
- If expected elements are missing, try scrolling or waiting
- After input actions, you may need to press Enter or click a button
- If action sequence is interrupted, the page changed - analyze new state
- Use wait() if page is still loading
- Call done() when task is complete or cannot proceed
</browser_rules>

<efficiency_guidelines>
You can chain multiple actions per step for efficiency:
- input_text + click → Fill field and submit
- input_text + send_keys(Enter) → Fill field and press Enter
- scroll + click → Scroll to element then click
- click + click → Multiple clicks (if page doesn't navigate between)

Do NOT chain actions that change page significantly (navigate + click won't work).
</efficiency_guidelines>

<output_format>
Before calling any tool, you MUST output your reasoning in this EXACT format:

EVAL: [Success/Failed/N/A] - Brief evaluation of whether the previous action achieved its goal
MEMORY: [Key information discovered that should be remembered - extracted data, findings, etc.]
GOAL: [What you will do next and why]

Then call the appropriate tool.
</output_format>

<reasoning_rules>
1. ALWAYS evaluate: Did the previous action work? Check browser_state!
2. ALWAYS save to memory: What key information did you learn? DON'T LOSE IT!
3. NEVER repeat actions: Check agent_history - if you already searched/navigated somewhere, the results are NOW VISIBLE in browser_state
4. READ the page: After search/navigate, the content is in browser_state - extract what you need!
5. If stuck: Try different approach or call done(success=false) with what you found
</reasoning_rules>

<step_info>Step ${agentState.stepNumber}</step_info>`
}

// ============================================================================
// Settings Helpers
// ============================================================================

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('settings')
  const DEFAULT_SETTINGS: Settings = {
    activeModelId: 'default',
    models: [],
    theme: 'dark',
  }
  return result.settings || DEFAULT_SETTINGS
}

export async function getActiveModel(): Promise<ModelConfig | undefined> {
  const settings = await getSettings()
  return settings.models.find((m) => m.id === settings.activeModelId)
}

// ============================================================================
// Main Agent Loop
// ============================================================================

export async function handleAgentLoop(request: ChatRequest, port: chrome.runtime.Port): Promise<void> {
  const model = await getActiveModel()

  if (!model) {
    port.postMessage({ type: 'error', error: 'No model configured. Please configure a model in settings.' })
    return
  }

  if (!hasValidCredentials(model)) {
    port.postMessage({
      type: 'error',
      error: 'Credentials not configured. Please add your API key or AWS credentials in settings.',
    })
    return
  }

  // Get the current active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  
  // Helper function to get current target tab ID (agent focus or active)
  const getTargetTabId = (): number | null => {
    return agentFocusTabId || activeTab?.id || null
  }
  
  // Get initial page context from agent's focused tab
  let pageContext: PageContext = { 
    url: '', 
    title: '', 
    domTree: '', 
    interactiveCount: 0, 
    selectorMap: {} 
  }

  const targetTabId = getTargetTabId()
  if (targetTabId) {
    try {
      pageContext = await getPageContext(targetTabId)
    } catch (error) {
      console.warn('Could not get page context:', error)
    }
  }

  // Browser-use style: Initialize agent state for history tracking
  const agentState: AgentState = {
    historyItems: [],
    stepNumber: 0
  }
  
  // Track extraction results (nanobrowser style - persist across multiple turns)
  const extractionResults: Array<{ query: string; content: string; step: number }> = []
  
  // Track extraction results for read_state (browser-use style one-time display)
  let readStateContent: string | null = null

  // Build full conversation context from all messages
  const conversationContext = request.payload.messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')
  
  // Get the latest user message as the primary task
  const userMessages = request.payload.messages.filter(m => m.role === 'user')
  const latestUserMessage = userMessages[userMessages.length - 1]?.content || ''

  // All providers now support tool use
  const supportsToolUse = ['bedrock', 'openai', 'anthropic', 'custom'].includes(model.provider)
  
  // Fallback for unknown providers
  if (!supportsToolUse) {
    const systemPrompt = buildSystemPromptWithHistory(pageContext, conversationContext, agentState)
    const response = await callModelAPI(model, [
      { role: 'system', content: systemPrompt },
      ...request.payload.messages,
    ])
    port.postMessage({ type: 'chunk', content: response })
    port.postMessage({ type: 'done' })
    return
  }

  // ReAct loop with tool use (Bedrock and OpenAI)
  const settings = await getSettings()
  const MAX_ITERATIONS = settings.maxIterations || 10

  // Track tool results to add to conversation
  const toolResults: Array<{ role: 'assistant'; content: string }> = []
  // Track recent extract_content calls to detect loops
  const recentExtractions: Array<{ query: string; step: number }> = []

  while (agentState.stepNumber < MAX_ITERATIONS) {
    agentState.stepNumber++
    
    // Get current target tab (agent focus takes priority)
    const currentTabId = getTargetTabId()
    
    // BROWSER-USE STYLE: Always refresh DOM at the START of each iteration
    if (currentTabId) {
      try {
        pageContext = await getPageContextWithRetry(currentTabId, 3, 500)
      } catch (error) {
        console.warn('[Surfi] Could not refresh page context:', error)
      }
    }
    
    // Build system prompt with current history (browser-use style)
    const systemPrompt = buildSystemPromptWithHistory(pageContext, conversationContext, agentState, readStateContent, extractionResults)

    // Send prompt info to sidepanel for debugging
    port.postMessage({
      type: 'prompt_debug',
      stepNumber: agentState.stepNumber,
      systemPrompt: systemPrompt,
      url: pageContext.url,
      interactiveCount: pageContext.interactiveCount,
    })

    // Build conversation message with tool results
    const userMessage = `Current request: ${latestUserMessage}\n\nPlease analyze the current page state and take the next action.`
    
    // Call the appropriate provider with tools
    let toolCalls: Array<{ name: string; input: Record<string, unknown> }> = []
    let modelThinking = ''
    
    if (model.provider === 'bedrock') {
      const conversationMessages: Array<{ role: string; content: unknown[] }> = [
        { role: 'user', content: [{ text: userMessage }] },
        ...toolResults.map(result => ({ role: 'assistant', content: [{ text: result.content }] }))
      ]
      
      const response = await callBedrockWithTools(
        model as BedrockModelConfig,
        systemPrompt,
        conversationMessages
      )
      
      if (response.stopReason === 'tool_use') {
        const toolUseBlocks = response.output?.message?.content?.filter((block: { toolUse?: unknown }) => block.toolUse) || []
        const textBlocks = response.output?.message?.content?.filter((block: { text?: string }) => block.text) || []
        modelThinking = textBlocks.map((b: { text?: string }) => b.text).join('\n')
        
        for (const block of toolUseBlocks) {
          const toolUse = block.toolUse!
          toolCalls.push({ name: toolUse.name, input: toolUse.input as Record<string, unknown> })
        }
      } else {
        // Model finished without tool use
        const textContent = response.output?.message?.content?.find((block: { text?: string }) => block.text)
        if (textContent?.text) {
          port.postMessage({ type: 'chunk', content: textContent.text })
        }
        break
      }
    } else if (model.provider === 'openai' || model.provider === 'custom') {
      // OpenAI and Custom (Ollama, vLLM, etc.) use the same format
      const conversationMessages = [
        { role: 'user', content: userMessage },
        ...toolResults
      ]
      
      const response = model.provider === 'openai'
        ? await callOpenAIWithTools(model as OpenAIModelConfig, systemPrompt, conversationMessages)
        : await callCustomWithTools(model as CustomModelConfig, systemPrompt, conversationMessages)
      
      if (response.stopReason === 'tool_calls' && response.message.tool_calls) {
        modelThinking = response.message.content || ''
        
        for (const toolCall of response.message.tool_calls) {
          try {
            const input = JSON.parse(toolCall.function.arguments)
            toolCalls.push({ name: toolCall.function.name, input })
          } catch (e) {
            console.error('Failed to parse tool arguments:', e)
          }
        }
      } else {
        // Model finished without tool use
        if (response.message.content) {
          port.postMessage({ type: 'chunk', content: response.message.content })
        }
        break
      }
    } else if (model.provider === 'anthropic') {
      const conversationMessages = [
        { role: 'user', content: userMessage },
        ...toolResults
      ]
      
      const response = await callAnthropicWithTools(
        model as AnthropicModelConfig,
        systemPrompt,
        conversationMessages
      )
      
      if (response.stopReason === 'tool_use') {
        // Extract text and tool use from content blocks
        for (const block of response.content) {
          if (block.type === 'text' && block.text) {
            modelThinking += block.text
          } else if (block.type === 'tool_use' && block.name && block.input) {
            toolCalls.push({ name: block.name, input: block.input })
          }
        }
      } else {
        // Model finished without tool use
        const textContent = response.content.find(b => b.type === 'text')?.text
        if (textContent) {
          port.postMessage({ type: 'chunk', content: textContent })
        }
        break
      }
    }

    // Process tool calls (unified for both providers)
    for (const { name: toolName, input: toolInput } of toolCalls) {

        // Handle "done" action directly - show final result nicely
        if (toolName === 'done') {
          const doneMessage = toolInput.message as string || toolInput.text as string || 'Task completed'
          const doneSuccess = toolInput.success !== false
          
          port.postMessage({ 
            type: 'chunk', 
            content: `\n${doneSuccess ? '✅' : '❌'} **Result:**\n${doneMessage}\n`
          })
          port.postMessage({ type: 'done' })
          return
        }

        // Send tool call info to user
        port.postMessage({
          type: 'chunk',
          content: `\n🔧 Step ${agentState.stepNumber}: ${toolName}(${JSON.stringify(toolInput)})\n`,
        })

        // Detect repeated extract_content calls with same query
        if (toolName === 'extract_content' && toolInput.query) {
          const query = toolInput.query as string
          const recentSameQuery = recentExtractions.filter(e => e.query === query)
          if (recentSameQuery.length >= 2) {
            // Same query called 3+ times - likely stuck in loop
            port.postMessage({ 
              type: 'chunk', 
              content: `\n⚠️ Detected repeated extraction of same query. Consider calling done() with the extracted information.\n` 
            })
            // Add a helpful message to conversation
            toolResults.push({
              role: 'assistant',
              content: `I've extracted information for "${query}" multiple times. The extracted content is available in the history above. If you have the information needed, please call done() to complete the task.`
            })
          }
          // Track this extraction
          recentExtractions.push({ query, step: agentState.stepNumber })
          // Keep only last 5 extractions
          if (recentExtractions.length > 5) {
            recentExtractions.shift()
          }
        }

        // Execute the tool
        let toolResult: { success: boolean; error?: string; content?: string }

        if (currentTabId) {
          const actionParams = toolInputToAction(toolName, toolInput)
          toolResult = await executeAction(currentTabId, actionParams)

          // After action, refresh page context
          if (toolResult.success) {
            const isTabSwitch = ['switch_tab'].includes(toolName)
            if (isTabSwitch && agentFocusTabId) {
              await new Promise(resolve => setTimeout(resolve, 500))
              pageContext = await getPageContext(agentFocusTabId)
            } else {
              const isNavigation = ['navigate', 'search', 'go_back'].includes(toolName)
              const waitTime = isNavigation ? 3000 : 500
              
              await new Promise(resolve => setTimeout(resolve, waitTime))
              
              const targetTab = getTargetTabId()
              if (targetTab) {
                if (isNavigation) {
                  pageContext = await getPageContextWithRetry(targetTab, 3, 1000)
                } else {
                  pageContext = await getPageContext(targetTab)
                }
              }
            }
          }
        } else {
          toolResult = { success: false, error: 'No active tab' }
        }

        // Add to history (browser-use style)
        const historyItem: HistoryItem = {
          stepNumber: agentState.stepNumber,
          evaluation: toolResult.success 
            ? `Success: ${toolName}` 
            : `Failed: ${toolResult.error}`,
          memory: toolResult.content || undefined,
          nextGoal: modelThinking.slice(0, 200) || undefined,
          result: `${toolName}(${JSON.stringify(toolInput)}) → ${toolResult.success ? 'OK' : toolResult.error}`,
          error: toolResult.error
        }
        agentState.historyItems.push(historyItem)

        // Show result
        if (toolResult.success) {
          port.postMessage({ type: 'chunk', content: '✅ Done\n' })
          
          // For extract_content, add result to read_state (browser-use style one-time display)
          // AND persist in extractionResults (nanobrowser style)
          if (toolName === 'extract_content' && toolResult.content) {
            const query = toolInput.query as string
            
            // Format extraction result for read_state (shown in next step only)
            let extractedContent = toolResult.content
            // Truncate if too long (browser-use uses 60k, we'll use 10k for now)
            if (extractedContent.length > 10000) {
              extractedContent = extractedContent.substring(0, 10000) + '\n\n[... content truncated at 10k characters ...]'
            }
            
            // Set read_state for next iteration (browser-use style - one-time display)
            readStateContent = `Query: "${query}"\n\nExtracted Content:\n${extractedContent}`
            
            // Also persist in extractionResults (nanobrowser style - multiple turns)
            extractionResults.push({
              query,
              content: toolResult.content, // Keep full content in persistent storage
              step: agentState.stepNumber
            })
            
            // Keep only last 10 extractions to avoid token bloat (can summarize later if needed)
            if (extractionResults.length > 10) {
              extractionResults.shift()
            }
            
            // Also add to conversation for immediate visibility
            const extractionMessage = `Extracted information for query "${query}":\n\n${extractedContent.substring(0, 2000)}${extractedContent.length > 2000 ? '\n\n[... truncated ...]' : ''}`
            toolResults.push({
              role: 'assistant',
              content: extractionMessage
            })
            
            // Keep only last 3 tool results to avoid token bloat
            if (toolResults.length > 3) {
              toolResults.shift()
            }
          } else {
            // Clear read_state after it's been shown once (browser-use style)
            readStateContent = null
          }
        } else {
          port.postMessage({ type: 'chunk', content: `❌ ${toolResult.error}\n` })
          if (toolResult.content) {
            port.postMessage({ 
              type: 'chunk', 
              content: `\n📋 Debug info:\n\`\`\`\n${toolResult.content}\n\`\`\`\n` 
            })
          }
        }
      }
  }

  if (agentState.stepNumber >= MAX_ITERATIONS) {
    port.postMessage({ type: 'chunk', content: '\n\n⚠️ Reached maximum iterations. Stopping.' })
  }

  port.postMessage({ type: 'done' })
}

// ============================================================================
// Simple Chat Handler (Non-agent, for non-streaming)
// ============================================================================

export async function handleChatMessage(
  request: ChatRequest
): Promise<{ content: string; error?: string }> {
  const model = await getActiveModel()

  if (!model) {
    return { content: '', error: 'No model configured. Please configure a model in settings.' }
  }

  if (!hasValidCredentials(model)) {
    return {
      content: '',
      error: 'Credentials not configured. Please add your API key or AWS credentials in settings.',
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let pageContext: PageContext = { 
    url: '', 
    title: '', 
    domTree: '', 
    interactiveCount: 0,
    selectorMap: {} 
  }

  if (tab?.id) {
    try {
      pageContext = await getPageContext(tab.id)
    } catch (error) {
      console.warn('Could not get page context:', error)
    }
  }

  const systemPrompt = buildSimpleSystemPrompt(pageContext)

  const messages = [
    { role: 'system', content: systemPrompt },
    ...request.payload.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  try {
    const response = await callModelAPI(model, messages)
    return { content: response }
  } catch (error) {
    console.error('API call failed:', error)
    return {
      content: '',
      error: error instanceof Error ? error.message : 'Failed to get response from AI',
    }
  }
}
