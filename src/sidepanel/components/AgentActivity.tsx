import { useState } from 'react'
import type { UIMessage } from '../../types'
import { ChatMessage } from './ChatMessage'
import './AgentActivity.css'

interface AgentActivityProps {
    messages: UIMessage[]
    isActive: boolean
}

export function AgentActivity({ messages, isActive }: AgentActivityProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // If no messages, render nothing
    if (!messages || messages.length === 0) return null

    // Get the latest message for the summary line
    const latestMsg = messages[messages.length - 1]

    // Determine summary text
    let summaryText = 'Processing...'
    if (latestMsg.type === 'thinking') {
        summaryText = 'Thinking...'
    } else if (latestMsg.type === 'tool_use') {
        summaryText = `Using tool: ${latestMsg.tool || 'Unknown'}...`
    } else if (latestMsg.type === 'tool_result') {
        summaryText = 'Analyzed result.'
    }

    return (
        <div className={`agent-activity-container ${isActive ? 'active' : ''}`}>
            {/* Collapsed Header Line */}
            <div
                className="agent-activity-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={`activity-indicator ${isActive ? 'pulse' : ''}`}>
                    {isActive ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    )}
                </div>
                <div className="activity-summary">
                    {summaryText}
                </div>
                <div className={`activity-chevron ${isExpanded ? 'expanded' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="agent-activity-content">
                    {messages.map((msg) => (
                        <ChatMessage key={msg.id} message={msg} />
                    ))}
                </div>
            )}
        </div>
    )
}
