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

// URI encode a string according to AWS SigV4 rules (RFC 3986)
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

  // Add required headers
  const signedHeaders: Record<string, string> = {
    ...headers,
    'host': parsedUrl.host,
    'x-amz-date': amzDate,
  }
  
  if (credentials.sessionToken) {
    signedHeaders['x-amz-security-token'] = credentials.sessionToken
  }

  // Create canonical request
  const sortedHeaderKeys = Object.keys(signedHeaders).sort()
  const canonicalHeaders = sortedHeaderKeys
    .map(key => `${key.toLowerCase()}:${signedHeaders[key].trim()}`)
    .join('\n') + '\n'
  const signedHeadersStr = sortedHeaderKeys.map(k => k.toLowerCase()).join(';')
  
  const payloadHash = toHex(await sha256(body))
  
  // For canonical URI, encode the path but preserve already-encoded characters
  // AWS expects the encoded path to be re-encoded (e.g., %3A becomes %253A)
  const canonicalUri = uriEncode(parsedUrl.pathname, false)
  
  const canonicalRequest = [
    method,
    canonicalUri,
    parsedUrl.search.slice(1),
    canonicalHeaders,
    signedHeadersStr,
    payloadHash
  ].join('\n')

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    toHex(await sha256(canonicalRequest))
  ].join('\n')

  // Calculate signature
  const signingKey = await getSignatureKey(credentials.secretAccessKey, dateStamp, region, service)
  const signature = toHex(await hmacSha256(signingKey, stringToSign))

  // Build authorization header
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

// Handle streaming connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'chat-stream') {
    port.onMessage.addListener(async (request) => {
      if (request.type === 'CHAT_MESSAGE_STREAM') {
        try {
          await handleChatMessageStream(request as ChatRequest, port)
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

// Get settings from storage
async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.sync.get('settings')
  return result.settings || DEFAULT_SETTINGS
}

// Get active model configuration
async function getActiveModel(): Promise<ModelConfig | undefined> {
  const settings = await getSettings()
  return settings.models.find((m) => m.id === settings.activeModelId)
}

// Check if model has required credentials
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

// Handle chat messages
async function handleChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const model = await getActiveModel()

  if (!model) {
    return { content: '', error: 'No model configured. Please configure a model in settings.' }
  }

  if (!hasValidCredentials(model)) {
    return { content: '', error: 'Credentials not configured. Please add your API key or AWS credentials in settings.' }
  }

  // Get page context from the active tab
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

  // Build messages for the API
  const systemPrompt = `You are Browser AI, a helpful assistant that helps users interact with web pages.
You can:
1. Answer questions about the current page content
2. Help users find specific information on the page
3. Suggest actions to take on the page (clicking, scrolling, typing)
4. Summarize page content

${pageContext}

When suggesting actions, format them as JSON like:
{"action": "click", "selector": "button.submit"}
{"action": "type", "selector": "input#search", "value": "search term"}
{"action": "scroll", "direction": "down"}
{"action": "navigate", "url": "https://example.com"}

Be concise and helpful. If you're unsure about something on the page, say so.`

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

// Call the model API based on provider
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

// OpenAI API call
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

// Anthropic API call
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

// Handle streaming chat messages
async function handleChatMessageStream(request: ChatRequest, port: chrome.runtime.Port): Promise<void> {
  const model = await getActiveModel()

  if (!model) {
    port.postMessage({ type: 'error', error: 'No model configured. Please configure a model in settings.' })
    return
  }

  if (!hasValidCredentials(model)) {
    port.postMessage({ type: 'error', error: 'Credentials not configured. Please add your API key or AWS credentials in settings.' })
    return
  }

  // Get page context from the active tab
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
You can:
1. Answer questions about the current page content
2. Help users find specific information on the page
3. Suggest actions to take on the page (clicking, scrolling, typing)
4. Summarize page content

${pageContext}

When suggesting actions, format them as JSON like:
\`\`\`json
{"action": "click", "selector": "button.submit"}
\`\`\`
\`\`\`json
{"action": "type", "selector": "input#search", "value": "search term"}
\`\`\`
\`\`\`json
{"action": "scroll", "direction": "down"}
\`\`\`
\`\`\`json
{"action": "navigate", "url": "https://example.com"}
\`\`\`

Be concise and helpful. If you're unsure about something on the page, say so.`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...request.payload.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  try {
    // Use non-streaming API for all providers (streaming requires complex binary parsing for Bedrock)
    const response = await callModelAPI(model, messages)
    port.postMessage({ type: 'chunk', content: response })
    port.postMessage({ type: 'done' })
  } catch (error) {
    console.error('API call failed:', error)
    port.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Failed to get response from AI' })
  }
}

// AWS Bedrock Streaming API call
async function callBedrockStream(
  model: BedrockModelConfig,
  messages: Array<{ role: string; content: string }>,
  port: chrome.runtime.Port
): Promise<void> {
  const region = model.awsRegion
  const modelId = model.model
  
  // Bedrock streaming endpoint
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse-stream`
  
  // Format messages for Bedrock Converse API
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

  if (!response.body) {
    throw new Error('Response body is null')
  }

  // Read the event stream
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      
      // Parse AWS event stream format
      // Events are binary-encoded with headers and payload
      // For simplicity, we'll look for JSON payloads
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue
        
        // Try to extract JSON from the binary event stream
        // AWS event stream format includes length-prefixed messages
        // Look for contentBlockDelta events
        try {
          // Find JSON objects in the stream
          const jsonMatch = line.match(/\{[^{}]*"contentBlockDelta"[^{}]*\{[^{}]*"text"[^{}]*\}[^{}]*\}/)
          if (jsonMatch) {
            const event = JSON.parse(jsonMatch[0])
            const text = event.contentBlockDelta?.delta?.text
            if (text) {
              port.postMessage({ type: 'chunk', content: text })
            }
          }
        } catch {
          // Not valid JSON, continue
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  port.postMessage({ type: 'done' })
}

// AWS Bedrock API call
async function callBedrock(
  model: BedrockModelConfig,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const region = model.awsRegion
  const modelId = model.model
  
  // Bedrock endpoint
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`
  
  // Format messages for Bedrock Converse API
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

  // Add system prompt if present
  if (systemMessages.length > 0) {
    body.system = systemMessages.map(m => ({ text: m.content }))
  }

  const bodyString = JSON.stringify(body)
  
  // Sign the request with AWS Signature V4
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
  
  // Parse Bedrock Converse response
  return data.output?.message?.content?.[0]?.text || ''
}

// Custom (OpenAI-compatible) API call
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

// Get page context from content script
async function getPageContext(
  tabId: number
): Promise<{ url: string; title: string; content: string; selectedText?: string }> {
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

// Execute action on page via content script
async function executeAction(
  tabId: number,
  action: { type: string; selector?: string; value?: string; url?: string }
): Promise<{ success: boolean; error?: string }> {
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

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Browser AI extension installed')
  
  chrome.storage.sync.get('settings', (result) => {
    if (!result.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
    }
  })
})
