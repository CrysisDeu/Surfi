# Surfi Enhancement Plan: Combining Best of All Three Systems

## Answer: Does nanobrowser use LangChain as the agentic framework?

**No, nanobrowser does NOT use LangChain as the agentic framework.**

**What nanobrowser uses LangChain for:**
- ✅ LLM integration (`BaseChatModel`, `ChatOpenAI`, `ChatAnthropic`, etc.)
- ✅ Message types (`SystemMessage`, `HumanMessage`, `AIMessage`, `ToolMessage`)
- ✅ Structured output (`withStructuredOutput()`)
- ✅ Message handling utilities

**What nanobrowser does NOT use LangChain for:**
- ❌ Agent execution (no `AgentExecutor`)
- ❌ Agent framework (no `createAgent`, `bindTools`)
- ❌ Tool calling framework

**nanobrowser's architecture:**
- Custom `BaseAgent` class
- Custom `Executor` class
- Custom `MessageManager` class
- Custom action/tool system
- Uses LangChain only as an **LLM abstraction layer**, not for agent orchestration

**Conclusion:** nanobrowser builds its own agentic framework on top of LangChain's LLM abstractions, similar to how Surfi builds its own system.

---

## Enhancement Plan: Combining All Three Systems

### Phase 1: Foundation Improvements (High Priority)

#### 1.1 Token Management System (from nanobrowser)
**Goal:** Prevent context overflow and manage token budgets intelligently.

**Implementation:**
```typescript
// src/background/agent/token-manager.ts
class TokenManager {
  private maxInputTokens: number = 128000;
  private estimatedCharsPerToken: number = 3;
  private imageTokens: number = 800;
  
  countTokens(message: string | BaseMessage): number {
    // Count tokens in text
    // Account for images
    // Account for tool calls
  }
  
  trimMessages(messages: Message[], maxTokens: number): Message[] {
    // Remove images first if over limit
    // Trim text proportionally
    // Keep system message and recent messages
  }
}
```

**Integration Points:**
- Add to `AgentState` interface
- Integrate into `buildSystemPromptWithHistory()`
- Call `trimMessages()` before sending to LLM

**Benefits:**
- ✅ Prevents context overflow errors
- ✅ Automatic message management
- ✅ Better cost control

---

#### 1.2 Enhanced Page Statistics (from browser-use)
**Goal:** Provide rich page context to help agent understand page structure.

**Implementation:**
```typescript
// src/content/dom-service.ts
interface PageStatistics {
  links: number;
  interactiveElements: number;
  iframes: number;
  scrollContainers: number;
  images: number;
  shadowOpen: number;
  shadowClosed: number;
  totalElements: number;
}

function extractPageStatistics(tree: DOMNode): PageStatistics {
  // Traverse tree and count elements
  // Detect shadow DOM
  // Count by type
}
```

**Integration:**
- Add to `PageContext` interface
- Include in `buildSystemPromptWithHistory()`
- Format as `<page_stats>` section

**Benefits:**
- ✅ Better page understanding
- ✅ Empty page detection
- ✅ Shadow DOM awareness

---

#### 1.3 New Element Detection (from browser-use)
**Goal:** Mark elements that appear after actions to help agent understand page changes.

**Implementation:**
```typescript
// src/content/dom-service.ts
interface DOMNode {
  // ... existing fields
  isNew?: boolean; // Added after last action
}

// Track previous DOM state
let previousDOMState: Set<string> = new Set();

function markNewElements(currentTree: DOMNode, previousState: Set<string>): void {
  // Compare current elements with previous
  // Mark new elements with isNew = true
  // Update previousState
}

// In serializeTree:
if (node.isNew) {
  prefix = `*[${node.id}]`; // Mark as new
}
```

**Integration:**
- Store previous DOM state in `AgentState`
- Compare on each step
- Mark new elements in serialization

**Benefits:**
- ✅ Agent understands page changes
- ✅ Better action feedback
- ✅ Prevents confusion about new elements

---

#### 1.4 Enhanced History Formatting (from browser-use + nanobrowser)
**Goal:** Rich, structured history that helps agent track progress.

**Implementation:**
```typescript
// src/background/agent/loop.ts
interface EnhancedHistoryItem extends HistoryItem {
  actionResults?: ActionResult[];
  browserState?: {
    url: string;
    title: string;
    interactiveCount: number;
  };
  timestamp?: number;
}

function formatAgentHistory(
  historyItems: EnhancedHistoryItem[],
  maxItems: number = 10
): string {
  // Format as XML-style steps
  // Include action results
  // Include browser state snapshot
  // Truncate intelligently (keep first + last N)
}
```

**Format:**
```xml
<agent_history>
<step_1>:
Evaluation: Success - clicked login button
Memory: Found login form, ready to fill credentials
Next Goal: Fill username field
Action Results:
  Action 1/1: click({index: 5})
  Result: Clicked element [5], login form appeared
Browser State: URL changed to /login, 3 interactive elements
</step_1>
...
</agent_history>
```

**Benefits:**
- ✅ Better progress tracking
- ✅ Action result visibility
- ✅ Browser state snapshots

---

### Phase 2: Advanced Features (Medium Priority)

#### 2.1 Vision/Screenshot Support (from browser-use)
**Goal:** Add visual context for better page understanding.

**Implementation:**
```typescript
// src/background/browser/context.ts
async function captureScreenshot(tabId: number): Promise<string> {
  // Use chrome.tabs.captureVisibleTab
  // Convert to base64
  // Optionally add bounding boxes
}

// Add to PageContext
interface PageContext {
  // ... existing fields
  screenshot?: string;
  useVision?: boolean;
}
```

**Integration:**
- Add screenshot capture in `getPageContext()`
- Include in prompt if `useVision` is enabled
- Add to message as image content (for vision models)

**Benefits:**
- ✅ Visual page understanding
- ✅ Better element identification
- ✅ Layout comprehension

---

#### 2.2 File System Integration (from browser-use)
**Goal:** Enable task tracking and result accumulation.

**Implementation:**
```typescript
// src/background/agent/filesystem.ts
class FileSystem {
  private files: Map<string, string> = new Map();
  
  async readFile(name: string): Promise<string> {
    // Read from chrome.storage.local
  }
  
  async writeFile(name: string, content: string): Promise<void> {
    // Write to chrome.storage.local
  }
  
  describe(): string {
    // Return file system description
  }
}
```

**Integration:**
- Add file system tools (`read_file`, `write_file`, `list_files`)
- Include `<file_system>` section in prompt
- Initialize with `todo.md` for task tracking

**Benefits:**
- ✅ Long task management
- ✅ Result accumulation
- ✅ Progress tracking

---

#### 2.3 Page Info (Scroll Context) (from browser-use + nanobrowser)
**Goal:** Help agent understand scroll position and viewport context.

**Implementation:**
```typescript
// src/content/dom-service.ts
interface PageInfo {
  pixelsAbove: number;
  pixelsBelow: number;
  viewportHeight: number;
  pageHeight: number;
  scrollY: number;
  pagesAbove: number;
  pagesBelow: number;
  totalPages: number;
}

function getPageInfo(): PageInfo {
  const scrollY = window.scrollY;
  const viewportHeight = window.innerHeight;
  const pageHeight = document.body.scrollHeight;
  
  return {
    pixelsAbove: scrollY,
    pixelsBelow: pageHeight - scrollY - viewportHeight,
    viewportHeight,
    pageHeight,
    scrollY,
    pagesAbove: scrollY / viewportHeight,
    pagesBelow: (pageHeight - scrollY - viewportHeight) / viewportHeight,
    totalPages: pageHeight / viewportHeight,
  };
}
```

**Integration:**
- Add to `PageContext`
- Format as `<page_info>` section
- Include in DOM markers: `... {pagesAbove} pages above ...`

**Benefits:**
- ✅ Better scroll understanding
- ✅ Viewport context
- ✅ Content location awareness

---

#### 2.4 Read State (from browser-use)
**Goal:** Show extracted content from previous actions as one-time information.

**Implementation:**
```typescript
// src/background/agent/loop.ts
interface AgentState {
  // ... existing fields
  readState?: string; // Content from extract/read_file actions
}

// In prompt building:
if (agentState.readState) {
  prompt += `<read_state>\n${agentState.readState}\n</read_state>\n`;
}
```

**Integration:**
- Store extracted content in `AgentState`
- Include in prompt only for current step
- Clear after step completes

**Benefits:**
- ✅ One-time information display
- ✅ Better extraction handling
- ✅ Prevents information loss

---

### Phase 3: Architecture Improvements (Low Priority)

#### 3.1 Template System (from browser-use)
**Goal:** Move prompts to markdown files for easier customization.

**Implementation:**
```typescript
// src/background/agent/prompts/system-prompt.ts
class SystemPrompt {
  private template: string;
  
  constructor(
    templatePath: string,
    options: {
      maxActionsPerStep?: number;
      useThinking?: boolean;
      useVision?: boolean;
    }
  ) {
    // Load template from file
    // Format with options
  }
  
  build(context: PromptContext): string {
    // Format template with context
  }
}
```

**File Structure:**
```
src/background/agent/prompts/
  templates/
    system-prompt.md
    system-prompt-no-thinking.md
    system-prompt-vision.md
```

**Benefits:**
- ✅ Easier prompt customization
- ✅ Version control for prompts
- ✅ Multiple prompt variants

---

#### 3.2 Procedural Memory Summaries (from nanobrowser)
**Goal:** Condense history for very long tasks.

**Implementation:**
```typescript
// src/background/agent/memory.ts
class MemorySummarizer {
  summarizeHistory(
    history: HistoryItem[],
    everyNSteps: number = 10
  ): string[] {
    // Group history into chunks
    // Summarize each chunk
    // Return array of summaries
  }
}
```

**Integration:**
- Generate summaries every N steps
- Include in prompt as `<procedural_memory>`
- Keep recent detailed history

**Benefits:**
- ✅ Long task support
- ✅ Context preservation
- ✅ Reduced token usage

---

#### 3.3 Multi-Agent System (Optional - from nanobrowser)
**Goal:** Separate planning and execution for complex tasks.

**Implementation:**
```typescript
// src/background/agent/planner.ts
class PlannerAgent {
  async plan(task: string, context: AgentContext): Promise<Plan> {
    // Analyze task
    // Break into steps
    // Return plan
  }
}

// src/background/agent/navigator.ts
class NavigatorAgent {
  async execute(plan: Plan, context: AgentContext): Promise<ActionResult> {
    // Execute plan steps
    // Report progress
  }
}
```

**Note:** This is a major architectural change. Consider only if:
- Tasks become too complex for single agent
- Planning quality is insufficient
- User requests this feature

**Benefits:**
- ✅ Better task breakdown
- ✅ Strategic planning
- ✅ Execution focus

---

## Implementation Priority

### **Sprint 1 (Week 1-2): Foundation**
1. ✅ Token Management System
2. ✅ Enhanced Page Statistics
3. ✅ New Element Detection
4. ✅ Enhanced History Formatting

### **Sprint 2 (Week 3-4): Advanced Features**
5. ✅ Vision/Screenshot Support
6. ✅ File System Integration
7. ✅ Page Info (Scroll Context)
8. ✅ Read State

### **Sprint 3 (Week 5-6): Architecture**
9. ✅ Template System
10. ✅ Procedural Memory Summaries
11. ⚠️ Multi-Agent System (Optional)

---

## Detailed Implementation Guide

### Step 1: Token Management

**File: `src/background/agent/token-manager.ts`**
```typescript
export class TokenManager {
  private maxInputTokens: number;
  private estimatedCharsPerToken: number = 3;
  private imageTokens: number = 800;
  
  constructor(maxInputTokens: number = 128000) {
    this.maxInputTokens = maxInputTokens;
  }
  
  countTextTokens(text: string): number {
    return Math.floor(text.length / this.estimatedCharsPerToken);
  }
  
  countMessageTokens(message: ChatMessage): number {
    let tokens = 0;
    
    if (typeof message.content === 'string') {
      tokens += this.countTextTokens(message.content);
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'text') {
          tokens += this.countTextTokens(part.text);
        } else if (part.type === 'image_url') {
          tokens += this.imageTokens;
        }
      }
    }
    
    // Account for tool calls
    if ('tool_calls' in message && message.tool_calls) {
      tokens += this.countTextTokens(JSON.stringify(message.tool_calls));
    }
    
    return tokens;
  }
  
  trimMessages(
    messages: ChatMessage[],
    systemPrompt: string
  ): ChatMessage[] {
    const systemTokens = this.countTextTokens(systemPrompt);
    let totalTokens = systemTokens;
    const trimmed: ChatMessage[] = [];
    
    // Always keep system message
    // Work backwards from most recent
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.countMessageTokens(msg);
      
      if (totalTokens + msgTokens <= this.maxInputTokens) {
        trimmed.unshift(msg);
        totalTokens += msgTokens;
      } else {
        // Try to trim last message if it's over
        if (i === messages.length - 1) {
          const trimmedMsg = this.trimMessageContent(msg, this.maxInputTokens - totalTokens);
          if (trimmedMsg) {
            trimmed.unshift(trimmedMsg);
          }
        }
        break;
      }
    }
    
    return trimmed;
  }
  
  private trimMessageContent(
    message: ChatMessage,
    availableTokens: number
  ): ChatMessage | null {
    if (typeof message.content !== 'string') {
      return null; // Can't trim non-text messages easily
    }
    
    const maxChars = availableTokens * this.estimatedCharsPerToken;
    const trimmed = message.content.slice(-maxChars);
    
    return {
      ...message,
      content: `...[truncated] ${trimmed}`,
    };
  }
}
```

**Integration:**
```typescript
// In loop.ts
const tokenManager = new TokenManager(128000);
const trimmedMessages = tokenManager.trimMessages(
  conversationMessages,
  systemPrompt
);
```

---

### Step 2: Page Statistics

**File: `src/content/dom-service.ts`**
```typescript
interface PageStatistics {
  links: number;
  interactiveElements: number;
  iframes: number;
  scrollContainers: number;
  images: number;
  shadowOpen: number;
  shadowClosed: number;
  totalElements: number;
}

function extractPageStatistics(node: DOMNode): PageStatistics {
  const stats: PageStatistics = {
    links: 0,
    interactiveElements: 0,
    iframes: 0,
    scrollContainers: 0,
    images: 0,
    shadowOpen: 0,
    shadowClosed: 0,
    totalElements: 0,
  };
  
  function traverse(n: DOMNode) {
    stats.totalElements++;
    
    if (n.tag === 'a') stats.links++;
    if (n.tag === 'iframe' || n.tag === 'frame') stats.iframes++;
    if (n.tag === 'img') stats.images++;
    if (n.isScrollable) stats.scrollContainers++;
    if (n.isInteractive) stats.interactiveElements++;
    
    // Shadow DOM detection (if implemented)
    // if (n.isShadowHost) {
    //   if (hasClosedShadow(n)) stats.shadowClosed++;
    //   else stats.shadowOpen++;
    // }
    
    for (const child of n.children) {
      traverse(child);
    }
  }
  
  traverse(node);
  return stats;
}

// In extractDOM():
export function extractDOM(): SerializedDOM {
  // ... existing code ...
  const tree = buildDOMTree(document.body, 0, null);
  const statistics = tree ? extractPageStatistics(tree) : null;
  
  return {
    tree: serialized,
    selectorMap,
    interactiveCount: nodeIdCounter - 1,
    url: window.location.href,
    title: document.title,
    statistics, // Add this
  };
}
```

**Integration in prompt:**
```typescript
function buildSystemPromptWithHistory(...) {
  // ...
  let pageStats = '';
  if (pageContext.statistics) {
    const s = pageContext.statistics;
    pageStats = `<page_stats>`;
    if (s.totalElements < 10) {
      pageStats += 'Page appears empty (SPA not loaded?) - ';
    }
    pageStats += `${s.links} links, ${s.interactiveElements} interactive, `;
    pageStats += `${s.iframes} iframes, ${s.scrollContainers} scroll containers`;
    if (s.shadowOpen > 0 || s.shadowClosed > 0) {
      pageStats += `, ${s.shadowOpen} shadow(open), ${s.shadowClosed} shadow(closed)`;
    }
    if (s.images > 0) {
      pageStats += `, ${s.images} images`;
    }
    pageStats += `, ${s.totalElements} total elements`;
    pageStats += `</page_stats>\n`;
  }
  
  return `...
    ${pageStats}
    <browser_state>
    ...`;
}
```

---

### Step 3: New Element Detection

**File: `src/content/dom-service.ts`**
```typescript
// Store previous element IDs
let previousElementIds: Set<number> = new Set();

function markNewElements(node: DOMNode): void {
  if (node.id > 0) {
    if (!previousElementIds.has(node.id)) {
      node.isNew = true;
    }
    previousElementIds.add(node.id);
  }
  
  for (const child of node.children) {
    markNewElements(child);
  }
}

// In serializeTree():
function serializeTree(node: DOMNode, depth: number = 0): string {
  // ...
  if (node.id > 0) {
    let prefix = '';
    if (node.isNew) {
      prefix = `*[${node.id}]`; // Mark as new
    } else {
      prefix = `[${node.id}]`;
    }
    // ...
  }
}

// In extractDOM():
export function extractDOM(): SerializedDOM {
  // ... build tree ...
  if (tree) {
    markNewElements(tree);
    // ... serialize ...
  }
  // Don't clear previousElementIds - keep for next comparison
}
```

**Integration:**
- Store `previousElementIds` in `AgentState` or chrome.storage
- Compare on each step
- Clear when URL changes

---

## Testing Strategy

### Unit Tests
- Token counting accuracy
- Page statistics extraction
- New element detection
- History formatting

### Integration Tests
- Token trimming under various scenarios
- Prompt building with all features
- Message flow with token limits

### E2E Tests
- Long task execution
- Context overflow handling
- Multi-step task tracking

---

## Migration Plan

### Phase 1: Add Features (Non-Breaking)
- Add new fields to interfaces (optional)
- Implement features alongside existing code
- Feature flags for gradual rollout

### Phase 2: Integrate Features
- Update prompt building
- Integrate token management
- Update history formatting

### Phase 3: Optimize
- Remove old code
- Optimize token counting
- Performance tuning

---

## Success Metrics

### Performance
- ✅ Token usage reduction (target: 20-30%)
- ✅ Context overflow errors: 0
- ✅ Prompt building time: < 100ms

### Quality
- ✅ Agent success rate improvement
- ✅ Better task completion
- ✅ Reduced confusion errors

### User Experience
- ✅ Faster responses
- ✅ Better task handling
- ✅ More reliable execution

---

## Notes

1. **Token Management**: Start conservative (128k), adjust based on model limits
2. **Page Statistics**: Can be expensive on large pages, consider caching
3. **New Element Detection**: Requires state persistence, use chrome.storage
4. **Vision Support**: Only for models that support vision, add feature flag
5. **File System**: Consider size limits for chrome.storage.local
6. **Multi-Agent**: Major architectural change, evaluate need first

---

## Conclusion

This plan combines the best features from all three systems:
- **Token management** from nanobrowser
- **Page statistics & new element detection** from browser-use
- **Enhanced history** from both
- **Vision support** from browser-use
- **File system** from browser-use
- **Architecture improvements** from all

The plan is prioritized and can be implemented incrementally without breaking existing functionality.

