import type { ChatRequest, Settings, ModelConfig, BedrockModelConfig } from '../types'
import { callModelAPI, callBedrockWithTools, hasValidCredentials } from './providers'

// ============================================================================
// Browser-Use Style History Management
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

// Default settings
const DEFAULT_SETTINGS: Settings = {
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

// ============================================================================
// Settings Management
// ============================================================================

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('settings')
  return result.settings || DEFAULT_SETTINGS
}

async function getActiveModel(): Promise<ModelConfig | undefined> {
  const settings = await getSettings()
  return settings.models.find((m) => m.id === settings.activeModelId)
}

// ============================================================================
// Page Context (Browser-Use Style: DOM in Context)
// ============================================================================

interface PageContextResponse {
  url: string
  title: string
  domTree: string
  interactiveCount: number
  selectedText?: string
  selectorMap: Record<number, string>
}

async function getPageContext(tabId: number): Promise<PageContextResponse> {
  try {
    // Use the new GET_DOM_TREE message for browser-use style extraction
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_DOM_TREE' })
    return {
      url: response.url || '',
      title: response.title || '',
      domTree: response.tree || '',
      interactiveCount: response.interactiveCount || 0,
      selectorMap: response.selectorMap || {},
    }
  } catch {
    const tab = await chrome.tabs.get(tabId)
    return {
      url: tab.url || '',
      title: tab.title || '',
      domTree: '',
      interactiveCount: 0,
      selectorMap: {},
    }
  }
}

// ============================================================================
// Action Execution (Browser-Use Style: Actions use nodeId)
// ============================================================================

// Browser-use style action types
interface ActionParams {
  type:
    | 'search'
    | 'navigate'
    | 'go_back'
    | 'wait'
    | 'click'
    | 'input_text'
    | 'scroll'
    | 'send_keys'
    | 'get_dropdown_options'
    | 'select_dropdown_option'
    | 'extract_content'
    | 'find_text'
    | 'done'
  index?: number // browser-use style: element [id]
  text?: string
  clear?: boolean
  keys?: string
  url?: string
  new_tab?: boolean
  query?: string // for search and extract_content
  engine?: string // for search (google, duckduckgo, bing)
  down?: boolean // for scroll (default: true)
  pages?: number // for scroll (default: 1.0)
  seconds?: number // for wait
  success?: boolean // for done
}

// Check if content script is ready with retries
async function waitForContentScript(tabId: number, maxRetries: number = 5): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' })
      if (response?.alive) return true
    } catch {
      // Content script not ready, wait and retry
      console.log(`[Browser AI] Content script not ready, retry ${i + 1}/${maxRetries}`)
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

async function executeAction(
  tabId: number,
  action: ActionParams
): Promise<{ success: boolean; error?: string; content?: string }> {
  // Handle navigation actions directly in service worker (don't need content script)
  if (action.type === 'navigate' && action.url) {
    try {
      if (action.new_tab) {
        await chrome.tabs.create({ url: action.url })
      } else {
        await chrome.tabs.update(tabId, { url: action.url })
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Navigation failed' }
    }
  }
  
  if (action.type === 'search' && action.query) {
    const engine = action.engine || 'google'
    const searchUrls: Record<string, string> = {
      google: `https://www.google.com/search?q=${encodeURIComponent(action.query)}`,
      duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(action.query)}`,
      bing: `https://www.bing.com/search?q=${encodeURIComponent(action.query)}`,
    }
    try {
      await chrome.tabs.update(tabId, { url: searchUrls[engine] || searchUrls.google })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Search failed' }
    }
  }
  
  if (action.type === 'go_back') {
    try {
      await chrome.tabs.goBack(tabId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Go back failed' }
    }
  }
  
  if (action.type === 'wait') {
    const ms = (action.seconds || 3) * 1000
    await new Promise(resolve => setTimeout(resolve, Math.min(ms, 30000)))
    return { success: true, content: `Waited ${action.seconds || 3} seconds` }
  }

  // For content script actions, try with retries if disconnected
  const maxRetries = 3
  let lastError = ''
  
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      // Add timeout to prevent hanging
      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTION', action }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Action timed out after 10s')), 10000)
        )
      ])
      return response as { success: boolean; error?: string; content?: string }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Failed to execute action'
      
      // Handle specific Chrome messaging errors - retry after waiting
      if (lastError.includes('message channel closed') || 
          lastError.includes('back/forward cache') ||
          lastError.includes('Receiving end does not exist') ||
          lastError.includes('Could not establish connection')) {
        console.log(`[Browser AI] Content script disconnected, waiting for reconnect... (retry ${retry + 1}/${maxRetries})`)
        // Wait for content script to reload
        const ready = await waitForContentScript(tabId, 3)
        if (ready) continue // Retry the action
      }
      
      // Non-recoverable error
      break
    }
  }
  
  return { success: false, error: lastError || 'Content script unavailable' }
}

// ============================================================================
// System Prompt Builder (Browser-Use Style: DOM in Every Turn)
// ============================================================================

function buildSystemPrompt(pageContext: PageContextResponse): string {
  return `You are Browser AI, an autonomous browser agent that helps users interact with web pages.

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

// ============================================================================
// ReAct Agent Loop (Bedrock with Tool Use)
// ============================================================================

async function handleAgentLoop(request: ChatRequest, port: chrome.runtime.Port): Promise<void> {
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

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  
  // Get initial page context
  let pageContext: PageContextResponse = { 
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
    
    // BROWSER-USE STYLE: Always refresh DOM at the START of each iteration
    // This ensures the model always sees the current page state, even after failed actions
    if (tab?.id) {
      try {
        const freshContext = await getPageContext(tab.id)
        // Always use fresh context - even if domTree is empty, we want fresh URL/title
        pageContext = freshContext
        
        // If DOM is empty, retry a few times (content script might be loading)
        if (!pageContext.domTree) {
          for (let retry = 0; retry < 3 && !pageContext.domTree; retry++) {
            await new Promise(resolve => setTimeout(resolve, 500))
            pageContext = await getPageContext(tab.id)
          }
        }
      } catch (error) {
        console.warn('[Browser AI] Could not refresh page context:', error)
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
        response.output?.message?.content?.filter((block) => block.toolUse) || []

      // Extract model's thinking/reasoning from text blocks
      const textBlocks = response.output?.message?.content?.filter((block) => block.text) || []
      const modelThinking = textBlocks.map(b => b.text).join('\n')

      for (const block of toolUseBlocks) {
        const toolUse = block.toolUse!
        const toolName = toolUse.name
        const toolInput = toolUse.input as Record<string, unknown>

        // Handle "done" action directly - show final result nicely (before tool call display)
        if (toolName === 'done') {
          const doneMessage = toolInput.message as string || toolInput.text as string || 'Task completed'
          const doneSuccess = toolInput.success !== false
          
          // Don't show the tool call format for done, just show the final result
          port.postMessage({ 
            type: 'chunk', 
            content: `\n${doneSuccess ? '✅' : '❌'} **Result:**\n${doneMessage}\n`
          })
          port.postMessage({ type: 'done' })
          return
        }

        // Send tool call info to user (skip for done action - handled above)
        port.postMessage({
          type: 'chunk',
          content: `\n🔧 Step ${agentState.stepNumber}: ${toolName}(${JSON.stringify(toolInput)})\n`,
        })

        // Execute the tool
        let toolResult: { success: boolean; error?: string; content?: string }

        if (tab?.id) {
          // Map tool inputs to action params (browser-use style)
          toolResult = await executeAction(tab.id, {
            type: toolName as ActionParams['type'],
            index: toolInput.index as number | undefined,
            text: toolInput.text as string | undefined,
            clear: toolInput.clear as boolean | undefined,
            keys: toolInput.keys as string | undefined,
            url: toolInput.url as string | undefined,
            new_tab: toolInput.new_tab as boolean | undefined,
            query: toolInput.query as string | undefined,
            engine: toolInput.engine as string | undefined,
            down: toolInput.down as boolean | undefined,
            pages: toolInput.pages as number | undefined,
            seconds: toolInput.seconds as number | undefined,
            success: toolInput.success as boolean | undefined,
          })

          // After action, refresh page context (browser-use style)
          if (toolResult.success) {
            // Navigation actions need longer wait for page load
            const isNavigation = ['navigate', 'search', 'go_back'].includes(toolName)
            const waitTime = isNavigation ? 3000 : 500
            
            await new Promise(resolve => setTimeout(resolve, waitTime))
            
            // For navigation, we may need to retry getting context as content script reloads
            if (isNavigation) {
              // Give the page more time to fully load
              let retries = 3
              while (retries > 0) {
                try {
                  pageContext = await getPageContext(tab.id)
                  if (pageContext.domTree) break // Got valid DOM
                } catch {
                  // Content script not ready yet
                }
                retries--
                if (retries > 0) await new Promise(resolve => setTimeout(resolve, 1000))
              }
            } else {
              pageContext = await getPageContext(tab.id)
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

        // Show result with debug info if available
        if (toolResult.success) {
          port.postMessage({ type: 'chunk', content: '✅ Done\n' })
        } else {
          port.postMessage({ type: 'chunk', content: `❌ ${toolResult.error}\n` })
          // If there's debug content (e.g., available elements), show it
          if (toolResult.content) {
            port.postMessage({ 
              type: 'chunk', 
              content: `\n📋 Debug info:\n\`\`\`\n${toolResult.content}\n\`\`\`\n` 
            })
          }
        }
      }
    } else {
      // Model finished without tool use (end_turn or stop_sequence)
      const textContent = response.output?.message?.content?.find((block) => block.text)
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

// Build system prompt with history (browser-use style)
function buildSystemPromptWithHistory(
  pageContext: PageContextResponse, 
  task: string, 
  agentState: AgentState
): string {
  const historySection = agentState.historyItems.length > 0
    ? `\n## Agent History\n${formatAgentHistory(agentState.historyItems)}\n`
    : ''

  return `You are Browser AI, an autonomous browser agent that helps users interact with web pages.

You can see the current state of the page and use tools to interact with it.
Interactive elements are marked with [id] numbers that you can reference in actions.

## Task
${task}
${historySection}
## Current Page State (Step ${agentState.stepNumber})
URL: ${pageContext.url}
Title: ${pageContext.title}
Interactive Elements: ${pageContext.interactiveCount}

## DOM Structure
\`\`\`
${pageContext.domTree || 'Page content not available'}
\`\`\`

## Available Tools
- click(index): Click element with [id]
- type(index, text, clear?): Type text into element
- scroll(direction, index?): Scroll page or element ("up"/"down")
- send_keys(keys): Send keyboard keys (e.g., "Enter", "Tab", "Control+a")
- navigate(url, new_tab?): Navigate to URL
- go_back(): Go back in history
- wait(seconds?): Wait for page to load (default 3s, max 30s)
- extract(query): Extract information from the page
- select_option(index, option): Select dropdown option
- done(success, message): Mark task as complete

## Guidelines
1. Analyze the current page state and history before acting
2. Reference elements by their [id] number from the DOM
3. Use "done" tool when the task is complete
4. If an element isn't visible, try scrolling first
5. Be efficient - complete the task in as few steps as possible`
}

// ============================================================================
// Simple Chat Handler (Non-agent)
// ============================================================================

async function handleChatMessage(
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
  let pageContext: PageContextResponse = { 
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

  const systemPrompt = buildSystemPrompt(pageContext)

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

// ============================================================================
// Chrome Extension Event Listeners
// ============================================================================

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Handle streaming connections (ReAct agent loop)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat-stream') {
    port.onMessage.addListener(async (request) => {
      if (request.type === 'CHAT_MESSAGE_STREAM') {
        try {
          await handleAgentLoop(request as ChatRequest, port)
        } catch (error) {
          port.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    })
  }
})

// Handle messages from sidepanel and content scripts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'CHAT_MESSAGE') {
    handleChatMessage(request as ChatRequest)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }))
    return true
  }

  if (request.type === 'GET_PAGE_CONTEXT') {
    getPageContext(request.tabId)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }))
    return true
  }

  if (request.type === 'EXECUTE_ACTION') {
    executeAction(request.tabId, request.action)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }))
    return true
  }
})

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Browser AI extension installed')

  chrome.storage.sync.get('settings', (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
    }
  })
})
