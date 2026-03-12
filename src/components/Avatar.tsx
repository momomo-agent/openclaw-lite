import { useRef } from 'react'

interface AvatarProps {
  raw?: string
  role: 'user' | 'assistant'
  wsPath?: string
  userAvatarPath?: string
}

// Default preset images (relative to renderer/src/index.html)
const DEFAULT_USER_AVATAR = '../avatars/0.png'
const DEFAULT_ASSISTANT_AVATAR = '../avatars/1.png'

export function Avatar({ raw, role, wsPath, userAvatarPath }: AvatarProps) {
  // Stable cache-buster: only changes when the component mounts, not every render
  const ts = useRef(Date.now())

  // User role: show user profile avatar image
  if (role === 'user') {
    const src = userAvatarPath
      ? `file://${userAvatarPath}?t=${ts.current}`
      : DEFAULT_USER_AVATAR
    return (
      <img
        src={src}
        className="avatar-img"
        onError={(e) => { e.currentTarget.src = DEFAULT_USER_AVATAR }}
      />
    )
  }

  // Assistant role: show workspace avatar image
  if (raw && raw.includes('.') && wsPath) {
    return (
      <img
        src={`file://${wsPath}/.paw/${raw}?t=${ts.current}`}
        className="avatar-img"
        onError={(e) => { e.currentTarget.src = DEFAULT_ASSISTANT_AVATAR }}
      />
    )
  }

  // Fallback: always an image, never emoji
  return (
    <img
      src={DEFAULT_ASSISTANT_AVATAR}
      className="avatar-img"
    />
  )
}
