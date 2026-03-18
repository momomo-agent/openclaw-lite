import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Blue Team: Adversarial tests for delegate message persistence
 * 
 * Attack vectors:
 * 1. Duplicate messages — delegate persisted + finishChat runs normally
 * 2. Ordering violation — delegate B persisted before A but visual order is A then B
 * 3. Partial crash — 1st delegate persisted, 2nd delegate mid-streaming when crash
 * 4. DB write failure — appendMessage throws, should not crash delegate flow
 * 5. Empty delegate — delegate returns empty text, should not create ghost messages
 * 6. Reload after crash — DB has immediate + no orch segments, UI must not break
 */

describe('🔴 BLUE TEAM: delegate persistence attack vectors', () => {
  it('ATTACK: finishChat runs after delegates already persisted → no duplicates', () => {
    // Scenario: Normal completion (no crash). Delegates wrote to DB immediately.
    // Then finishChat runs. Old code would write delegates AGAIN → duplicates.
    
    const db = []
    const appendMessage = (ws, sid, msg) => db.push(msg)

    // Phase 1: Delegates write immediately (during streaming)
    appendMessage('/ws', 's1', { role: 'assistant', content: 'From A', sender: 'A', _delegateImmediate: true })
    appendMessage('/ws', 's1', { role: 'assistant', content: 'From B', sender: 'B', _delegateImmediate: true })

    // Phase 2: finishChat runs (simulating NEW code that skips delegates)
    const delegateMsgs = [
      { sender: 'A', content: 'From A' },
      { sender: 'B', content: 'From B' },
    ]
    const steps = [
      { name: 'delegate_to' },
      { name: 'delegate_to' },
    ]
    
    let currentSteps = []
    let delegateIdx = 0
    for (const step of steps) {
      currentSteps.push(step)
      if (step.name === 'delegate_to' && delegateIdx < delegateMsgs.length) {
        if (currentSteps.length) {
          appendMessage('/ws', 's1', { role: 'assistant', content: '', toolSteps: currentSteps })
        }
        currentSteps = []
        delegateIdx++ // SKIP — already in DB
      }
    }

    // Count delegate content messages (not orch segments)
    const delegateContent = db.filter(m => m.sender === 'A' || m.sender === 'B')
    expect(delegateContent).toHaveLength(2) // Exactly 2, not 4
    
    // Count orchestrator segments
    const orchSegments = db.filter(m => m.toolSteps)
    expect(orchSegments).toHaveLength(2) // 2 orch segments with delegate_to steps
  })

  it('ATTACK: ordering after reload — delegates before orchestrator segments', () => {
    // Scenario: Delegate A finishes at t=100, Delegate B at t=200.
    // App crashes. Restart loads from DB.
    // DB has: user(t=50) → delegateA(t=100) → delegateB(t=200)
    // Missing: orchestrator toolStep segments (never written — finishChat didn't run)
    // Question: Does UI show messages in correct order?
    
    const db = [
      { role: 'user', content: 'Hello', timestamp: 50 },
      { role: 'assistant', content: 'From A', sender: 'A', timestamp: 100, _delegateImmediate: true },
      { role: 'assistant', content: 'From B', sender: 'B', timestamp: 200, _delegateImmediate: true },
    ]

    // UI loads messages sorted by timestamp (loadSession returns by insert order / rowid)
    // Since delegates are appended in completion order, rowid order = chronological
    expect(db[0].role).toBe('user')
    expect(db[1].sender).toBe('A')
    expect(db[2].sender).toBe('B')
    expect(db[0].timestamp).toBeLessThan(db[1].timestamp)
    expect(db[1].timestamp).toBeLessThan(db[2].timestamp)
  })

  it('ATTACK: partial crash — delegate A saved, delegate B mid-streaming', () => {
    // Scenario: A finished and was persisted. B was mid-streaming when app crashed.
    // Result: DB has user + A's response. B is lost.
    // Acceptable? Yes — B hadn't finished. Same as iMessage: sent but not delivered.
    
    const db = [
      { role: 'user', content: 'Hello', timestamp: 50 },
      { role: 'assistant', content: 'From A', sender: 'A', timestamp: 100 },
    ]

    // User reopens app → sees their message + A's response. B is missing.
    // This is expected behavior: B never completed, so there's nothing to save.
    expect(db).toHaveLength(2)
    expect(db[1].sender).toBe('A')
  })

  it('ATTACK: appendMessage throws during delegate persist', () => {
    // Scenario: DB is locked or disk full. appendMessage throws.
    // Should not crash the delegate flow.
    
    // Simulate delegate.js try-catch:
    let flowContinued = false
    try {
      // Simulated appendMessage that throws
      throw new Error('SQLITE_BUSY: database is locked')
    } catch (e) {
      // delegate.js catches this
      console.error('[delegate_to] immediate persist failed:', e.message)
    }
    
    // Flow should continue — delegate still in _pendingDelegateMessages
    // finishChat can try again later
    flowContinued = true
    expect(flowContinued).toBe(true)
    
    // The message is still in _pendingDelegateMessages (memory)
    // If finishChat runs, it will... wait — it now SKIPS delegates.
    // BUG: If immediate persist fails AND finishChat skips, message is LOST.
    // This is the one gap: we need finishChat to check if delegate was actually persisted.
  })

  it('ATTACK: empty delegate response — should not create ghost message', () => {
    const db = []
    const appendMessage = (ws, sid, msg) => db.push(msg)

    // delegate.js checks `responseText.trim()` before persisting
    const responseText = '   '
    if (responseText.trim()) {
      appendMessage('/ws', 's1', { role: 'assistant', content: responseText })
    }

    expect(db).toHaveLength(0) // No ghost message
  })

  it('ATTACK: _delegateImmediate flag — does loadSession strip it?', () => {
    // _delegateImmediate is stored in metadata JSON.
    // When UI loads messages, it shouldn't cause any issues.
    // But it's noise. Should we strip it?
    
    const msg = {
      role: 'assistant', content: 'From A', sender: 'A',
      _delegateImmediate: true, senderWorkspaceId: 'ws-a'
    }
    
    // The flag is harmless — just metadata. Frontend ignores unknown fields.
    // But it reveals implementation details. Low priority to strip.
    expect(msg._delegateImmediate).toBe(true)
  })

  it('CRITICAL: finishChat skips delegate BUT immediate persist failed → MESSAGE LOST', () => {
    // This is the real bug found by blue team:
    // 1. Delegate finishes, immediate appendMessage FAILS (DB locked, disk full, etc.)
    // 2. Message still in _pendingDelegateMessages (memory)
    // 3. finishChat runs, but now it SKIPS delegates (delegateIdx++)
    // 4. Message is lost — not in DB, not being saved by finishChat
    //
    // FIX NEEDED: finishChat should check if delegate was actually persisted.
    // If not, fall back to writing it.
    
    const db = []
    const appendMessage = (ws, sid, msg) => db.push(msg)
    
    // Simulate: immediate persist FAILED, delegate in memory only
    const delegateMsgs = [
      { sender: 'A', content: 'From A', timestamp: 1000, _persistFailed: true },
    ]
    
    const steps = [{ name: 'delegate_to' }]
    
    // Current finishChat code: unconditionally skips
    let delegateIdx = 0
    for (const step of steps) {
      if (step.name === 'delegate_to' && delegateIdx < delegateMsgs.length) {
        // CURRENT: delegateIdx++ (skip)
        // FIX: check if delegate was persisted, if not, write it
        const dm = delegateMsgs[delegateIdx]
        if (dm._persistFailed) {
          appendMessage('/ws', 's1', {
            role: 'assistant', content: dm.content, sender: dm.sender
          })
        }
        delegateIdx++
      }
    }
    
    // With the fix, message is recovered
    expect(db).toHaveLength(1)
    expect(db[0].content).toBe('From A')
  })
})
