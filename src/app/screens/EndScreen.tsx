// セッションの終わり。§8.5: 本人が望めば「どうだった？」を3択＋「こたえない」で記録できる（初期OFF）

import { useState } from 'react';
import type { Session } from '../../core/types';

export function EndScreen({ askSelfReport, onReport, onAgain }: { askSelfReport: boolean; onReport: (r: NonNullable<Session['childSelfReport']>) => void; onAgain: () => void }) {
  const [answered, setAnswered] = useState(!askSelfReport);
  if (!answered)
    return (
      <div className="screen center">
        <h2>きょうは どうだった？</h2>
        <div className="report-row">
          {(
            [
              ['good', '😊', 'よかった'],
              ['so_so', '🙂', 'ふつう'],
              ['tough', '😮‍💨', 'たいへんだった'],
            ] as const
          ).map(([k, icon, label]) => (
            <button
              key={k}
              type="button"
              className="tile small"
              onClick={() => {
                onReport(k);
                setAnswered(true);
              }}
            >
              <span className="report-icon" aria-hidden>
                {icon}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-soft"
          onClick={() => {
            onReport('no_answer');
            setAnswered(true);
          }}
        >
          こたえない
        </button>
      </div>
    );
  return (
    <div className="screen center">
      <h2>またね</h2>
      <button type="button" className="btn-soft" onClick={onAgain}>
        はじめに もどる
      </button>
    </div>
  );
}
