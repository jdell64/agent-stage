import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { AgentHoldButton } from './AgentHoldButton';
import { useTerminalExitState } from './terminalPool';
import { useStore } from '@/store/store';
import { restartAgentPty } from '@/utils/restartAgent';
import { isComposingKey } from '@shared/imeGuard';

/**
 * Operator control for one agent (#7C.1-7C.3) — pause (deny tools at the next
 * boundary), graceful halt (clean stop), and mid-run steering (inject context
 * without typing into the TUI). All ride Claude Code's hook-return protocol; no
 * PTY keystrokes. A thin strip under the agent header.
 *
 * The labels used to be "CONTROL", "pause", "halt", "steer", which told you the
 * mechanism and nothing about the consequence. "Control" what, and what is the
 * difference between pausing and halting? Both stop something; only one is
 * recoverable in the same breath. So each button says what HAPPENS, and the
 * explanations are on a styled hover tip rather than a native `title` that
 * waits a second and then renders an unstyled OS bubble.
 *
 * The heading is gone: once the buttons read as sentences it was labelling the
 * obvious, and a row of three clear verbs needs no title above it.
 *
 * The 1:1 hold sits here too. It is a different KIND of control — the other two
 * restrain the AGENT, 1:1 restrains THE ORCHESTRATOR, and the agent keeps running and
 * answering you — so that distinction now lives in its tooltip rather than in
 * the layout.
 */
interface Snapshot {
  paused: boolean;
  halted: boolean;
  autoDeliveryPaused: boolean;
  gatedTools: string[];
  pendingSteers: number;
}

export function AgentControlStrip({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const agent = useStore((s) => s.agents.find((a) => a.id === agentId));
  const exitState = useTerminalExitState(agent?.ptyId);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [steer, setSteer] = useState('');
  const [note, setNote] = useState('');
  const [restarting, setRestarting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    window.cth.controlSnapshot(agentId).then((s) => { if (alive && s) setSnap(s); }).catch(() => { /* none */ });
    return () => { alive = false; };
  }, [agentId]);

  const flash = (m: string) => {
    setNote(m);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(''), 1800);
  };

  const togglePause = async () => {
    const s = snap?.paused ? await window.cth.controlResume(agentId) : await window.cth.controlPause(agentId, true);
    if (s) setSnap(s);
    flash(snap?.paused ? t('agentControl.flashResumed') : t('agentControl.flashPaused'));
  };
  const halt = async () => {
    const s = await window.cth.controlHalt(agentId);
    if (s) setSnap(s);
    flash(t('agentControl.flashHalt'));
  };
  const sendSteer = async () => {
    const t_ = steer.trim();
    if (!t_) return;
    const s = await window.cth.controlSteer(agentId, t_);
    if (s) setSnap(s);
    setSteer('');
    flash(t('agentControl.flashSteer'));
  };
  const restartAndContinue = async () => {
    if (!agent || restarting) return;
    setRestarting(true);
    const res = await restartAgentPty(agent, { resume: true, resumeOptional: true });
    setRestarting(false);
    if (!res.ok) {
      flash(res.error ?? t('commandCenter.restartFailed'));
      return;
    }
    flash(res.fellBackToFresh ? t('agentControl.flashRestartedFresh') : t('agentControl.flashRestarted'));
  };
  const promoteToBoss = async () => {
    if (promoting || !agent || agent.isOrchestrator || agent.isAssistant) return;
    setPromoting(true);
    try {
      const res = await window.cth.hivePromoteOrchestrator(agentId, { holdOutgoing: true, migrateInbox: true });
      if (!res.ok) {
        flash(res.error ?? 'Failed to promote');
        return;
      }
      useStore.getState().promoteOrchestratorInStore(agentId, {
        previousOrchestratorId: res.previousOrchestratorId ?? null,
        holdOutgoing: true,
        oldRoleRestored: res.oldRoleRestored
      });
      flash(t('agentControl.flashPromoted'));
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '6px 8px', background: 'var(--cth-paper-100)',
      borderBottom: '1px solid var(--cth-ink-300)', flexShrink: 0
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Neither of these kills anything, and the old two-word labels never
            said so — the difference is WHEN the agent stops and whether it keeps
            its session. Say the consequence on the button, the detail on hover. */}
        <PixelButton variant={snap?.paused ? 'primary' : 'secondary'} size="sm" onClick={togglePause}>
          <span
            className="cth-tip cth-tip-left cth-tip-wrap"
            data-tip={snap?.paused
              ? t('agentControl.allowToolsTip')
              : t('agentControl.blockToolsTip')}
            aria-label={snap?.paused ? t('agentControl.allowToolsAria') : t('agentControl.blockToolsAria')}
          >
            {snap?.paused ? t('agentControl.allowTools') : t('agentControl.blockTools')}
          </span>
        </PixelButton>
        <PixelButton variant="destructive" size="sm" onClick={halt}>
          <span
            className="cth-tip cth-tip-left cth-tip-wrap"
            data-tip={t('agentControl.stopAfterStepTip')}
            aria-label={t('agentControl.stopAfterStepAria')}
          >
            {t('agentControl.stopAfterStep')}
          </span>
        </PixelButton>
        {/* Sits with them at the founder's call. It is a different KIND of
            control — the two above restrain the agent, this one restrains
            the orchestrator — so the tooltip carries that distinction now that the
            grouping no longer does. */}
        <AgentHoldButton agentId={agentId} />
        {agent?.ptyId && (
          <PixelButton
            variant={exitState.exited ? 'primary' : 'secondary'}
            size="sm"
            disabled={restarting}
            onClick={restartAndContinue}
          >
            <span
              className="cth-tip cth-tip-left cth-tip-wrap"
              data-tip={t('commandCenter.restartContinueTitle', { name: agent.name })}
              aria-label={t('commandCenter.restartContinue')}
            >
              {restarting ? t('common.restarting') : `↺ ${t('commandCenter.restartContinue')}`}
            </span>
          </PixelButton>
        )}
        {agent && !agent.isOrchestrator && !agent.isAssistant && (
          <PixelButton variant="secondary" size="sm" onClick={() => { void promoteToBoss(); }} disabled={promoting}>
            <span
              className="cth-tip cth-tip-left cth-tip-wrap"
              data-tip={t('agentControl.promoteTip')}
              aria-label={t('agentControl.promoteAria')}
            >
              ★ {promoting ? t('agentControl.promoting') : t('agentControl.promote')}
            </span>
          </PixelButton>
        )}
        {/* v0.3.4: the auto-delivery switch moved to the orchestrator's Command Center
            header — ONE floor-wide control instead of a per-agent toggle. */}
        {snap?.autoDeliveryPaused && (
          <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('agentControl.deliveryPaused')}</span>
        )}
        {snap?.halted && <span style={{ fontSize: 11, color: 'var(--cth-coral)' }}>{t('agentControl.halting')}</span>}
        {!!snap?.pendingSteers && <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('agentControl.steersQueued', { count: snap.pendingSteers })}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="cth-input"
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter') sendSteer(); }}
          placeholder={t('agentControl.steerPlaceholder')}
          style={{
            flex: 1, padding: '4px 6px', background: 'var(--cth-paper-100)', border: 'none',
            fontFamily: 'var(--cth-font-ui)',
            fontSize: 12, color: 'var(--cth-ink-900)', outline: 'none'
          }}
        />
        <PixelButton variant="secondary" size="sm" onClick={sendSteer} disabled={!steer.trim()}>
          <span
            className="cth-tip cth-tip-wrap"
            data-tip={t('agentControl.steerTip')}
            aria-label={t('agentControl.steerAria')}
          >{t('agentControl.steer')}</span>
        </PixelButton>
      </div>
      {note && <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{note}</span>}
    </div>
  );
}
