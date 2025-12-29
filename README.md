# Surfi 🏄

**AI that surfs the web for you.** Automate any web task with natural language.

Surfi is a Chrome extension that uses AI to browse, click, type, and navigate web pages on your behalf. Just tell it what you want to do.

## Features

- **🤖 AI Browser Agent**: Automate any web task using natural language
- **👁️ Page Understanding**: AI sees and understands the current page content
- **🖱️ Smart Actions**: Click buttons, fill forms, scroll, navigate - all via chat
- **🔌 Multi-Provider Support**: OpenAI, Anthropic, AWS Bedrock, Ollama, or any OpenAI-compatible API
- **⚙️ Customizable**: Configure multiple AI models and switch between them

## Demo

> Ask Surfi: "Search for flights from NYC to LA on Google Flights"
> 
> Surfi will: Open Google Flights → Fill origin/destination → Click search

## Getting Started

### Prerequisites

- Node.js 18+ 
- Chrome browser (114+)

### Installation

1. **Clone and install:**
   ```bash
   git clone https://github.com/CrysisDeu/surfi.git
   cd surfi
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `dist` folder

4. **Configure your AI:**
   - Click the Surfi icon → Settings (gear icon)
   - Add your API key for your preferred provider

### Development

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build
```

With `npm run dev`, changes auto-reload:
- **Side panel & Options**: Instant HMR
- **Content scripts**: Page auto-refreshes
- **Background worker**: Extension auto-reloads

## Supported AI Providers

| Provider | Models | Setup |
|----------|--------|-------|
| **OpenAI** | GPT-4, GPT-4 Turbo, GPT-3.5 | API key from OpenAI |
| **Anthropic** | Claude 3 Opus/Sonnet/Haiku | API key from Anthropic |
| **AWS Bedrock** | Claude, Titan, Llama | AWS credentials |
| **Ollama** | Llama 2, Mistral, CodeLlama | Local installation |
| **Custom** | Any OpenAI-compatible API | Your endpoint + key |

## Project Structure

```
surfi/
├── src/
│   ├── sidepanel/        # Chat UI (React)
│   ├── background/       # Service worker & AI agent
│   │   ├── agent/        # Agent loop & orchestration
│   │   ├── browser/      # Tab management & context
│   │   ├── controller/   # Action execution
│   │   ├── providers/    # AI provider integrations
│   │   └── tools/        # Tool definitions
│   ├── content/          # Page interaction scripts
│   ├── options/          # Settings page (React)
│   ├── lib/              # Shared utilities
│   └── types/            # TypeScript definitions
├── public/icons/         # Extension icons
├── manifest.json         # Chrome extension manifest (V3)
└── vite.config.ts        # Build configuration
```

## Example Prompts

- "Summarize this page"
- "Click the sign up button"
- "Fill the email field with test@example.com"
- "Find all product prices on this page"
- "Scroll down and find the contact information"
- "Search for 'AI tools' in the search box"

## Security

- API keys stored in Chrome's encrypted sync storage
- Content scripts only run on pages you visit
- All AI calls made from background worker (no page access to keys)
- No data sent to third parties except your configured AI provider

## Troubleshooting

### Extension not loading
- Run `npm run build` first
- Load the `dist` folder (not project root)
- Check `chrome://extensions/` for errors

### AI not responding
- Verify API key is correct in settings
- Check you have credits/quota with provider
- Look for errors in extension background console

### Actions not working
- Make sure page is fully loaded
- Some sites block automated interaction
- Try refreshing the page

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details

---

**Made with 🏄 by [CrysisDeu](https://github.com/CrysisDeu)**
