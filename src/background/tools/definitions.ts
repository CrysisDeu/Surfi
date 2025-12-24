// Tool definitions index - re-exports from browser-tools
import { allBrowserTools } from './browser-tools'

// Convert BrowserTool format to Bedrock tool spec format
export function getBedrockToolSpecs(): Array<{
  toolSpec: {
    name: string
    description: string
    inputSchema: {
      json: unknown
    }
  }
}> {
  return allBrowserTools.map((tool) => ({
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: {
        json: tool.inputSchema,
      },
    },
  }))
}

// Get Bedrock tool configuration for API calls
export function getBedrockToolConfig() {
  return {
    tools: getBedrockToolSpecs(),
    toolChoice: { auto: {} },
  }
}

// Export all tools and categories
export {
  allBrowserTools,
  navigationTools,
  interactionTools,
  dropdownTools,
  extractionTools,
  completionTools,
  type BrowserTool,
} from './browser-tools'

// Legacy export for backward compatibility
export const BROWSER_TOOLS = getBedrockToolSpecs()
