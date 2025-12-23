import type { ChatRequest, ChatResponse, Settings, ModelConfig, BedrockModelConfig } from '../types'

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

// Tool definitions for the ReAct agent
const BROWSER_TOOLS = [
  {
    toolSpec: {
      name: 'click',
      description: 'Click on an element on the page. Use CSS selectors to identify elements.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element to click (e.g., "button.submit", "#login-btn", "[data-testid=search]")'
            }
          },
          required: ['selector']
        }
      }
    }
  },
  {
    toolSpec: {
      name: 'type',
      description: 'Type text into an input field, textarea, or other text input element.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the input element'
            },
            value: {
              type: 'string',
              description: 'Text to type into the element'
            }
          },
          required: ['selector', 'value']
        }
      }
    }
  },
  {
    toolSpec: {
      name: 'scroll',
      description: 'Scroll the page up or down by one viewport height.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['up', 'down'],
              description: 'Direction to scroll'
            }
          },
          required: ['direction']
        }
      }
    }
  },
  {
    toolSpec: {
      name: 'navigate',
      description: 'Navigate to a different URL.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to navigate to'
            }
          },
          required: ['url']
        }
      }
    }
  },
  {
    toolSpec: {
      name: 'extract',
      description: 'Extract text content from an element on the page.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element to extract text from. Leave empty to get all page content.'
            }
          },
          required: []
        }
      }
    }
  }
]

// AWS Signature V4 utilities
async function sha256(message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  return crypto.subtle.digest('SHA-256', data)
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const keyBuffer = key instanceof Uint8Array ? new Uint8Array(key).buffer as ArrayBuffer : key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const kDate = await hmacSha256(encoder.encode('AWS4' + secretKey), dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

function uriEncode(str: string, encodeSlash: boolean = true): string {
  return str.split('').map(char => {
    if ((char >= 'A' && char <= 'Z') ||
        (char >= 'a' && char <= 'z') ||
        (char >= '0' && char <= '9') ||
        char === '_' || char === '-' || char === '~' || char === '.') {
      return char
    }
    if (char === '/' && !encodeSlash) {
      return char
    }
    return '%' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
  }).join('')
}

async function signAWSRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string,
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string },
  region: string,
  service: string
): Promise<Record<string, string>> {
  const parsedUrl = new URL(url)
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'
  const dateStamp = amzDate.slice(0, 8)

  const signedHeaders: Record<string, string> = {
    ...headers,
    'host': parsedUrl.host,
    'x-amz-date': amzDate,
  }
  
  if (credentials.sessionToken) {
    signedHeaders['x-amz-security-token'] = credentials.sessionToken
  }

  const sortedHeaderKeys = Object.keys(signedHeaders).sort()
  const canonicalHeaders = sortedHeaderKeys
    .map(key => `${key.toLowerCase()}:${signedHeaders[key].trim()}`)
    .join('\n') + '\n'
  const signedHeadersStr = sortedHeaderKeys.map(k => k.toLowerCase()).join(';')
  
  const payloadHash = toHex(await sha256(body))
  const canonicalUri = uriEncode(parsedUrl.pathname, false)
  
  const canonicalRequest = [
    method,
    canonicalUri,
    parsedUrl.search.slice(1),
    canonicalHeaders,
    signedHeadersStr,
    payloadHash
  ].join('\n')

  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest))
  ].join('\n')

  const signingKey = await getSignatureKey(credentials.secretAccessKey, dateStamp, region, service)
  const signature = toHex(await hmacSha256(signingKey, stringToSign))

  const authorization = `${algorithm} Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`

  return {
    ...signedHeaders,
    'Authorization': authorization,
  }
}

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
          port.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })
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

async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('settings')
  return result.settings || DEFAULT_SETTINGS
}

async function getActiveModel(): Promise<ModelConfig | undefined> {
  const settings = await getSettings()
  return settings.models.find((m) => m.id === settings.activeModelId)
}

function hasValidCredentials(model: ModelConfig): boolean {
  switch (model.provider) {
    case 'bedrock':
      return !!(model.awsAccessKeyId && model.awsSecretAccessKey && model.awsRegion)
    case 'openai':
    case 'anthropic':
    case 'custom':
      return !!model.apiKey
    default:
      return false
  }
}

// ReAct Agent Loop
async function handleAgentLoop(request: ChatRequest, port: chrome.runtime.Port): Promise<void> {
  const model = await getActiveModel()

  if (!model) {
    port.postMessage({ type: 'error', error: 'No model configured. Please configure a model in settings.' })
    return
  }

  if (!hasValidCredentials(model)) {
    port.postMessage({ type: 'error', error: 'Credentials not configured. Please add your API key or AWS credentials in settings.' })
    return
  }

  // Get page context
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let pageContext = ''
  let interactiveElements: Array<{ tag: string; text: string; selector: string; type?: string }> = []
  
  if (tab?.id) {
    try {
      const context = await getPageContext(tab.id)
      pageContext = `
Current page information:
- URL: ${context.url}
- Title: ${context.title}
- Content summary: ${context.content.substring(0, 3000)}
${context.selectedText ? `- Selected text: ${context.selectedText}` : ''}
`
      interactiveElements = context.interactiveElements || []
    } catch (error) {
      console.warn('Could not get page context:', error)
    }
  }

  const systemPrompt = `You are Browser AI, an autonomous browser agent that helps users interact with web pages.

${pageContext}

Available interactive elements on the page:
${interactiveElements.slice(0, 30).map(el => `- ${el.tag}${el.type ? `[type=${el.type}]` : ''}: "${el.text}" (selector: ${el.selector})`).join('\n')}

You have access to browser tools to interact with the page. When the user asks you to do something:
1. Think about what actions are needed
2. Use the appropriate tools to accomplish the task
3. Report back on what you did and the result

Be proactive - if the user asks to do something, actually DO it using your tools rather than just explaining how.
Always use specific CSS selectors from the interactive elements list when possible.`

  // Build conversation for the agent
  const conversationMessages: Array<{ role: string; content: unknown[] }> = request.payload.messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: [{ text: m.content }]
  }))

  // Only use tools for Bedrock provider
  if (model.provider !== 'bedrock') {
    // Fallback for non-Bedrock providers
    const response = await callModelAPI(model, [
      { role: 'system', content: systemPrompt },
      ...request.payload.messages
    ])
    port.postMessage({ type: 'chunk', content: response })
    port.postMessage({ type: 'done' })
    return
  }

  // ReAct loop for Bedrock with tool use
  const MAX_ITERATIONS = 5
  let iteration = 0
  let fullResponse = ''

  while (iteration < MAX_ITERATIONS) {
    iteration++
    
    const response = await callBedrockWithTools(
      model as BedrockModelConfig,
      systemPrompt,
      conversationMessages
    )

    // Check if model wants to use a tool
    if (response.stopReason === 'tool_use') {
      const toolUseBlocks = response.output?.message?.content?.filter(
        (block: { toolUse?: unknown }) => block.toolUse
      ) || []
      
      for (const block of toolUseBlocks) {
        const toolUse = block.toolUse as { toolUseId: string; name: string; input: Record<string, unknown> }
        const toolName = toolUse.name
        const toolInput = toolUse.input
        
        // Send thinking to user
        port.postMessage({ 
          type: 'chunk', 
          content: `\n🔧 Using tool: ${toolName}(${JSON.stringify(toolInput)})\n` 
        })
        fullResponse += `\n🔧 Using tool: ${toolName}(${JSON.stringify(toolInput)})\n`

        // Execute the tool
        let toolResult: { success: boolean; error?: string; content?: string }
        
        if (tab?.id) {
          toolResult = await executeAction(tab.id, {
            type: toolName as 'click' | 'type' | 'scroll' | 'navigate' | 'extract',
            selector: toolInput.selector as string | undefined,
            value: toolInput.value as string | undefined,
            url: toolInput.url as string | undefined,
            direction: toolInput.direction as 'up' | 'down' | undefined,
          })
        } else {
          toolResult = { success: false, error: 'No active tab' }
        }

        // Report result
        const resultMessage = toolResult.success 
          ? `✅ Success${toolResult.content ? `: ${toolResult.content.substring(0, 500)}` : ''}`
          : `❌ Failed: ${toolResult.error}`
        
        port.postMessage({ type: 'chunk', content: resultMessage + '\n' })
        fullResponse += resultMessage + '\n'

        // Add tool result to conversation
        conversationMessages.push({
          role: 'assistant',
          content: (response.output?.message?.content || []) as unknown[]
        })
        conversationMessages.push({
          role: 'user',
          content: [{
            toolResult: {
              toolUseId: toolUse.toolUseId,
              content: [{ text: resultMessage }]
            }
          }] as unknown[]
        })
      }
    } else {
      // Model finished (end_turn or stop_sequence)
      const textContent = response.output?.message?.content?.find(
        (block: { text?: string }) => block.text
      )
      if (textContent?.text) {
        port.postMessage({ type: 'chunk', content: textContent.text })
        fullResponse += textContent.text
      }
      break
    }
  }

  if (iteration >= MAX_ITERATIONS) {
    port.postMessage({ type: 'chunk', content: '\n\n⚠️ Reached maximum iterations. Stopping.' })
  }

  port.postMessage({ type: 'done' })
}

// Call Bedrock with tool definitions
async function callBedrockWithTools(
  model: BedrockModelConfig,
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown[] }>
): Promise<{
  stopReason: string
  output?: {
    message?: {
      content?: Array<{ text?: string; toolUse?: unknown }>
    }
  }
}> {
  const region = model.awsRegion
  const modelId = model.model
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`

  const body: Record<string, unknown> = {
    messages,
    system: [{ text: systemPrompt }],
    toolConfig: {
      tools: BROWSER_TOOLS
    },
    inferenceConfig: {
      maxTokens: model.maxTokens || 4096,
      temperature: model.temperature || 0.7,
    },
  }

  const bodyString = JSON.stringify(body)
  
  const headers = await signAWSRequest(
    'POST',
    url,
    { 'Content-Type': 'application/json' },
    bodyString,
    {
      accessKeyId: model.awsAccessKeyId,
      secretAccessKey: model.awsSecretAccessKey,
      sessionToken: model.awsSessionToken,
    },
    region,
    'bedrock'
  )

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyString,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Bedrock API error (${response.status}): ${errorText}`)
  }

  return await response.json()
}

// Non-agent chat handler (for simple questions)
async function handleChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const model = await getActiveModel()

  if (!model) {
    return { content: '', error: 'No model configured. Please configure a model in settings.' }
  }

  if (!hasValidCredentials(model)) {
    return { content: '', error: 'Credentials not configured. Please add your API key or AWS credentials in settings.' }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let pageContext = ''
  
  if (tab?.id) {
    try {
      const context = await getPageContext(tab.id)
      pageContext = `
Current page information:
- URL: ${context.url}
- Title: ${context.title}
- Content summary: ${context.content.substring(0, 2000)}...
${context.selectedText ? `- Selected text: ${context.selectedText}` : ''}
`
    } catch (error) {
      console.warn('Could not get page context:', error)
    }
  }

  const systemPrompt = `You are Browser AI, a helpful assistant that helps users interact with web pages.
${pageContext}
Be concise and helpful.`

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

async function callModelAPI(
  model: ModelConfig,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  switch (model.provider) {
    case 'openai':
      return callOpenAI(model, messages)
    case 'anthropic':
      return callAnthropic(model, messages)
    case 'bedrock':
      return callBedrock(model, messages)
    case 'custom':
      return callCustom(model, messages)
    default:
      throw new Error(`Unknown provider: ${(model as ModelConfig).provider}`)
  }
}

async function callOpenAI(
  model: { apiEndpoint: string; apiKey: string; model: string; maxTokens?: number; temperature?: number },
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await fetch(model.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`,
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
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callAnthropic(
  model: { apiEndpoint: string; apiKey: string; model: string; maxTokens?: number; temperature?: number },
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await fetch(model.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': model.apiKey,
      'anthropic-version': '2023-06-01',
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

async function callBedrock(
  model: BedrockModelConfig,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const region = model.awsRegion
  const modelId = model.model
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`
  
  const systemMessages = messages.filter(m => m.role === 'system')
  const conversationMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: [{ text: m.content }]
    }))

  const body: Record<string, unknown> = {
    messages: conversationMessages,
    inferenceConfig: {
      maxTokens: model.maxTokens || 4096,
      temperature: model.temperature || 0.7,
    },
  }

  if (systemMessages.length > 0) {
    body.system = systemMessages.map(m => ({ text: m.content }))
  }

  const bodyString = JSON.stringify(body)
  
  const headers = await signAWSRequest(
    'POST',
    url,
    { 'Content-Type': 'application/json' },
    bodyString,
    {
      accessKeyId: model.awsAccessKeyId,
      secretAccessKey: model.awsSecretAccessKey,
      sessionToken: model.awsSessionToken,
    },
    region,
    'bedrock'
  )

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyString,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Bedrock API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.output?.message?.content?.[0]?.text || ''
}

async function callCustom(
  model: { apiEndpoint: string; apiKey: string; model: string; maxTokens?: number; temperature?: number },
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const response = await fetch(model.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`,
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

async function getPageContext(
  tabId: number
): Promise<{ url: string; title: string; content: string; selectedText?: string; interactiveElements?: Array<{ tag: string; text: string; selector: string; type?: string }> }> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_CONTEXT' })
    return response
  } catch (error) {
    const tab = await chrome.tabs.get(tabId)
    return {
      url: tab.url || '',
      title: tab.title || '',
      content: '',
    }
  }
}

async function executeAction(
  tabId: number,
  action: { type: string; selector?: string; value?: string; url?: string; direction?: 'up' | 'down' }
): Promise<{ success: boolean; error?: string; content?: string }> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'EXECUTE_ACTION',
      action,
    })
    return response
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute action',
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Browser AI extension installed')
  
  chrome.storage.sync.get('settings', (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
    }
  })
})
