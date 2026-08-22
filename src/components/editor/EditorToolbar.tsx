import { cn } from '../ui/cn'

interface EditorToolbarProps {
  wordCount: number
  onNew: () => void
  onBold: () => void
  onPause: () => void
}

const ghost =
  'text-xs font-medium tracking-wide uppercase text-fg-muted transition-colors hover:text-fg ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded'

export function EditorToolbar({ wordCount, onNew, onBold, onPause }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-5">
      <button className={ghost} onClick={onNew}>
        New
      </button>
      <span className="text-xs tracking-wide text-fg-muted tabular-nums" aria-live="polite">
        {wordCount} {wordCount === 1 ? 'word' : 'words'}
      </span>
      <button
        className={cn(ghost, 'font-bold text-fg')}
        onClick={onBold}
        aria-label="Bold selection"
        title="Bold (⌘B)"
      >
        B
      </button>
      <button className={ghost} onClick={onPause} title="Insert pause">
        Pause
      </button>
    </div>
  )
}
