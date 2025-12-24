import type { ModelConfig } from '../../types'
import { getModelEndpointDisplay } from '../utils'

interface ModelCardProps {
  model: ModelConfig
  isActive: boolean
  onSetActive: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ModelCard({ model, isActive, onSetActive, onEdit, onDelete }: ModelCardProps) {
  return (
    <div className={`model-card ${isActive ? 'active' : ''}`}>
      <div className="model-info">
        <div className="model-name">
          {model.name}
          {isActive && <span className="badge">Active</span>}
        </div>
        <div className="model-details">
          <span className="provider">{model.provider}</span>
          <span className="model-id">{model.model}</span>
        </div>
        <div className="model-endpoint">{getModelEndpointDisplay(model)}</div>
      </div>
      <div className="model-actions">
        {!isActive && (
          <button className="btn btn-secondary" onClick={onSetActive}>
            Set Active
          </button>
        )}
        <button className="btn btn-secondary" onClick={onEdit}>
          Edit
        </button>
        <button className="btn btn-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
