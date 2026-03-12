import { useState, useEffect } from 'react'
import { useIPC } from '../hooks/useIPC'
import { Config } from '../types'

interface SettingsPanelProps {
  visible: boolean
  onClose: () => void
}

export default function SettingsPanel({ visible, onClose }: SettingsPanelProps) {
  const api = useIPC()
  const [config, setConfig] = useState<Config>({})

  useEffect(() => {
    if (visible) loadConfig()
  }, [visible])

  const loadConfig = async () => {
    const c = await api.getConfig()
    setConfig(c || {})
  }

  const handleSave = async () => {
    await api.saveConfig(config)
    onClose()
  }

  if (!visible) return null

  return (
    <div className="overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
          <div className="setting-item">
            <label>API Key</label>
            <input
              type="password"
              value={config.apiKey || ''}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
          </div>
          <div className="setting-item">
            <label>Model</label>
            <input
              type="text"
              value={config.model || ''}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
            />
          </div>
          <div className="setting-item">
            <label>Theme</label>
            <select
              value={config.theme || 'default'}
              onChange={(e) => setConfig({ ...config, theme: e.target.value })}
            >
              <option value="default">Default</option>
              <option value="codex">Codex</option>
              <option value="claude">Claude</option>
              <option value="nerv">Nerv</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
        <div className="settings-footer">
          <button onClick={handleSave}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
