interface AvatarProps {
  raw?: string
  role: 'user' | 'assistant'
  wsPath?: string
  userAvatarPath?: string
}

export function Avatar({ raw, role, wsPath, userAvatarPath }: AvatarProps) {
  const ts = Date.now()

  // User role: show user profile avatar
  if (role === 'user' && userAvatarPath) {
    return (
      <img
        src={`file://${userAvatarPath}?t=${ts}`}
        className="avatar-img"
        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.textContent = '👤' }}
      />
    )
  }

  // Fallback icons
  if (!raw) return <span>{role === 'user' ? '👤' : '🤖'}</span>

  // PNG file in .paw/
  if (raw.includes('.') && wsPath) {
    return (
      <img
        src={`file://${wsPath}/.paw/${raw}?t=${ts}`}
        className="avatar-img"
        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.textContent = '🤖' }}
      />
    )
  }

  // Plain text emoji
  return <span>{raw}</span>
}
