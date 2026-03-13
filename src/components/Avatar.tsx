import { useAppState } from '../store'

interface AvatarProps {
  raw?: string
  role: 'user' | 'assistant'
  wsPath?: string
}

// Default preset images (relative to renderer/src/index.html)
const DEFAULT_USER_AVATAR = '../avatars/0.png'
const DEFAULT_ASSISTANT_AVATAR = '../avatars/1.png'

function presetSrc(raw: string, fallback: string): string {
  const idx = parseInt(raw.replace('preset:', '')) || 0
  return `../avatars/${idx}.png`
}

export function Avatar({ raw, role, wsPath }: AvatarProps) {
  const { avatarVersion, userProfile } = useAppState()

  // ── User avatar: derived from store, always reactive ──
  if (role === 'user') {
    const av = userProfile?.userAvatar || 'preset:0'
    if (av.startsWith('preset:')) {
      return <img src={presetSrc(av, DEFAULT_USER_AVATAR)} className="avatar-img" onError={(e) => { e.currentTarget.src = DEFAULT_USER_AVATAR }} />
    }
    // Custom file (user-avatar.png)
    const src = userProfile?.avatarAbsPath
      ? `file://${userProfile.avatarAbsPath}?v=${avatarVersion}`
      : DEFAULT_USER_AVATAR
    return <img src={src} className="avatar-img" onError={(e) => { e.currentTarget.src = DEFAULT_USER_AVATAR }} />
  }

  // ── Assistant avatar: from workspace identity (passed as raw) ──
  if (raw && raw.startsWith('preset:')) {
    return <img src={presetSrc(raw, DEFAULT_ASSISTANT_AVATAR)} className="avatar-img" onError={(e) => { e.currentTarget.src = DEFAULT_ASSISTANT_AVATAR }} />
  }

  // Relative path (e.g. ../avatars/claude.png) — use as-is, resolved relative to HTML
  if (raw && raw.startsWith('../')) {
    return <img src={raw} className="avatar-img" onError={(e) => { e.currentTarget.src = DEFAULT_ASSISTANT_AVATAR }} />
  }

  if (raw && raw.includes('.') && wsPath) {
    return <img src={`file://${wsPath}/.paw/${raw}?v=${avatarVersion}`} className="avatar-img" onError={(e) => { e.currentTarget.src = DEFAULT_ASSISTANT_AVATAR }} />
  }

  return <img src={DEFAULT_ASSISTANT_AVATAR} className="avatar-img" />
}
