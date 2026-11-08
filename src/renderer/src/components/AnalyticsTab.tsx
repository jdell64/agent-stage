import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { useStore } from '@/store/store';
import { providerPreset, type AgentProvider } from '@/store/config';
import {
  TASK_CATEGORIES,
  type AgentScorecard,
  type HiveAnalyticsReport,
  type ModelScorecard,
  type TaskCategory
} from '@shared/agentAnalytics';

type SortKey = 'score' | 'done' | 'autonomy' | 'efficiency' | 'reliability';

const DOMAIN_CATEGORIES: readonly TaskCategory[] = [
  'frontend',
  'backend',
  'testing',
  'debugging',
  'devops',
  'docs'
] as const;

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.01) return `<$0.01`;
  return `$${n.toFixed(2)}`;
}

function fmtDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = (min / 60).toFixed(1);
  return `${hr}h`;
}

function scoreColor(score: number): string {
  if (score >= 78) return 'var(--cth-mint)';
  if (score >= 58) return 'var(--cth-sky)';
  if (score >= 42) return 'var(--cth-lemon)';
  return 'var(--cth-coral)';
}

export function AnalyticsTab({
  onSelectForDispatch
}: {
  onSelectForDispatch?: (agentId: string, category: TaskCategory) => void;
}) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const selectAgent = useStore((s) => s.select);
  const [report, setReport] = useState<HiveAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [includeArchived, setIncludeArchived] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await window.cth.hiveAnalytics();
      setReport(res);
    } catch {
      /* best-effort */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      window.cth.hiveAnalytics().then(setReport).catch(() => { /* noop */ });
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !report) {
    return (
      <div style={{ flex: 1, padding: 14, color: 'var(--cth-ink-500)', fontSize: 12, background: 'var(--cth-paper-200)' }}>
        {t('analyticsTab.loading')}
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ flex: 1, padding: 14, color: 'var(--cth-ink-500)', fontSize: 12, background: 'var(--cth-paper-200)' }}>
        {t('analyticsTab.noData')}
      </div>
    );
  }

  const { fleetSummary, categoryLeaders, models } = report;
  const agentVisualById = new Map(agents.map((a) => [a.id, a]));

  const filteredAgents = report.agents
    .filter((a) => includeArchived || !a.archived)
    .filter((a) => {
      if (selectedCategory === 'all') return true;
      const perf = a.categories[selectedCategory];
      return perf && (perf.score > 0 || perf.completedUnits > 0 || perf.tasksAssigned > 0);
    })
    .slice()
    .sort((a, b) => {
      // When filtered by a specific domain, rank by that domain's score first if sorting by 'score'
      if (sortBy === 'score' && selectedCategory !== 'all') {
        const sa = a.categories[selectedCategory]?.score ?? 0;
        const sb = b.categories[selectedCategory]?.score ?? 0;
        if (sb !== sa) return sb - sa;
      }
      switch (sortBy) {
        case 'done':
          if (b.completedUnits !== a.completedUnits) return b.completedUnits - a.completedUnits;
          return b.compositeScore - a.compositeScore;
        case 'autonomy':
          if (b.autonomyScore !== a.autonomyScore) return b.autonomyScore - a.autonomyScore;
          return b.compositeScore - a.compositeScore;
        case 'efficiency':
          if (b.efficiencyScore !== a.efficiencyScore) return b.efficiencyScore - a.efficiencyScore;
          return b.compositeScore - a.compositeScore;
        case 'reliability':
          if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
          return b.compositeScore - a.compositeScore;
        case 'score':
        default:
          if (a.isOrchestrator !== b.isOrchestrator) return a.isOrchestrator ? 1 : -1;
          if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
          return b.completedUnits - a.completedUnits;
      }
    });

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 10, background: 'var(--cth-paper-200)' }}>
      {/* Fleet Summary Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '12px', color: 'var(--cth-ink-500)' }}>
            {t('analyticsTab.fleetOverview')}
          </span>
          <PixelButton variant="secondary" size="sm" onClick={() => void refresh()}>
            {t('analyticsTab.refresh')}
          </PixelButton>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 6
        }}>
          <SummaryCard
            label={t('analyticsTab.completedUnits')}
            value={String(fleetSummary.totalCompletedUnits)}
            sub={t('analyticsTab.tasksDoneSub', { done: fleetSummary.totalTasksDone, total: fleetSummary.totalTasksAssigned })}
          />
          <SummaryCard
            label={t('analyticsTab.autonomyRate')}
            value={`${Math.round(fleetSummary.fleetAutonomyRate * 100)}%`}
            sub={t('analyticsTab.firstPassSub')}
          />
          <SummaryCard
            label={t('analyticsTab.lifetimeSpend')}
            value={fmtUsd(fleetSummary.fleetLifetimeUsd)}
            sub={`${fmtTokens(fleetSummary.fleetTotalTokens)} tok (${Math.round(fleetSummary.fleetCacheHitRate * 100)}% cache)`}
          />
          <SummaryCard
            label={t('analyticsTab.topPerformer')}
            value={fleetSummary.topAgentName ?? '—'}
            sub={fleetSummary.topModelKey ?? ''}
          />
        </div>
      </div>

      {/* Category Strengths Matrix ("Who is objectively best at what?") */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '12px', color: 'var(--cth-ink-500)', marginBottom: 4 }}>
          {t('analyticsTab.strengthsMatrixTitle')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', marginBottom: 6 }}>
          {t('analyticsTab.strengthsMatrixDesc')}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: 6
        }}>
          {DOMAIN_CATEGORIES.map((cat) => {
            const leader = categoryLeaders[cat];
            const hasLeader = !!leader?.leaderAgentId;
            return (
              <div
                key={cat}
                style={{
                  padding: 7,
                  background: selectedCategory === cat ? 'var(--cth-cream-100)' : 'var(--cth-paper-100)',
                  boxShadow: selectedCategory === cat
                    ? 'inset 0 0 0 2px var(--cth-ink-900)'
                    : 'inset 0 0 0 1px var(--cth-ink-300)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{
                    fontFamily: 'var(--cth-font-display)',
                    fontSize: 8,
                    padding: '1px 5px',
                    background: 'var(--cth-cream-200)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                    color: 'var(--cth-ink-900)'
                  }}>
                    {t(`analyticsTab.categories.${cat}`).toUpperCase()}
                  </span>
                  {hasLeader && (
                    <span style={{
                      fontFamily: 'var(--cth-font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--cth-ink-900)'
                    }}>
                      {leader.leaderScore}/100
                    </span>
                  )}
                </div>

                {hasLeader ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--cth-ink-900)' }}>
                        ★ {leader.leaderName}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-mono)' }}>
                        {leader.leaderProvider} · {leader.leaderModel}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cth-ink-700)', lineHeight: '14px' }}>
                      {leader.rationale}
                    </div>
                    {leader.runnerUpName && (
                      <div style={{ fontSize: 10, color: 'var(--cth-ink-500)' }}>
                        {t('analyticsTab.runnerUp', { name: leader.runnerUpName, score: leader.runnerUpScore ?? 0 })}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 'auto', paddingTop: 3 }}>
                      <button
                        onClick={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
                        style={miniBtnStyle}
                      >
                        {selectedCategory === cat ? t('analyticsTab.showAll') : t('analyticsTab.filterDomain')}
                      </button>
                      {onSelectForDispatch && leader.leaderAgentId && (
                        <button
                          onClick={() => onSelectForDispatch(leader.leaderAgentId!, cat)}
                          style={{ ...miniBtnStyle, background: 'var(--cth-mint)', color: 'var(--cth-ink-900)' }}
                        >
                          {t('analyticsTab.assignTo', { name: leader.leaderName })}
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', padding: '4px 0' }}>
                    {t('analyticsTab.noCategoryLeader')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Leaderboard */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '12px', color: 'var(--cth-ink-500)' }}>
            {t('analyticsTab.agentLeaderboard')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as TaskCategory | 'all')}
              style={selectStyle}
            >
              <option value="all">{t('analyticsTab.allDomains')}</option>
              {TASK_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{t(`analyticsTab.categories.${cat}`)}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              style={selectStyle}
            >
              <option value="score">{t('analyticsTab.sortByScore')}</option>
              <option value="done">{t('analyticsTab.sortByDone')}</option>
              <option value="autonomy">{t('analyticsTab.sortByAutonomy')}</option>
              <option value="efficiency">{t('analyticsTab.sortByEfficiency')}</option>
              <option value="reliability">{t('analyticsTab.sortByReliability')}</option>
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--cth-ink-700)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              {t('analyticsTab.includeArchived')}
            </label>
          </div>
        </div>

        {filteredAgents.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--cth-ink-500)', padding: 8, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)' }}>
            {t('analyticsTab.noMatchingAgents')}
          </div>
        ) : (
          filteredAgents.map((sc, idx) => (
            <AgentScorecardRow
              key={sc.agentId}
              rank={idx + 1}
              scorecard={sc}
              selectedCategory={selectedCategory}
              visual={agentVisualById.get(sc.agentId)}
              onSelect={() => selectAgent(sc.agentId)}
              onDispatch={
                onSelectForDispatch && !sc.isOrchestrator && !sc.archived
                  ? () => onSelectForDispatch(sc.agentId, selectedCategory === 'all' ? (sc.topCategories[0] ?? 'general') : selectedCategory)
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* Engine & Model Comparison */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '12px', color: 'var(--cth-ink-500)', marginBottom: 4 }}>
          {t('analyticsTab.modelComparisonTitle')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', marginBottom: 6 }}>
          {t('analyticsTab.modelComparisonDesc')}
        </div>
        {models.map((m) => (
          <ModelScorecardRow key={m.key} model={m} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      padding: '6px 8px',
      background: 'var(--cth-paper-100)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }}>
      <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-500)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--cth-ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--cth-ink-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sub}
      </span>
    </div>
  );
}

function AgentScorecardRow({
  rank,
  scorecard: sc,
  selectedCategory,
  visual,
  onSelect,
  onDispatch
}: {
  rank: number;
  scorecard: AgentScorecard;
  selectedCategory: TaskCategory | 'all';
  visual?: { character: string; accent: string };
  onSelect: () => void;
  onDispatch?: () => void;
}) {
  const { t } = useTranslation();
  const displayScore = selectedCategory !== 'all' && sc.categories[selectedCategory]?.score > 0
    ? sc.categories[selectedCategory].score
    : sc.compositeScore;
  const barColor = scoreColor(displayScore);
  const presetLabel = (() => {
    try {
      return providerPreset(sc.provider as AgentProvider).label;
    } catch {
      return sc.provider;
    }
  })();

  return (
    <div style={{
      padding: 8,
      marginBottom: 6,
      background: 'var(--cth-paper-100)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
      opacity: sc.archived ? 0.72 : 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--cth-font-mono)',
          fontSize: 11,
          fontWeight: 700,
          padding: '1px 5px',
          background: rank === 1 && !sc.isOrchestrator ? 'var(--cth-lemon)' : 'var(--cth-cream-200)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
          color: 'var(--cth-ink-900)'
        }}>
          #{rank}
        </span>
        {visual && (
          <div style={{
            width: 22,
            height: 22,
            background: `var(--cth-${visual.accent}-light)`,
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            <SpritePortrait character={visual.character} scale={1} />
          </div>
        )}
        <button
          onClick={onSelect}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'var(--cth-font-ui)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--cth-ink-900)'
          }}
        >
          {sc.name}
          {sc.isOrchestrator ? t('commandCenter.orchestratorTag') : ''}
          {sc.archived ? ` (${t('analyticsTab.archivedTag')})` : ''}
        </button>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--cth-font-mono)',
          padding: '1px 5px',
          background: 'var(--cth-cream-200)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
          color: 'var(--cth-ink-700)'
        }}>
          {presetLabel} · {sc.model}
        </span>

        {/* Composite / Category Score Bar */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-mono)' }}>
            {t(`analyticsTab.confidence.${sc.confidence}`)}
          </span>
          <div style={{
            width: 72,
            height: 8,
            background: 'var(--cth-cream-200)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
          }}>
            <div style={{ width: `${displayScore}%`, height: '100%', background: barColor }} />
          </div>
          <span style={{
            fontFamily: 'var(--cth-font-mono)',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--cth-ink-900)',
            minWidth: 32,
            textAlign: 'right'
          }}>
            {displayScore}
          </span>
        </div>
      </div>

      {/* Role + Top Strength Badges */}
      {(sc.role || sc.topCategories.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {sc.topCategories.map((cat) => (
            <span
              key={cat}
              style={{
                fontSize: 10,
                lineHeight: '14px',
                padding: '0 5px',
                background: 'var(--cth-mint)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                color: 'var(--cth-ink-900)',
                fontFamily: 'var(--cth-font-mono)'
              }}
            >
              ★ {t(`analyticsTab.categories.${cat}`)} ({sc.categories[cat].score})
            </span>
          ))}
          {sc.role && (
            <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sc.role}
            </span>
          )}
        </div>
      )}

      {/* 5 Objective Dimension Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
        gap: 4,
        padding: '4px 6px',
        background: 'var(--cth-cream-100)',
        boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
        fontFamily: 'var(--cth-font-mono)',
        fontSize: 11,
        color: 'var(--cth-ink-900)'
      }}>
        <div title={t('analyticsTab.completionTip')}>
          <span style={{ color: 'var(--cth-ink-500)' }}>{t('analyticsTab.doneLabel')}: </span>
          <strong>{sc.completedUnits}</strong>
          <span style={{ color: 'var(--cth-ink-500)', fontSize: 10 }}>
            {' '}({sc.tasksDone}/{sc.tasksAssigned} cards)
          </span>
        </div>
        <div title={t('analyticsTab.autonomyTip')}>
          <span style={{ color: 'var(--cth-ink-500)' }}>{t('analyticsTab.autonomyLabel')}: </span>
          <strong>{Math.round(sc.autonomyRate * 100)}%</strong>
          {sc.humanEscalations > 0 && (
            <span style={{ color: 'var(--cth-ink-500)', fontSize: 10 }}> ({sc.humanEscalations} QA)</span>
          )}
        </div>
        <div title={t('analyticsTab.costTip')}>
          <span style={{ color: 'var(--cth-ink-500)' }}>{t('analyticsTab.costPerUnitLabel')}: </span>
          <strong>{fmtUsd(sc.usdPerUnit)}</strong>
          <span style={{ color: 'var(--cth-ink-500)', fontSize: 10 }}>
            {' '}({sc.workTokensPerUnit ? fmtTokens(sc.workTokensPerUnit) : '0'} tok)
          </span>
        </div>
        <div title={t('analyticsTab.toolTip')}>
          <span style={{ color: 'var(--cth-ink-500)' }}>{t('analyticsTab.toolsLabel')}: </span>
          <strong>
            {sc.toolSuccessRate !== null ? `${Math.round(sc.toolSuccessRate * 100)}%` : '—'}
          </strong>
          <span style={{ color: 'var(--cth-ink-500)', fontSize: 10 }}>
            {' '}({sc.toolCalls} calls)
          </span>
        </div>
        <div title={t('analyticsTab.speedStabilityTip')}>
          <span style={{ color: 'var(--cth-ink-500)' }}>{t('analyticsTab.cycleLabel')}: </span>
          <strong>{fmtDuration(sc.avgDurationMs)}</strong>
          {(sc.abnormalExits > 0 || sc.breakerTrips > 0) && (
            <span style={{ color: 'var(--cth-coral)', fontSize: 10 }}>
              {' '}· {sc.abnormalExits} crash / {sc.breakerTrips} brk
            </span>
          )}
        </div>
      </div>

      {onDispatch && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onDispatch}
            style={{ ...miniBtnStyle, background: 'var(--cth-cream-200)' }}
          >
            {t('analyticsTab.suggestInDispatch', { name: sc.name })}
          </button>
        </div>
      )}
    </div>
  );
}

function ModelScorecardRow({ model: m }: { model: ModelScorecard }) {
  const { t } = useTranslation();
  const barColor = scoreColor(m.compositeScore);
  return (
    <div style={{
      padding: '6px 8px',
      marginBottom: 5,
      background: 'var(--cth-paper-100)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--cth-ink-900)' }}>
          {m.provider} · {m.model}
        </span>
        <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
          {t('analyticsTab.agentCount', { count: m.agentCount })}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 64, height: 7, background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)' }}>
            <div style={{ width: `${m.compositeScore}%`, height: '100%', background: barColor }} />
          </div>
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--cth-ink-900)' }}>
            {m.compositeScore}
          </span>
        </div>
      </div>
      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        fontFamily: 'var(--cth-font-mono)',
        fontSize: 11,
        color: 'var(--cth-ink-700)'
      }}>
        <span>{t('analyticsTab.doneLabel')}: <strong>{m.completedUnits}</strong></span>
        <span>{t('analyticsTab.autonomyLabel')}: <strong>{Math.round(m.autonomyRate * 100)}%</strong></span>
        <span>{t('analyticsTab.costPerUnitLabel')}: <strong>{fmtUsd(m.usdPerUnit)}</strong></span>
        <span>{t('analyticsTab.totalSpendLabel')}: <strong>{fmtUsd(m.lifetimeUsd)}</strong></span>
        <span>Cache: <strong>{Math.round(m.cacheHitRate * 100)}%</strong></span>
        {m.toolSuccessRate !== null && (
          <span>{t('analyticsTab.toolsLabel')}: <strong>{Math.round(m.toolSuccessRate * 100)}%</strong></span>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '2px 6px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 11,
  color: 'var(--cth-ink-900)',
  cursor: 'pointer'
};

const miniBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  border: 'none',
  cursor: 'pointer',
  background: 'var(--cth-paper-200)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 11,
  color: 'var(--cth-ink-900)'
};
