import React from 'react';
import { CheckCircle2 } from 'lucide-react';

/**
 * Reusable progress bar for scraper pages.
 *
 * Props:
 *  - pct      : number 0-100
 *  - done     : boolean (SUCCESS)
 *  - failed   : boolean (FAILURE / REVOKED)
 *  - steps    : [{ key, label, description, minPct }]
 *  - phaseDesc: optional override for the description line
 */
const ScraperProgressBar = ({ pct, done, failed, steps, phaseDesc }) => {
  const safeP = Math.min(Math.max(pct || 0, 0), 100);

  // Colour based on percentage / state
  const barColor = (() => {
    if (failed) return '#ef4444';
    if (done)   return 'var(--c-brand)';
    if (safeP < 35)  return '#ef4444';
    if (safeP <= 75) return '#f97316';
    return '#22c55e';
  })();

  // Which step is active?
  const stepIdx = done
    ? steps.length - 1
    : failed
      ? Math.max(0, steps.reduce((acc, s, i) => (safeP >= s.minPct ? i : acc), 0))
      : steps.reduce((acc, s, i) => (safeP >= s.minPct ? i : acc), 0);

  const activeStep = steps[stepIdx] || steps[0];
  const description = phaseDesc || (done ? '¡Extracción completada!' : failed ? 'Proceso interrumpido' : (activeStep?.description || activeStep?.label + '...'));

  return (
    <div style={{ width: '100%' }}>

      {/* ── Step strip ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        marginBottom: 18, gap: 0,
      }}>
        {steps.map((step, i) => {
          const isDone   = i < stepIdx;
          const isActive = i === stepIdx;
          const circleColor = isDone
            ? '#22c55e'
            : isActive
              ? (failed ? '#ef4444' : barColor)
              : 'var(--c-border)';
          const textColor = isDone
            ? '#22c55e'
            : isActive
              ? 'var(--c-text)'
              : 'var(--c-text-tertiary)';

          return (
            <React.Fragment key={step.key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                {/* Circle */}
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: circleColor,
                  color: 'white', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.35s ease',
                  boxShadow: isActive && !failed ? `0 0 0 4px ${circleColor}28` : 'none',
                }}>
                  {isDone ? <CheckCircle2 size={15} /> : i + 1}
                </div>
                {/* Label */}
                <span style={{
                  fontSize: 10, textAlign: 'center', maxWidth: 68,
                  lineHeight: 1.35, color: textColor,
                  fontWeight: isActive ? 700 : 400,
                  transition: 'color 0.3s',
                }}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div style={{
                  flex: 1, height: 2, marginTop: 14, marginLeft: 4, marginRight: 4,
                  background: isDone ? '#22c55e' : 'var(--c-border)',
                  transition: 'background 0.4s ease',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Progress track ───────────────────────────────────────── */}
      <div style={{
        height: 12, borderRadius: 6, background: 'var(--c-bg)',
        border: '1px solid var(--c-border)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${safeP}%`, height: '100%',
          borderRadius: 6,
          background: barColor,
          transition: 'width 0.65s ease, background 0.3s ease',
        }} />
      </div>

      {/* ── Percentage + label row ───────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 8, fontSize: 12,
      }}>
        <span style={{
          color: failed ? '#ef4444' : done ? '#22c55e' : 'var(--c-text-secondary)',
        }}>
          {failed ? '⚠\u00a0' : done ? '✅\u00a0' : '⏳\u00a0'}
          {description}
        </span>
        <span style={{
          fontWeight: 700, fontSize: 15,
          color: failed ? '#ef4444' : barColor,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {Math.round(safeP)}%
        </span>
      </div>
    </div>
  );
};

export default ScraperProgressBar;
