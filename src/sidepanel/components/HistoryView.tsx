
import { useState, useEffect } from 'react'
import type { TaskMetadata } from '../../types' // We'll need to export this type
import './HistoryView.css'

interface HistoryViewProps {
    onSelect: (taskId: string) => void
    onClose: () => void
}

// Helper assuming we can access storage directly from sidepanel
// In a clean architecture, we might want to invoke a background service,
// but accessing chrome.storage.local directly is standard for extensions.
const getTasks = async (): Promise<TaskMetadata[]> => {
    const allData = await chrome.storage.local.get(null)
    const tasks: TaskMetadata[] = []

    for (const key in allData) {
        if (key.startsWith('surfi_task_') && !key.includes('latest')) {
            const data = allData[key]
            if (data && data.uiMessages && Array.isArray(data.uiMessages)) {
                // Use imported type if possible, or duplicate logic
                const messages = data.uiMessages
                const firstUserMsg = messages.find((m: any) => m.role === 'user' && m.type === 'text')
                const preview = firstUserMsg ? firstUserMsg.content?.substring(0, 60) || 'No preview' : 'New Task'

                tasks.push({
                    id: key,
                    timestamp: data.timestamp || Date.now(),
                    preview: preview + (preview.length >= 60 ? '...' : ''),
                    messageCount: messages.length
                })
            }
        }
    }
    return tasks.sort((a, b) => b.timestamp - a.timestamp)
}

export function HistoryView({ onSelect, onClose }: HistoryViewProps) {
    const [tasks, setTasks] = useState<TaskMetadata[]>([])
    const [loading, setLoading] = useState(true)

    const loadTasks = async () => {
        setLoading(true)
        const list = await getTasks()
        setTasks(list)
        setLoading(false)
    }

    useEffect(() => {
        loadTasks()
    }, [])

    const handleDelete = async (e: React.MouseEvent, taskId: string) => {
        e.stopPropagation()
        if (confirm('Delete this session?')) {
            await chrome.storage.local.remove(taskId)
            // Also check if we need to update latest? Handled better if we use the Background Helper, 
            // but duplicating here for direct UI speed.
            await loadTasks()
        }
    }

    const handleClearAll = async () => {
        if (confirm('Delete ALL history? This cannot be undone.')) {
            const allData = await chrome.storage.local.get(null)
            const keys = Object.keys(allData).filter(k => k.startsWith('surfi_task_') || k === 'latest_surfi_task_id')
            await chrome.storage.local.remove(keys)
            await loadTasks()
        }
    }

    return (
        <div className="history-view">
            <div className="history-header">
                <h3>📜 History</h3>
                <div className="history-actions">
                    {tasks.length > 0 && (
                        <button className="clear-all-btn" onClick={handleClearAll} title="Clear All">🗑️ All</button>
                    )}
                    <button className="close-history-btn" onClick={onClose}>✕</button>
                </div>
            </div>

            <div className="history-list">
                {loading ? (
                    <div className="history-loading">Loading...</div>
                ) : tasks.length === 0 ? (
                    <div className="history-empty">No past sessions found.</div>
                ) : (
                    tasks.map(task => (
                        <div key={task.id} className="history-item" onClick={() => onSelect(task.id)}>
                            <div className="history-item-header">
                                <span className="history-date">
                                    {new Date(task.timestamp).toLocaleString(undefined, {
                                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                    })}
                                </span>
                                <span className="history-count">({task.messageCount})</span>
                                <button className="history-delete-btn" onClick={(e) => handleDelete(e, task.id)}>🗑️</button>
                            </div>
                            <div className="history-preview">
                                {task.preview}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
