interface Props {
  participantId: string
  onBeginSession: () => void
}

export function WelcomeScreen({ participantId, onBeginSession }: Props) {
  return (
    <div className="screen screen--center screen--intro">
      <h1 className="screen__title">Human AI Interaction Study</h1>
      <p className="screen__text">
        You will complete <strong>two</strong> planning tasks. In each task, adhere to the scenario given and generate a schedule.
        The two tasks use different interaction styles. In one, the system’s internal assumptions and reasoning are visible and directly editable. 
        In the other, you will interact with the system using only natural language prompts. At the end of each task, you will be asked to answer a few questions about your experience.
      </p>
      <p className="screen__text">
         <strong> Please do not refresh the page or close the browser during the study.</strong> Thank you for your time to complete the study.
      </p>
      <p className="screen__text">
        The workspace keeps your instructions at the top and the calendar in the center. Depending on the scenario,
        side panels may expose more planning controls or stay hidden so revisions happen through prompt text only.
      </p>
      <p className="screen__text">
        <strong>All participant data is anonymous and used for research purposes only. We collect your interaction data (for example clicks, prompts, plan edits, and questionnaire responses) for post-hoc analysis. No audio or video recording is collected. By clicking the Begin Session button below, you consent to participate in the study.</strong>
      </p>
      <p className="screen__warn screen__warn--soft">
        Google Chrome is recommended to complete the study.
      </p>
      <p className="screen__mono">Participant ID (for logging): {participantId}</p>
      <button type="button" className="btn btn--accent" onClick={() => void onBeginSession()}>
        Begin session
      </button>
    </div>
  )
}
