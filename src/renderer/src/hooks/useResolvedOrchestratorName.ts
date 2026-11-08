import { useEffect, useState } from 'react';
import { resolveOrchestratorName, setThemeOrchestratorName, DEFAULT_ORCHESTRATOR_NAME } from '@shared/orchestratorIdentity';
import { useStore } from '@/store/store';

const ORCHESTRATOR_ID = 'orchestrator';

/**
 * Orchestrator's persisted display name, for the boot screens shown BEFORE the store
 * has orchestrator's live agent object (so before `agent.name` exists anywhere to
 * read), and live-updated when another agent is promoted to acting orchestrator.
 */
export function useResolvedOrchestratorName(): string {
  const liveOrchestratorName = useStore((s) => s.agents.find((a) => a.isOrchestrator)?.name);
  const [orchestratorName, setOrchestratorName] = useState(DEFAULT_ORCHESTRATOR_NAME);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.cth.hiveRegistry(),
      window.cth.themeOrchestratorName().catch(() => null)
    ]).then(([reg, themeName]) => {
      setThemeOrchestratorName(themeName);
      const activeId = reg?.orchestratorId ?? ORCHESTRATOR_ID;
      if (!cancelled) {
        setOrchestratorName(
          resolveOrchestratorName(reg?.agents?.[activeId]?.name ?? reg?.agents?.[ORCHESTRATOR_ID]?.name)
        );
      }
    }).catch(() => { /* keep the default while unknown */ });
    return () => { cancelled = true; };
  }, []);
  return liveOrchestratorName || orchestratorName;
}
