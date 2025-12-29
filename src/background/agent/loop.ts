// Agent Loop (Browser-Use Style ReAct Loop)
// Main agent loop that orchestrates model calls and action execution

import type { ChatRequest, Settings, ModelConfig, BedrockModelConfig } from '../../types'
import { callModelAPI, callBedrockWithTools, hasValidCredentials } from '../providers'
import { agentFocusTabId, getTabsInfo } from '../tab-manager'
import { getPageContext, getPageContextWithRetry, type PageContext } from '../browser'
import { executeAction, toolInputToAction } from '../controller'

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
  agentState: AgentState
): string {
  const historySection = agentState.historyItems.length > 0
    ? `<agent_history>\n${formatAgentHistory(agentState.historyItems)}\n</agent_history>\n`
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

${historySection}<open_tabs>
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
Navigation:
- search(query, engine?): Search the web (google/duckduckgo/bing)
- navigate(url, new_tab?): Navigate to URL (new_tab=true opens in new tab)
- go_back(): Go back in history
- wait(seconds?): Wait for page load (default 3s, max 30s)

Tab Management:
- switch_tab(tab_id): Switch agent focus to a different tab
- close_tab(tab_id): Close a specific tab

Element Interaction:
- click(index): Click element by [index] number
- input_text(index, text, clear?): Type text into input field
- scroll(down?, pages?, index?): Scroll page or element
- send_keys(keys): Send keyboard keys (Enter, Tab, Control+a, etc.)

Dropdowns:
- get_dropdown_options(index): Get options from dropdown
- select_dropdown_option(index, text): Select option by text

Content:
- extract_content(query): Extract information from page
- find_text(text): Find and scroll to text

Completion:
- done(text, success?): Signal task complete with summary
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

<reasoning_rules>
Before each action:
1. Evaluate previous action: Did it succeed? Check browser_state for expected changes.
2. Track progress: What have you accomplished toward the goal?
3. Plan next step: What's the immediate next action to make progress?
4. If stuck (repeating same action), try alternative approaches.
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

async function getActiveModel(): Promise<ModelConfig | undefined> {
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

  // Build full conversation context from all messages
  const conversationContext = request.payload.messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')
  
  // Get the latest user message as the primary task
  const userMessages = request.payload.messages.filter(m => m.role === 'user')
  const latestUserMessage = userMessages[userMessages.length - 1]?.content || ''

  // Non-Bedrock providers: simple response without tool use
  if (model.provider !== 'bedrock') {
    const systemPrompt = buildSystemPromptWithHistory(pageContext, conversationContext, agentState)
    const response = await callModelAPI(model, [
      { role: 'system', content: systemPrompt },
      ...request.payload.messages,
    ])
    port.postMessage({ type: 'chunk', content: response })
    port.postMessage({ type: 'done' })
    return
  }

  // Bedrock ReAct loop with tool use
  const settings = await getSettings()
  const MAX_ITERATIONS = settings.maxIterations || 10

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
    const systemPrompt = buildSystemPromptWithHistory(pageContext, conversationContext, agentState)

    // Send prompt info to sidepanel for debugging
    port.postMessage({
      type: 'prompt_debug',
      stepNumber: agentState.stepNumber,
      systemPrompt: systemPrompt,
      url: pageContext.url,
      interactiveCount: pageContext.interactiveCount,
    })

    // Build conversation - include latest user message for context
    const conversationMessages: Array<{ role: string; content: unknown[] }> = [
      {
        role: 'user',
        content: [{ text: `Current request: ${latestUserMessage}\n\nPlease analyze the current page state and take the next action.` }],
      }
    ]

    const response = await callBedrockWithTools(
      model as BedrockModelConfig,
      systemPrompt,
      conversationMessages
    )

    // Check if model wants to use a tool
    if (response.stopReason === 'tool_use') {
      const toolUseBlocks =
        response.output?.message?.content?.filter((block: { toolUse?: unknown }) => block.toolUse) || []

      // Extract model's thinking/reasoning from text blocks
      const textBlocks = response.output?.message?.content?.filter((block: { text?: string }) => block.text) || []
      const modelThinking = textBlocks.map((b: { text?: string }) => b.text).join('\n')

      for (const block of toolUseBlocks) {
        const toolUse = block.toolUse!
        const toolName = toolUse.name
        const toolInput = toolUse.input as Record<string, unknown>

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
    } else {
      // Model finished without tool use
      const textContent = response.output?.message?.content?.find((block: { text?: string }) => block.text)
      if (textContent?.text) {
        port.postMessage({ type: 'chunk', content: textContent.text })
      }
      break
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
