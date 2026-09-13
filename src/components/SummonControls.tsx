import type { SummonStar } from '../summon/summonUtils'

type Props = {
  active: boolean
  stage: 'setup' | 'deploying' | 'drawing'
  maxNumberInput: string
  excludedInput: string
  remaining: number
  result?: number
  armedStar?: SummonStar
  selectedStar?: SummonStar
  onMaxNumberInputChange: (value: string) => void
  onMaxNumberCommit: () => void
  onExcludedInputChange: (value: string) => void
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
  result,
  armedStar,
  selectedStar,
  onMaxNumberInputChange,
  onMaxNumberCommit,
  onExcludedInputChange,
  onStart,
  onReset,
  onBackToMenu,
  onExit,
}: Props) {
  if (!active) return null

  return (
    <section className="summon-panel" data-gesture-block-3d="true" aria-label="召喚工具">
      {stage === 'setup' ? (
        <>
          <strong>召喚</strong>
          <label>
            範圍
            <span>
              1 ～
              <input
                type="number"
                min="1"
                max="99"
                value={maxNumberInput}
                onBlur={onMaxNumberCommit}
                onChange={(event) => onMaxNumberInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                    onMaxNumberCommit()
                  }
                }}
              />
            </span>
          </label>
          <label>
            排除
            <input
              value={excludedInput}
              placeholder="3,7,12 或 3-8"
              onChange={(event) => onExcludedInputChange(event.target.value)}
            />
          </label>
          <button type="button" data-gesture-clickable="true" onClick={onStart}>開始</button>
          <button type="button" data-gesture-clickable="true" onClick={onExit}>返回星海</button>
        </>
      ) : stage === 'deploying' ? (
        <>
          <strong>召喚</strong>
          <span>展開中</span>
          <button type="button" data-gesture-clickable="true" onClick={onBackToMenu}>返回選單</button>
          <button type="button" data-gesture-clickable="true" onClick={onExit}>返回星海</button>
        </>
      ) : (
        <>
          <strong>召喚</strong>
          <span>剩餘：{remaining}</span>
          {armedStar ? <span>已啟動</span> : selectedStar ? <span>已選取</span> : null}
          {result ? <b className="summon-result-chip">{result}</b> : null}
          <button type="button" data-gesture-clickable="true" onClick={onReset}>重置</button>
          <button type="button" data-gesture-clickable="true" onClick={onBackToMenu}>返回選單</button>
          <button type="button" data-gesture-clickable="true" onClick={onExit}>返回星海</button>
        </>
      )}
    </section>
  )
}
