import { useEffect, useRef } from 'react'

type InputViewportSnapshot = {
  height: number
  offsetLeft: number
  offsetTop: number
  scale: number
  scrollX: number
  scrollY: number
}

type Props = {
  active: boolean
  stage: 'setup' | 'deploying' | 'drawing'
  maxNumberInput: string
  excludedInput: string
  remaining: number
  canClearResolved: boolean
  clearingResolved: boolean
  onMaxNumberInputChange: (value: string) => void
  onMaxNumberCommit: () => void
  onExcludedInputChange: (value: string) => void
  onClearResolved: () => void
  onStart: () => void
  onReset: () => void
  onBackToMenu: () => void
  onExit: () => void
}

export default function SummonControls({
  active,
  stage,
  maxNumberInput,
  excludedInput,
  remaining,
  canClearResolved,
  clearingResolved,
  onMaxNumberInputChange,
  onMaxNumberCommit,
  onExcludedInputChange,
  onClearResolved,
  onStart,
  onReset,
  onBackToMenu,
  onExit,
}: Props) {
  const panelRef = useRef<HTMLElement | null>(null)
  const inputViewportSnapshotRef = useRef<InputViewportSnapshot | null>(null)
  const cancelViewportRestoreRef = useRef<() => void>(() => {})
  const scheduleViewportRestoreRef = useRef<() => void>(() => {})

  useEffect(() => {
    const panel = panelRef.current
    const viewport = window.visualViewport
    if (!panel || !viewport) return

    let restoreFrame: number | undefined
    let restoreTimer: number | undefined
    let restoreStartedAt = 0
    let restoreRequested = false

    const panelInputFocused = () => {
      const activeElement = document.activeElement
      return activeElement instanceof HTMLInputElement && panel.contains(activeElement)
    }

    const cancelViewportRestore = () => {
      restoreRequested = false
      if (restoreFrame !== undefined) {
        window.cancelAnimationFrame(restoreFrame)
        restoreFrame = undefined
      }
      if (restoreTimer !== undefined) {
        window.clearTimeout(restoreTimer)
        restoreTimer = undefined
      }
    }

    const restoreWhenSettled = () => {
      restoreTimer = undefined
      const snapshot = inputViewportSnapshotRef.current
      if (!snapshot || panelInputFocused()) {
        restoreRequested = false
        return
      }

      const elapsed = performance.now() - restoreStartedAt
      const viewportSettled = viewport.height >= snapshot.height - 2
        && Math.abs(viewport.offsetTop) < 1
        && Math.abs(viewport.offsetLeft) < 1

      if (!viewportSettled && elapsed < 360) {
        restoreTimer = window.setTimeout(restoreWhenSettled, 48)
        return
      }

      panel.style.setProperty('--summon-keyboard-offset', '0px')
      if (Math.abs(window.scrollX - snapshot.scrollX) > 1 || Math.abs(window.scrollY - snapshot.scrollY) > 1) {
        window.scrollTo(snapshot.scrollX, snapshot.scrollY)
      }
      inputViewportSnapshotRef.current = null
      restoreRequested = false
    }

    const scheduleViewportRestore = () => {
      cancelViewportRestore()
      restoreRequested = true
      restoreFrame = window.requestAnimationFrame(() => {
        restoreFrame = undefined
        if (panelInputFocused()) return
        restoreStartedAt = performance.now()
        restoreWhenSettled()
      })
    }

    const syncKeyboardOffset = () => {
      const keyboardOffset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      panel.style.setProperty('--summon-keyboard-offset', `${Math.round(keyboardOffset)}px`)
      if (restoreRequested && !panelInputFocused() && restoreTimer === undefined) {
        restoreWhenSettled()
      }
    }

    cancelViewportRestoreRef.current = cancelViewportRestore
    scheduleViewportRestoreRef.current = scheduleViewportRestore
    syncKeyboardOffset()
    viewport.addEventListener('resize', syncKeyboardOffset)
    viewport.addEventListener('scroll', syncKeyboardOffset)
    return () => {
      cancelViewportRestore()
      cancelViewportRestoreRef.current = () => {}
      scheduleViewportRestoreRef.current = () => {}
      viewport.removeEventListener('resize', syncKeyboardOffset)
      viewport.removeEventListener('scroll', syncKeyboardOffset)
      panel.style.removeProperty('--summon-keyboard-offset')
    }
  }, [active])

  const handleInputFocus = () => {
    cancelViewportRestoreRef.current()
    if (inputViewportSnapshotRef.current) return

    const viewport = window.visualViewport
    if (!viewport) return

    inputViewportSnapshotRef.current = {
      height: viewport.height,
      offsetLeft: viewport.offsetLeft,
      offsetTop: viewport.offsetTop,
      scale: viewport.scale,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }
  }

  const handleInputBlur = () => {
    scheduleViewportRestoreRef.current()
  }

  if (!active) return null

  return (
    <section ref={panelRef} className={`summon-panel summon-panel-${stage}`} data-gesture-block-3d="true" aria-label="召喚工具">
      {stage === 'setup' ? (
        <>
          <div className="summon-setup-row summon-setup-primary">
            <strong>召喚</strong>
            <label className="summon-range-field">
              範圍
              <span>
                1 ～
                <input
                  className="summon-range-input"
                  type="number"
                  min="1"
                  max="99"
                  value={maxNumberInput}
                  onFocus={handleInputFocus}
                  onBlur={() => {
                    onMaxNumberCommit()
                    handleInputBlur()
                  }}
                  onChange={(event) => onMaxNumberInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                />
              </span>
            </label>
          </div>
          <div className="summon-setup-row summon-setup-secondary">
            <label className="summon-exclude-field">
              排除
              <input
                className="summon-exclude-input"
                value={excludedInput}
                placeholder="3,7,12 或 3-8"
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onChange={(event) => onExcludedInputChange(event.target.value)}
              />
            </label>
            <button type="button" data-gesture-clickable="true" onClick={onStart}>開始</button>
            <button type="button" data-gesture-clickable="true" onClick={onExit}>返回星海</button>
          </div>
        </>
      ) : stage === 'deploying' ? (
        <>
          <strong>召喚</strong>
          <span>展開中</span>
          <button type="button" data-gesture-clickable="true" onClick={onBackToMenu}>退場</button>
          <button type="button" data-gesture-clickable="true" onClick={onExit}>返回星海</button>
        </>
      ) : (
        <>
          <div className="summon-panel-status">
            <strong>召喚</strong>
            <span>剩餘：{remaining}</span>
          </div>
          <div className="summon-panel-actions">
            <button type="button" data-gesture-clickable="true" disabled={!canClearResolved || clearingResolved} onClick={onClearResolved}>清場</button>
            <button type="button" data-gesture-clickable="true" onClick={onReset}>重置</button>
            <button type="button" data-gesture-clickable="true" onClick={onBackToMenu}>退場</button>
            <button type="button" data-gesture-clickable="true" onClick={onExit}>返回星海</button>
          </div>
        </>
      )}
    </section>
  )
}
