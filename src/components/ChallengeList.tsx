import { challengeRatio, type Challenge } from "@/lib/challenges";

/**
 * A league's challenges for one player, drawn the way pathofexile.com's own
 * Challenges tab draws them: one crimson bar per challenge with its name, its
 * count and a tick or a cross, opening to the progress bar, the description
 * and the sub-items with a tick beside each one done. The order is the site's.
 * Styles are `.challenge-row*` in globals.css.
 */
export function ChallengeList({ challenges, completed, total }: { challenges: Challenge[]; completed: number | null; total: number | null }) {
  if (!challenges.length) return null;
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Challenges</h2>
        <span className="text-xs text-muted">
          {completed ?? challenges.filter((c) => c.completed).length} of {total ?? challenges.length} completed · as recorded on
          pathofexile.com
        </span>
      </div>
      <ol className="space-y-1.5 p-3">
        {challenges.map((challenge) => {
          const ratio = challengeRatio(challenge);
          return (
            <li key={challenge.position}>
              <details className="challenge-row group">
                <summary className="challenge-row-bar">
                  <span className="challenge-row-icon" aria-hidden />
                  <span className="challenge-row-name">{challenge.name}</span>
                  {challenge.progress ? (
                    <span className={`challenge-row-count ${challenge.completed ? "" : "challenge-row-count-short"}`}>
                      {challenge.progress}
                    </span>
                  ) : null}
                  <span
                    className={challenge.completed ? "challenge-row-tick" : "challenge-row-cross"}
                    aria-label={challenge.completed ? "completed" : "not completed"}
                  >
                    {challenge.completed ? "✓" : "✕"}
                  </span>
                </summary>
                <div className="challenge-row-body">
                  <div className="challenge-row-track">
                    <div className="challenge-row-fill" style={{ width: `${ratio * 100}%` }} />
                  </div>
                  {challenge.description ? <p className="challenge-row-description">{challenge.description}</p> : null}
                  {challenge.subtasks.length ? (
                    <ul className="challenge-row-subtasks">
                      {challenge.subtasks.map((subtask, index) => (
                        <li key={index} className={subtask.completed ? "challenge-row-subtask-done" : undefined}>
                          {subtask.text}
                          {subtask.completed ? <span aria-label="done"> ✓</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
