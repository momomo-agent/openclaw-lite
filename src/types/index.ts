export interface Session {
  id: string
  title: string
  participants?: string[]
  mode?: string
  lastMessage?: string
  lastSender?: string
  lastSenderWsId?: string
  updatedAt?: number
  statusText?: string
  messages?: Message[]
  workspaceId?: string
  workspacePath?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'error' | 'tool' | 'agent-to-agent'
  content: string
  timestamp: number
  sender?: string
  workspaceId?: string
  workspacePath?: string
  avatar?: string
  toolSteps?: ToolStep[]
  thinking?: string
  error?: string
  requestId?: string
  roundPurpose?: string
  attachments?: { name: string; type: string; url?: string }[]
}

export interface ToolStep {
  name: string
  input?: Record<string, any> | string
  output?: string
}

export interface Workspace {
  id: string
  path: string
  identity?: {
    name: string
    avatar?: string
    role?: string
  }
}

export interface Config {
  provider?: string
  apiKey?: string
  baseUrl?: string
  model?: string
  theme?: string
  codingAgent?: string
  tavilyKey?: string
  execApproval?: boolean
  heartbeat?: boolean | { enabled: boolean; intervalMinutes?: number }
  heartbeatInterval?: number
  mcpServers?: any
}

export interface UserProfile {
  userName: string
  userAvatar: string
  avatarAbsPath?: string
}

export interface SessionAgent {
  id: string
  name: string
  role?: string
}

export type ActivityLevel = 'idle' | 'thinking' | 'running' | 'tool' | 'done' | 'need_you'

export interface Draft {
  text: string
  attachments: File[]
}
