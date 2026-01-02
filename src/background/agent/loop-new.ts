// Agent Loop - Browser-Use + Cline Hybrid Approach
// Uses MessageManager (browser-use) + MessageStateHandler (cline)

import type { ChatRequest, Settings, ModelConfig, UIMessage } from '../../types'
import { hasValidCredentials } from '../providers'
import { agentFocusTabId, createAgentTabGroup, hasTabGroupSupport, getTabsInfo, getAgentTabGroupId } from '../tab-manager'
import { getPageContext, getPageContextWithRetry, type PageContext } from '../browser'
import { executeAction, toolInputToAction } from '../controller'
import { allBrowserTools } from '../tools/browser-tools'
import { MessageManager } from './message-manager'
import { MessageStateHandler } from './message-state'
import { LLMClient } from './llm-client'

// ============================================================================
// System Prompt Building
// ============================================================================

function buildSystemPrompt(): string {
  const toolsSections = formatToolsSection()

  return `You are an AI agent designed to automate browser tasks. You will be given a user request and current browser state in each turn.

<available_tools>
${toolsSections}
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
</reasoning_rules>`
}

function formatToolsSection(): string {
  const sections = [
    { title: 'Navigation', tools: allBrowserTools.filter(t => ['search', 'navigate', 'go_back', 'wait'].includes(t.name)) },
    { title: 'Tab Management', tools: allBrowserTools.filter(t => ['switch_tab', 'close_tab'].includes(t.name)) },
    { title: 'Element Interaction', tools: allBrowserTools.filter(t => ['click', 'input_text', 'scroll', 'send_keys'].includes(t.name)) },
    { title: 'Dropdowns', tools: allBrowserTools.filter(t => ['get_dropdown_options', 'select_dropdown_option'].includes(t.name)) },
    { title: 'Content', tools: allBrowserTools.filter(t => ['extract_content', 'find_text'].includes(t.name)) },
    { title: 'Completion', tools: allBrowserTools.filter(t => t.name === 'done') },
  ]

  const lines: string[] = []
  for (const section of sections) {
    if (section.tools.length > 0) {
      lines.push(`${section.title}:`)
      for (const tool of section.tools) {
        lines.push(`- ${tool.name}: ${tool.description}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n').trim()
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

  const getTargetTabId = (): number | null => {
    return agentFocusTabId || activeTab?.id || null
  }

  // Get initial page context
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

  // Get or create task ID - always reuse existing if available
  const storageResult = await chrome.storage.local.get('latest_surfi_task_id')
  const existingTaskId = storageResult.latest_surfi_task_id as string | undefined
  const taskId = existingTaskId || `surfi_task_${Date.now()}`

  // Create agent tab group for isolation - ONLY if no tab group exists yet (in-memory check)
  // This uses getAgentTabGroupId() to check if we already have an active group in this service worker session
  let tabGroup: Awaited<ReturnType<typeof createAgentTabGroup>> | null = null
  const currentGroupId = getAgentTabGroupId()
  console.log(`[Surfi] Tab group check: targetTabId=${targetTabId}, currentGroupId=${currentGroupId}, hasSupport=${hasTabGroupSupport()}`)
  
  if (targetTabId && currentGroupId === null) {
    console.log(`[Surfi] Attempting to create tab group for tab ${targetTabId}`)
    tabGroup = await createAgentTabGroup(targetTabId)
    if (tabGroup) {
      console.log(`[Surfi] Agent operating in tab group ${tabGroup.groupId}`)
      // Send info to UI
      port.postMessage({
        type: 'ui_message',
        message: {
          id: `${Date.now()}_tab_group`,
          type: 'system',
          role: 'system',
          content: `Agent created tab group "Surfi Agent". All new tabs will be grouped together.`,
          timestamp: Date.now()
        }
      })
    } else {
      console.log(`[Surfi] Tab group creation returned null - check if tab groups are supported`)
    }
  } else if (currentGroupId !== null) {
    console.log(`[Surfi] Using existing tab group ${currentGroupId}`)
  }

  // Initialize message management (Browser-Use + Cline hybrid)
  const userMessages = request.payload.messages.filter(m => m.role === 'user')
  const latestUserMessage = userMessages[userMessages.length - 1]?.content || ''

  // Create MessageManager (Cline-style conversation accumulation)
  const messageManager = new MessageManager()

  // Set system prompt (instructions + tools)
  messageManager.setSystemMessage(buildSystemPrompt())

  // Add initial task as first user message in conversation
  messageManager.addInitialTaskMessage(latestUserMessage)

  // Create MessageStateHandler (cline style dual-store)
  const messageStateHandler = new MessageStateHandler(taskId)
  await messageStateHandler.loadState()

  // Note: User message is already added by the frontend (App.tsx)
  // We only store it in MessageStateHandler for persistence
  const initialUIMessage: UIMessage = {
    id: Date.now().toString(),
    type: 'text',
    role: 'user',
    content: latestUserMessage,
    timestamp: Date.now()
  }
  await messageStateHandler.addUIMessage(initialUIMessage)

  const settings = await getSettings()
  const MAX_ITERATIONS = settings.maxIterations || 10

  // Create LLM client (handles all provider-specific logic)
  const llmClient = new LLMClient(model)

  // Track extraction results (persists across multiple turns)
  const extractionResults: Array<{ query: string; content: string; step: number }> = []

  try {
    let stepNumber = 1
    for (; stepNumber <= MAX_ITERATIONS; stepNumber++) {
      // Get current target tab
      const currentTabId = getTargetTabId()

      // BROWSER-USE STYLE: Always refresh DOM at the START of each iteration
      if (currentTabId) {
        try {
          pageContext = await getPageContextWithRetry(currentTabId, 3, 500)
        } catch (error) {
          console.warn('[Surfi] Could not refresh page context:', error)
        }
      }

      // Get tabs info for context
      const tabsInfo = getTabsInfo()

      // Build state message with current history (browser-use style)
      messageManager.createStateMessage(pageContext, stepNumber, tabsInfo)

      // Get messages for LLM - this is the EXACT prompt we'll send
      const llmMessages = messageManager.getMessages()

      // Format as single text blob for debug panel - exactly what LLM sees
      const promptTextBlob = llmMessages.map((msg, idx) => {
        const separator = '='.repeat(80)
        return `${separator}\nMESSAGE ${idx + 1}: ${msg.role.toUpperCase()}\n${separator}\n\n${msg.content}\n`
      }).join('\n')

      // Send EXACT prompt text blob to debug panel BEFORE sending to LLM
      port.postMessage({
        type: 'prompt_debug',
        stepNumber: stepNumber,
        promptText: promptTextBlob,  // Single text blob showing exactly what LLM sees
        url: pageContext.url,
        interactiveCount: pageContext.interactiveCount,
        messageCount: llmMessages.length,
        totalChars: promptTextBlob.length,
      })

      // Call LLM (provider-agnostic)
      // Cast to LLMMessage[] since we know the roles are correct
      const llmResponse = await llmClient.callWithTools(llmMessages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>)

      // Handle error
      if (llmResponse.stopReason === 'error') {
        port.postMessage({ type: 'error', error: llmResponse.error || 'Unknown LLM error' })
        break
      }

      // Handle end turn (no tool calls)
      if (llmResponse.stopReason === 'end_turn') {
        if (llmResponse.textContent) {
          port.postMessage({ type: 'chunk', content: llmResponse.textContent })
        }
        break
      }

      // Extract tool calls and thinking
      const toolCalls = llmResponse.toolCalls
      const modelThinking = llmResponse.thinking

      // Parse thinking (EVAL/MEMORY/GOAL) from model output
      const thinkingMatch = modelThinking.match(/EVAL:\s*(.+?)\s*\n\s*MEMORY:\s*(.+?)\s*\n\s*GOAL:\s*(.+?)(?:\n|$)/s)
      const evaluation = thinkingMatch?.[1]?.trim() || 'N/A'
      const memory = thinkingMatch?.[2]?.trim() || ''
      const nextGoal = thinkingMatch?.[3]?.trim() || ''

      // Add thinking to UI
      if (evaluation || memory || nextGoal) {
        const thinkingUIMessage: UIMessage = {
          id: `${Date.now()}_thinking`,
          type: 'thinking',
          role: 'assistant',
          evaluation,
          memory,
          nextGoal,
          timestamp: Date.now()
        }
        await messageStateHandler.addUIMessage(thinkingUIMessage)
        port.postMessage({ type: 'ui_message', message: thinkingUIMessage })
      }

      // ============================================================================
      // Cline-style: Accumulate assistant message to conversation history
      // ============================================================================

      // Add assistant message with thinking + tool calls to API conversation history
      const toolCallsForHistory = toolCalls.map((tc: any, idx: number) => ({
        name: tc.name,
        input: tc.input,
        id: `tool_${stepNumber}_${idx}` // Unique ID for tool use
      }))

      messageManager.addAssistantMessage(modelThinking, toolCallsForHistory)

      // Collect tool results for accumulation
      const toolResultsForHistory: Array<{ tool_use_id: string; content: string; is_error?: boolean }> = []
      const actionResults: string[] = []

      // Process tool calls
      for (let toolIdx = 0; toolIdx < toolCalls.length; toolIdx++) {
        const { name: toolName, input: toolInput } = toolCalls[toolIdx]
        const toolUseId = `tool_${stepNumber}_${toolIdx}`
        // Handle "done" action
        if (toolName === 'done') {
          const doneMessage = toolInput.text as string || 'Task completed'
          const doneSuccess = toolInput.success !== false

          // Create assistant text message for the final result
          const doneUIMessage: UIMessage = {
            id: `${Date.now()}_done`,
            type: 'text',
            role: 'assistant',
            content: `${doneSuccess ? '✅' : '❌'} ${doneMessage}`,
            timestamp: Date.now()
          }

          await messageStateHandler.addUIMessage(doneUIMessage)
          port.postMessage({ type: 'ui_message', message: doneUIMessage })
          port.postMessage({ type: 'done' })

          // Save state before exiting
          // State is automatically saved by MessageStateHandler
          return
        }

        // Add tool use to UI
        const toolUseUIMessage: UIMessage = {
          id: `${Date.now()}_tool_use`,
          type: 'tool_use',
          role: 'assistant',
          tool: toolName,
          input: toolInput,
          stepNumber,
          timestamp: Date.now()
        }
        await messageStateHandler.addUIMessage(toolUseUIMessage)
        port.postMessage({ type: 'ui_message', message: toolUseUIMessage })

        // Detect repeated extract_content calls
        if (toolName === 'extract_content' && toolInput.query) {
          const query = toolInput.query as string
          const recentSameQuery = extractionResults.filter((e: { query: string; content: string; step: number }) => e.query === query)
          if (recentSameQuery.length >= 2) {
            messageManager.addContextMessage(
              `Note: You've extracted "${query}" multiple times. The extracted content is available in history. Consider calling done() if you have the information needed.`
            )
          }
          extractionResults.push({ query, content: '', step: stepNumber })
          if (extractionResults.length > 5) {
            extractionResults.shift()
          }
        }

        // Execute the tool
        let toolResult
        if (currentTabId) {
          const actionParams = toolInputToAction(toolName, toolInput)
          toolResult = await executeAction(currentTabId, actionParams)

          // After action, refresh page context
          if (toolResult.success) {
            const isTabSwitch = toolName === 'switch_tab'
            const isNavigation = ['navigate', 'search', 'go_back'].includes(toolName)
            const waitTime = isNavigation ? 3000 : isTabSwitch ? 500 : 500

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
        } else {
          toolResult = { success: false, error: 'No active tab' }
        }

        // Collect action result for history
        const actionResultStr = `${toolName}(${JSON.stringify(toolInput)}) → ${toolResult.success ? 'OK' : toolResult.error}`
        actionResults.push(actionResultStr)

        // Collect tool result for conversation history (Cline-style)
        toolResultsForHistory.push({
          tool_use_id: toolUseId,
          content: toolResult.content || (toolResult.success ? 'Success' : toolResult.error || 'Failed'),
          is_error: !toolResult.success
        })

        // Handle extract_content specially
        if (toolName === 'extract_content' && toolResult.content) {
          const query = toolInput.query as string
          messageManager.setReadState(toolResult.content)
          messageManager.addExtractionResult(query, toolResult.content, stepNumber)
        }

        // Add tool result to UI
        const toolResultUIMessage: UIMessage = {
          id: `${Date.now()}_tool_result`,
          type: 'tool_result',
          role: 'assistant',
          tool: toolName,
          success: toolResult.success,
          content: toolResult.content,
          error: toolResult.error,
          stepNumber,
          timestamp: Date.now()
        }
        await messageStateHandler.addUIMessage(toolResultUIMessage)
        port.postMessage({ type: 'ui_message', message: toolResultUIMessage })

        // Clear read state after it's been shown
        messageManager.clearReadState()
      }

      // ============================================================================
      // After all tools executed: Update history and accumulate
      // ============================================================================

      // Add complete history item with MODEL's thinking + all action results
      messageManager.addHistoryItem({
        evaluation: evaluation,                      // ✅ Model's actual evaluation
        memory: memory,                              // ✅ Model's actual memory
        nextGoal: nextGoal,                          // ✅ Model's actual goal
        actionResults: actionResults.join('\n')      // ✅ All tool results
      }, stepNumber)

      // Add tool results to conversation history (Cline-style)
      if (toolResultsForHistory.length > 0) {
        messageManager.addToolResultsMessage(toolResultsForHistory)
      }

      // Save state after each step
      // State is automatically saved by MessageStateHandler
    }

    // Check if max iterations reached (stepNumber will be MAX_ITERATIONS + 1 after loop)
    if (stepNumber > MAX_ITERATIONS) {
      const maxStepsMessage: UIMessage = {
        id: `${Date.now()}_max_steps`,
        type: 'system',
        role: 'system',
        content: '⚠️ Reached maximum iterations. Stopping.',
        timestamp: Date.now()
      }
      await messageStateHandler.addUIMessage(maxStepsMessage)
      port.postMessage({ type: 'ui_message', message: maxStepsMessage })
    }

  } finally {
    // Tab group is intentionally NOT cleaned up here
    // The group persists until user manually clears the chat or closes tabs
    // This allows the user to see which tabs were created by the agent
    if (tabGroup) {
      console.log(`[Surfi] Agent finished. Tab group ${tabGroup.groupId} will persist.`)
    }
  }

  port.postMessage({ type: 'done' })

  // State is automatically saved by MessageStateHandler
}

// Simple chat handler (non-agent)
export async function handleChatMessage(
  _request: ChatRequest
): Promise<{ content: string; error?: string }> {
  // Keep existing implementation
  return { content: '', error: 'Not implemented' }
}
