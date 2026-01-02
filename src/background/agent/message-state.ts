
import { UIMessage } from '../../types'

export interface TaskMetadata {
    id: string
    timestamp: number
    preview: string
    messageCount: number
}

// ============================================================================
// Message State Handler (Cline-style UI Persistence)
// ============================================================================

export class MessageStateHandler {
    private taskId: string
    private uiMessages: UIMessage[] = []

    constructor(taskId: string) {
        this.taskId = taskId
        // Initialize with the task, but don't save yet until we have messages
    }

    /**
     * Add a UI-friendly message to the state and persist it
     */
    async addUIMessage(message: UIMessage): Promise<void> {
        this.uiMessages.push(message)
        await this.saveState()
    }

    /**
     * Save the current state to storage
     */
    private async saveState(): Promise<void> {
        try {
            await chrome.storage.local.set({
                [this.taskId]: {
                    uiMessages: this.uiMessages,
                    timestamp: Date.now()
                },
                'latest_surfi_task_id': this.taskId
            })
        } catch (error) {
            console.error('Failed to save message state:', error)
        }
    }

    /**
     * Load state from storage
     */
    async loadState(): Promise<void> {
        try {
            const result = await chrome.storage.local.get(this.taskId)
            if (result[this.taskId]) {
                this.uiMessages = result[this.taskId].uiMessages || []
            }
        } catch (error) {
            console.error('Failed to load message state:', error)
        }
    }

    /**
     * Get all UI messages
     */
    getUIMessages(): UIMessage[] {
        return this.uiMessages
    }

    /**
     * Clear history for this task
     */
    async clearHistory(): Promise<void> {
        this.uiMessages = []
        await chrome.storage.local.remove(this.taskId)
    }

    // ============================================================================
    // Static Helpers for History Management
    // ============================================================================

    /**
     * List all stored tasks with metadata
     */
    static async listTasks(): Promise<TaskMetadata[]> {
        try {
            const allData = await chrome.storage.local.get(null)
            const tasks: TaskMetadata[] = []

            for (const key in allData) {
                if (key.startsWith('surfi_task_') && !key.includes('latest')) {
                    const data = allData[key]
                    if (data && data.uiMessages && Array.isArray(data.uiMessages)) {
                        const messages = data.uiMessages as UIMessage[]
                        const firstUserMsg = messages.find(m => m.role === 'user' && m.type === 'text')
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
            // Sort by new to old
            return tasks.sort((a, b) => b.timestamp - a.timestamp)
        } catch (error) {
            console.error('Failed to list tasks:', error)
            return []
        }
    }

    /**
     * Delete a specific task
     */
    static async deleteTask(taskId: string): Promise<void> {
        try {
            await chrome.storage.local.remove(taskId)

            // If we deleted the "latest" task, we should update the pointer
            const meta = await chrome.storage.local.get('latest_surfi_task_id')
            if (meta.latest_surfi_task_id === taskId) {
                await chrome.storage.local.remove('latest_surfi_task_id')
                // Ideally find the next latest and set it? Or just leave it null.
                const remaining = await this.listTasks()
                if (remaining.length > 0) {
                    await chrome.storage.local.set({ 'latest_surfi_task_id': remaining[0].id })
                }
            }
        } catch (error) {
            console.error('Failed to delete task:', error)
        }
    }

    /**
     * Clear all tasks
     */
    static async clearAllTasks(): Promise<void> {
        try {
            const allData = await chrome.storage.local.get(null)
            const keysToRemove = Object.keys(allData).filter(k => k.startsWith('surfi_task_') || k === 'latest_surfi_task_id')
            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove)
            }
        } catch (error) {
            console.error('Failed to clear all tasks:', error)
        }
    }
}
