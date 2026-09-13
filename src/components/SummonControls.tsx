import type { SummonStar } from '../summon/summonUtils'

type Props = {
  active: boolean
  stage: 'setup' | 'drawing'
  maxNumber: number
  excludedInput: string
  remaining: number
  result?: number
  armedStar?: SummonStar
  selectedStar?: SummonStar
  onMaxNumberChange: (value: number) => void
  onExcludedInputChange: (value: string) => void
  onStart: () => void
  onReset: () => void
  onExit: () => void
}

export default function SummonControls({
  active,
  stage,
  maxNumber,
  excludedInput,
  remaining,
  result,
  armedStar,
  selectedStar,
  onMaxNumberChange,
  onExcludedInputChange,
  onStart,
  onReset,
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
                value={maxNumber}
                onChange={(event) => onMaxNumberChange(Number(event.target.value))}
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
      ) : (
        <>
          <strong>召喚</strong>
          <span>剩餘：{remaining}</span>
          {armedStar ? <span>已啟動</span> : selectedStar ? <span>已選取</span> : null}
          {result ? <b className="summon-result-chip">{result}</b> : null}
          <button type="button" data-gesture-clickable="true" onClick={onReset}>重置</button>
          <button type="button" data-gesture-clickable="true" onClick={onExit}>返回星海</button>
        </>
      )}
    </section>
  )
}
