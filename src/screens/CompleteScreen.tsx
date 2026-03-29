interface Props {
  participantId: string
  uploading: boolean
  uploadError: string | null
  saved: boolean
  onFinish: () => void
}

export function CompleteScreen({
  participantId,
  uploading,
  uploadError,
  saved,
  onFinish,
}: Props) {
  if (saved) {
    return (
      <div className="screen screen--center">
        <h1 className="screen__title">Saved</h1>
        <p className="screen__text">Your session was stored for the research team. You can close this tab.</p>
        <p className="screen__mono">{participantId}</p>
      </div>
    )
  }
  return (
    <div className="screen screen--wide">
      <h1 className="screen__title">Session complete</h1>
      <p className="screen__text">
        Thank you. When you continue, your session data (including logs and screen recording, if captured) will be saved
        for analysis. Participant ID: <span className="screen__mono">{participantId}</span>
      </p>
      {uploadError && <p className="screen__error">{uploadError}</p>}
      <button type="button" className="btn btn--accent" onClick={onFinish} disabled={uploading || saved}>
        {uploading ? 'Saving…' : 'Save session & exit'}
      </button>
    </div>
  )
}
