// Message Manager - Hybrid: Cline + Nanobrowser pattern
// Full conversation accumulation (Cline) + Token management (Nanobrowser) + Structured summaries (Browser-Use)

import type { PageContext } from '../browser/context'

// ============================================================================
// Types
// ============================================================================

export interface HistoryItem {
  stepNumber: number
  evaluation?: string    // Model's evaluation: "Success - clicked login"
  memory?: string        // Model's memory: Key information to remember
  nextGoal?: string      // Model's next goal: What to do next
  actionResults?: string // Tool execution results summary
  error?: string
}

// API conversation message (Cline-style)
export interface APIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{
    type: 'text' | 'tool_use' | 'tool_result'
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
    tool_use_id?: string
    content?: string
    is_error?: boolean
  }>
}

// Token management (Nanobrowser-style)
export interface TokenManagerSettings {
  maxInputTokens: number              // Default: 128000
  estimatedCharsPerToken: number      // Default: 3
  imageTokens: number                 // Default: 800
}

interface MessageHistory {
  systemMessage: string | null       // Instructions (rarely changes)
  stateMessage: string | null        // Current browser state + history (rebuilt each step)
  contextMessages: string[]          // Temporary messages (cleared each step)
}

export interface MessageManagerState {
  history: MessageHistory
  apiConversationHistory: APIMessage[]  // Full conversation accumulation (Cline-style)
  agentHistoryItems: HistoryItem[]
  readStateDescription: string       // One-time extracted content (cleared after shown)
  extractionResults: Array<{         // Persistent extracted data
    query: string
    content: string
    step: number
  }>
  totalTokens: number                   // Track total token usage (Nanobrowser-style)
}

// ============================================================================
// Message Manager (Browser-Use Pattern)
// ============================================================================

export class MessageManager {
  private state: MessageManagerState
  private tokenSettings: TokenManagerSettings

  constructor(
    tokenSettings?: Partial<TokenManagerSettings>
  ) {
    this.tokenSettings = {
      maxInputTokens: tokenSettings?.maxInputTokens ?? 128000,
      estimatedCharsPerToken: tokenSettings?.estimatedCharsPerToken ?? 3,
      imageTokens: tokenSettings?.imageTokens ?? 800,
    }
    this.state = {
      history: {
        systemMessage: null,
        stateMessage: null,
        contextMessages: []
      },
      apiConversationHistory: [],  // Initialize empty conversation history
      agentHistoryItems: [{
        stepNumber: 0,
        evaluation: 'N/A',
        memory: 'Agent initialized',
        nextGoal: 'Analyze current page and begin task execution'
      }],
      readStateDescription: '',
      extractionResults: [],
      totalTokens: 0
    }
  }

  // ============================================================================
  // Message Building (Browser-Use Style)
  // ============================================================================

  // ============================================================================
  // Message Retrieval (Cline-style with Nanobrowser token management)
  // ============================================================================

  /**
   * Get messages for LLM (Cline-style: system + full conversation history + transient state)
   * Returns: system message + accumulated conversation + current browser state (transient)
   */
  getMessages(): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = []

    // Always include system message first
    if (this.state.history.systemMessage) {
      messages.push({ role: 'system', content: this.state.history.systemMessage })
    }

    // Add full accumulated conversation history (Cline-style)
    for (const msg of this.state.apiConversationHistory) {
      messages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      })
    }

    // Append transient state message at the end (NOT persisted in history)
    // This ensures browser state is always fresh and never duplicated
    if (this.state.history.stateMessage) {
      messages.push({ role: 'user', content: this.state.history.stateMessage })
    }

    return messages
  }

  /**
   * Get token count for messages (Nanobrowser-style)
   */
  getTotalTokens(): number {
    return this.state.totalTokens
  }

  /**
   * Count tokens in text (Nanobrowser-style estimation)
   */
  private countTextTokens(text: string): number {
    return Math.floor(text.length / this.tokenSettings.estimatedCharsPerToken)
  }

  /**
   * Count tokens in a message
   */
  private countMessageTokens(message: APIMessage): number {
    let tokens = 0

    if (typeof message.content === 'string') {
      tokens += this.countTextTokens(message.content)
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.type === 'text' && item.text) {
          tokens += this.countTextTokens(item.text)
        } else if (item.type === 'tool_use' || item.type === 'tool_result') {
          tokens += this.countTextTokens(JSON.stringify(item))
        }
      }
    }

    return tokens
  }

  /**
   * Set system message (instructions) - includes the initial task
   */
  setSystemMessage(content: string): void {
    this.state.history.systemMessage = content
    // Count system message tokens
    const systemTokens = this.countTextTokens(content)
    this.state.totalTokens += systemTokens
  }

  /**
   * Add initial task message to conversation (Cline-style)
   * Called once at the start of a task
   */
  addInitialTaskMessage(task: string): void {
    const taskMessage = `<user_request>
${task}
</user_request>

Please analyze the current page and begin executing the task. Use the provided tools to interact with the browser.`

    this.addUserMessage(taskMessage)
  }

  /**
   * Add follow-up task message (Cline-style)
   * Called when user sends a new message in chat
   */
  addFollowUpTaskMessage(newTask: string): void {
    const followUpMessage = `<follow_up_request>
${newTask}
</follow_up_request>

This is a follow-up task. Continue from where you left off and complete this new request.`

    this.addUserMessage(followUpMessage)
  }

  // ============================================================================
  // Conversation History Management (Cline-style)
  // ============================================================================

  /**
   * Add assistant message to conversation history (Cline-style)
   * Called after receiving LLM response with thinking + tool calls
   */
  addAssistantMessage(thinking: string, toolCalls: Array<{ name: string; input: Record<string, unknown>; id: string }>): void {
    const content: Array<{ type: 'text' | 'tool_use'; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = []

    // Add thinking as text
    if (thinking) {
      content.push({ type: 'text', text: thinking })
    }

    // Add tool calls
    for (const toolCall of toolCalls) {
      content.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.input
      })
    }

    const assistantMessage: APIMessage = {
      role: 'assistant',
      content
    }

    this.state.apiConversationHistory.push(assistantMessage)

    // Update token count
    const tokens = this.countMessageTokens(assistantMessage)
    this.state.totalTokens += tokens
  }

  /**
   * Add tool results to conversation history as user message (Cline-style)
   * Called after executing tools
   */
  addToolResultsMessage(toolResults: Array<{ tool_use_id: string; content: string; is_error?: boolean }>): void {
    const content: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = []

    for (const result of toolResults) {
      content.push({
        type: 'tool_result',
        tool_use_id: result.tool_use_id,
        content: result.content,
        is_error: result.is_error
      })
    }

    const toolResultMessage: APIMessage = {
      role: 'user',
      content
    }

    this.state.apiConversationHistory.push(toolResultMessage)

    // Update token count
    const tokens = this.countMessageTokens(toolResultMessage)
    this.state.totalTokens += tokens
  }

  /**
   * Add user message to conversation history
   * Called when user sends a new task/message in chat
   */
  addUserMessage(content: string): void {
    const userMessage: APIMessage = {
      role: 'user',
      content
    }

    this.state.apiConversationHistory.push(userMessage)

    // Update token count
    const tokens = this.countMessageTokens(userMessage)
    this.state.totalTokens += tokens
  }

  /**
   * Trim messages if over token limit (Nanobrowser-style)
   * Removes oldest non-system messages first
   */
  trimMessagesIfNeeded(): void {
    const systemTokens = this.state.history.systemMessage
      ? this.countTextTokens(this.state.history.systemMessage)
      : 0

    let conversationTokens = this.state.totalTokens - systemTokens

    // Keep removing oldest messages until we're under the limit
    while (conversationTokens > this.tokenSettings.maxInputTokens && this.state.apiConversationHistory.length > 0) {
      const removed = this.state.apiConversationHistory.shift()
      if (removed) {
        const tokens = this.countMessageTokens(removed)
        conversationTokens -= tokens
        this.state.totalTokens -= tokens
        console.log(`[MessageManager] Trimmed message (${tokens} tokens). Total now: ${this.state.totalTokens}`)
      }
    }

    // If still over limit, truncate the last user message (state message)
    if (conversationTokens > this.tokenSettings.maxInputTokens && this.state.apiConversationHistory.length > 0) {
      const lastMsg = this.state.apiConversationHistory[this.state.apiConversationHistory.length - 1]
      if (lastMsg && lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
        const diff = conversationTokens - this.tokenSettings.maxInputTokens
        const charsToRemove = Math.floor(diff * this.tokenSettings.estimatedCharsPerToken)
        const newContent = lastMsg.content.slice(0, -charsToRemove)

        const oldTokens = this.countTextTokens(lastMsg.content)
        lastMsg.content = newContent + '\n... [truncated]'
        const newTokens = this.countTextTokens(lastMsg.content)

        this.state.totalTokens -= (oldTokens - newTokens)
        console.log(`[MessageManager] Truncated last message by ${charsToRemove} chars`)
      }
    }
  }

  /**
   * Create state message (stored transiently, NOT added to conversation history)
   * State message contains ONLY current browser state - refreshed each turn
   * This is NOT persisted in apiConversationHistory to avoid duplication
   */
  createStateMessage(
    pageContext: PageContext,
    stepNumber: number,
    tabsInfo?: string
  ): void {
    // One-time read state (cleared after shown once)
    const readState = this.state.readStateDescription
      ? `<read_state>\n${this.state.readStateDescription}\n</read_state>\n\n`
      : ''

    // Persistent extracted data
    const extractedData = this.state.extractionResults.length > 0
      ? `<extracted_data>\n${this.formatExtractionResults()}\n</extracted_data>\n\n`
      : ''

    // Tab info
    const tabsSection = tabsInfo
      ? `<open_tabs>\nThe arrow (→) indicates your current focused tab. Use switch_tab(tab_id) to change focus.\n${tabsInfo}\n</open_tabs>\n\n`
      : ''

    // Pure Cline style: State message contains ONLY current browser state
    // This is stored transiently and appended to getMessages() output
    // NOT added to apiConversationHistory to prevent duplication
    const stateMessage = `
${readState}${extractedData}${tabsSection}<browser_state>
Current URL: ${pageContext.url}
Title: ${pageContext.title}
Interactive Elements: ${pageContext.interactiveCount}

Interactive elements are shown as [index]<type>text</type> where:
- index: Numeric identifier for interaction (use this in tool calls)
- type: HTML element type (button, input, link, etc.)
- text: Element description or content

${pageContext.domTree || 'Page loading...'}
</browser_state>

<step_info>Step ${stepNumber}</step_info>
`.trim()

    // Store transiently for getMessages() to append
    this.state.history.stateMessage = stateMessage

    // DO NOT add to conversation history - this prevents duplication
    // The state will be appended transiently in getMessages()

    // Clear context messages from previous step
    this.state.history.contextMessages = []

    // Trim if needed (Nanobrowser-style)
    this.trimMessagesIfNeeded()
  }

  /**
   * Add temporary context message (cleared next step)
   */
  addContextMessage(content: string): void {
    this.state.history.contextMessages.push(content)
  }

  // ============================================================================
  // History Management
  // ============================================================================

  /**
   * Update agent history with new step
   */
  addHistoryItem(item: Omit<HistoryItem, 'stepNumber'>, stepNumber: number): void {
    this.state.agentHistoryItems.push({
      ...item,
      stepNumber
    })
  }

  // Note: formatAgentHistory() removed - pure Cline-style doesn't embed history in state messages
  // History is preserved naturally through accumulated conversation messages

  // ============================================================================
  // Extraction Results Management (Browser-Use + Nanobrowser Hybrid)
  // ============================================================================

  /**
   * Set read state (one-time display, browser-use style)
   */
  setReadState(content: string): void {
    this.state.readStateDescription = content
  }

  /**
   * Clear read state after it's been shown once
   */
  clearReadState(): void {
    this.state.readStateDescription = ''
  }

  /**
   * Add extraction result to persistent storage (nanobrowser style)
   */
  addExtractionResult(query: string, content: string, step: number): void {
    this.state.extractionResults.push({ query, content, step })

    // Keep only last 10 to avoid token bloat
    if (this.state.extractionResults.length > 10) {
      this.state.extractionResults.shift()
    }
  }

  /**
   * Format extraction results for prompt
   */
  private formatExtractionResults(): string {
    return this.state.extractionResults.map((e, i) =>
      `[Extraction ${i + 1} from Step ${e.step}]\nQuery: "${e.query}"\nResult:\n${e.content}\n`
    ).join('\n')
  }

  // ============================================================================
  // Serialization (for task resume/persistence)
  // ============================================================================

  /**
   * Serialize state for saving
   */
  serialize(): MessageManagerState {
    return JSON.parse(JSON.stringify(this.state))
  }

  /**
   * Restore state from saved data
   */
  restore(state: MessageManagerState): void {
    this.state = state
  }

  /**
   * Get current state (for debugging)
   */
  getState(): MessageManagerState {
    return this.state
  }
}

