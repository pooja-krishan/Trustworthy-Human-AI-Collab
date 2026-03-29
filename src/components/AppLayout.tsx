import type { ReactNode } from 'react'

interface Props {
  header: ReactNode
  leftTop: ReactNode
  leftBottom: ReactNode
  center: ReactNode
  right: ReactNode
  footer: ReactNode
}

export function AppLayout({ header, leftTop, leftBottom, center, right, footer }: Props) {
  return (
    <div className="app-shell">
      <div className="app-shell__header">{header}</div>
      <div className="app-shell__main">
        <aside className="app-shell__left">
          <div className="app-shell__left-section app-shell__left-section--top">{leftTop}</div>
          <div className="app-shell__left-section app-shell__left-section--bottom">{leftBottom}</div>
        </aside>
        <main className="app-shell__center">{center}</main>
        <aside className="app-shell__right">{right}</aside>
      </div>
      <div className="app-shell__footer">{footer}</div>
    </div>
  )
}
