# Privacy Policy for Surfi

**Last Updated:** [Date]

## Introduction

Surfi ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how the Surfi Chrome extension ("Extension," "Service") collects, uses, stores, and protects your information.

By using Surfi, you agree to the collection and use of information in accordance with this policy.

## Information We Collect

### 1. User-Provided Information

**API Keys and Credentials:**
- AI provider API keys (OpenAI, Anthropic, AWS Bedrock, or custom endpoints)
- AWS credentials (Access Key ID, Secret Access Key, Region) for AWS Bedrock
- Custom API endpoints and authentication tokens

**Settings and Preferences:**
- Selected AI model and provider preferences
- Agent configuration (max iterations, temperature, etc.)
- Theme preferences (dark/light mode)

**Chat History:**
- Messages you send to the AI assistant
- AI responses and automation results
- Conversation history

### 2. Automatically Collected Information

**Page Content (Active Tabs Only):**
- DOM structure of pages you visit (only when you actively use the extension)
- Page text content, titles, and URLs
- Visible elements and interactive components

**Browser Information:**
- Active tab information (URL, title)
- Tab state for automation purposes

**Note:** The extension only accesses pages you actively visit and interact with. It does not access pages in the background or without your explicit interaction.

## How We Use Your Information

### Primary Uses

1. **Browser Automation:** Page content and DOM structure are analyzed to enable AI-powered automation of web interactions (clicking, typing, navigating, extracting information).

2. **AI Processing:** Your commands and page content are sent to your configured AI provider to generate automation instructions. This includes:
   - Natural language commands you input
   - Page context (DOM structure, visible text) for AI analysis
   - Automation results and feedback

3. **Extension Functionality:**
   - Storing your preferences and settings
   - Maintaining chat history for your reference
   - Syncing settings across your Chrome browsers (via Chrome Sync)

### What We Do NOT Do

- ❌ We do not track your browsing behavior
- ❌ We do not collect analytics or usage statistics
- ❌ We do not sell or share your data with third parties (except your configured AI provider)
- ❌ We do not access pages you don't actively interact with
- ❌ We do not store page content permanently (only during active automation sessions)

## Data Storage

### Local Storage

**Chrome Storage Sync (Encrypted):**
- API keys and credentials
- Extension settings and preferences
- Theme preferences

This data is encrypted by Chrome and synced across your Chrome browsers when you're signed into Chrome.

**Chrome Storage Local:**
- Chat history (stored locally on your device, not synced)

**Browser LocalStorage:**
- Theme preference (for immediate UI rendering)

### Data Retention

- **API Keys and Settings:** Stored until you delete them or uninstall the extension
- **Chat History:** Stored locally until you clear it or uninstall the extension
- **Page Content:** Only processed during active automation sessions; not stored permanently

## Data Sharing and Third Parties

### AI Providers

When you use Surfi, your data is shared with your configured AI provider:

- **OpenAI:** If you use OpenAI models, your prompts and page content are sent to `api.openai.com`
- **Anthropic:** If you use Claude models, your data is sent to `api.anthropic.com`
- **AWS Bedrock:** If you use AWS Bedrock, your data is sent to your configured AWS region endpoint
- **Custom Providers:** If you configure a custom endpoint, your data is sent to that endpoint

**Important:** Each AI provider has its own privacy policy. We recommend reviewing their policies:
- [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)
- [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
- [AWS Privacy Policy](https://aws.amazon.com/privacy/)

### No Other Third Parties

We do not share your data with:
- Advertising networks
- Analytics services
- Data brokers
- Any other third parties (except your configured AI provider)

## Security Measures

1. **Encrypted Storage:** API keys are stored in Chrome's encrypted sync storage
2. **Local Processing:** All automation logic runs locally in your browser
3. **No Remote Code:** The extension does not download or execute remote code
4. **HTTPS Only:** All API communications use secure HTTPS connections
5. **User Control:** You control which AI provider receives your data

## Your Rights and Choices

### Access and Control

- **View Your Data:** Access your settings and chat history through the extension's options page
- **Delete Data:** Clear chat history or remove API keys at any time through the extension settings
- **Uninstall:** Uninstalling the extension removes all locally stored data

### API Key Management

- You can add, edit, or remove API keys at any time
- API keys are stored locally and encrypted by Chrome
- Removing an API key immediately stops data transmission to that provider

### Data Portability

- Chat history is stored locally and can be accessed through Chrome's storage APIs
- Settings can be exported by accessing Chrome's sync storage

## Children's Privacy

Surfi is not intended for users under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.

## International Users

If you are using Surfi from outside the United States, please note that:
- Your data may be processed in the country where your configured AI provider operates
- Different privacy laws may apply depending on your location
- By using Surfi, you consent to the transfer of your information to your configured AI provider's servers

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by:
- Updating the "Last Updated" date at the top of this policy
- Posting a notice in the extension (for significant changes)

Your continued use of Surfi after any changes constitutes acceptance of the updated policy.

## Contact Us

If you have questions about this Privacy Policy or our data practices, please contact us:

- **GitHub:** [Your GitHub repository URL]
- **Email:** [Your contact email if applicable]

## Compliance

This Privacy Policy is designed to comply with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

## Summary

**In simple terms:**
- Surfi stores your AI API keys and settings locally (encrypted)
- When you use Surfi, your commands and page content are sent to your chosen AI provider
- We don't track you, analyze your behavior, or share your data with anyone except your AI provider
- You control all your data and can delete it anytime
- All processing happens locally in your browser

---

**Effective Date:** [Date of publication]
**Version:** 1.0

