import { describe, it, expect } from 'vitest';
import {
  classifyTaskCategory,
  buildHiveAnalyticsReport,
  recommendAgentForTask
} from '../../src/shared/agentAnalytics';

describe('agentAnalytics — domain classification & objective scoring', () => {
  it('classifies task descriptions into the right domain categories', () => {
    expect(classifyTaskCategory('Build React component and CSS layout for CommandCenter modal')).toBe('frontend');
    expect(classifyTaskCategory('Wire ipcMain handler, preload bridge, and SQLite persistence in main')).toBe('backend');
    expect(classifyTaskCategory('Add vitest unit tests and playwright e2e regression assertions')).toBe('testing');
    expect(classifyTaskCategory('Fix race condition crash and wedged terminal recovery bug')).toBe('debugging');
    expect(classifyTaskCategory('Configure GitHub Actions CI workflow and electron-builder packaging script')).toBe('devops');
    expect(classifyTaskCategory('Update README documentation and architecture guide')).toBe('docs');
    expect(classifyTaskCategory('Miscellaneous follow-up item')).toBe('general');
  });

  it('scores agents objectively across completion, autonomy, cost efficiency, and stability', () => {
    const report = buildHiveAnalyticsReport({
      orchestratorId: 'boss-1',
      agents: {
        'boss-1': {
          id: 'boss-1',
          name: 'Michael',
          provider: 'claude',
          model: 'claude-opus-4-8',
          isOrchestrator: true
        },
        'ada-ui': {
          id: 'ada-ui',
          name: 'Ada',
          role: 'Frontend React & UI specialist',
          provider: 'claude',
          model: 'claude-sonnet-4-6'
        },
        'bob-buggy': {
          id: 'bob-buggy',
          name: 'Bob',
          role: 'General worker',
          provider: 'codex',
          model: 'gpt-5-codex'
        }
      },
      tasks: [
        {
          id: 't1',
          title: 'Add restart button to React component and CSS header',
          assignee: 'ada-ui',
          status: 'done',
          createdAt: '2026-11-08T10:00:00.000Z',
          startedAt: '2026-11-08T10:01:00.000Z',
          completedAt: '2026-11-08T10:06:00.000Z'
        },
        {
          id: 't2',
          title: 'Build dark mode theme toggle in sidebar UI',
          assignee: 'ada-ui',
          status: 'done',
          createdAt: '2026-11-08T10:10:00.000Z',
          startedAt: '2026-11-08T10:11:00.000Z',
          completedAt: '2026-11-08T10:15:00.000Z'
        },
        {
          id: 't3',
          title: 'Fix UI layout in settings modal',
          assignee: 'ada-ui',
          status: 'done',
          createdAt: '2026-11-08T10:20:00.000Z',
          startedAt: '2026-11-08T10:20:30.000Z',
          completedAt: '2026-11-08T10:24:30.000Z'
        },
        {
          id: 't4',
          title: 'Implement backend webhook retry',
          assignee: 'bob-buggy',
          status: 'blocked',
          humanQA: [{ q: 'Need API credentials' }]
        },
        {
          id: 't5',
          title: 'Update UI button color',
          assignee: 'bob-buggy',
          status: 'done'
        }
      ],
      logEvents: [
        { kind: 'message', from: 'ada-ui', to: 'boss-1', act: 'done', subject: 'Completed UI component', ts: 1000 },
        { kind: 'message', from: 'bob-buggy', to: 'boss-1', act: 'refuse', subject: 'Cannot run tests', ts: 2000 },
        { kind: 'agent-exit', agentId: 'bob-buggy', abnormal: true, exitCode: 1, ts: 2500 },
        { kind: 'breaker', agentId: 'bob-buggy', level: 'constrained', ts: 2600 }
      ],
      costRows: [
        // Ada: two cumulative ticks in session s1 ($0.15 -> $0.30 across 3 tasks = $0.10/task)
        {
          agentId: 'ada-ui',
          sessionId: 's1',
          input: 10_000,
          output: 2_000,
          cacheRead: 40_000,
          cacheCreation: 3_000,
          usd: 0.15
        },
        {
          agentId: 'ada-ui',
          sessionId: 's1',
          input: 20_000,
          output: 5_000,
          cacheRead: 90_000,
          cacheCreation: 5_000,
          usd: 0.30
        },
        // Bob: expensive session ($1.20 for only 1 done task)
        {
          agentId: 'bob-buggy',
          sessionId: 's2',
          input: 120_000,
          output: 30_000,
          cacheRead: 10_000,
          cacheCreation: 20_000,
          usd: 1.20
        }
      ],
      toolSpans: {
        'ada-ui': [
          { agentId: 'ada-ui', tool: 'Read', success: true, durationMs: 40 },
          { agentId: 'ada-ui', tool: 'Edit', success: true, durationMs: 80 }
        ],
        'bob-buggy': [
          { agentId: 'bob-buggy', tool: 'Bash', success: false, durationMs: 1200, error: 'exit 1' },
          { agentId: 'bob-buggy', tool: 'Bash', success: true, durationMs: 600 }
        ]
      }
    });

    const ada = report.agents.find((a) => a.agentId === 'ada-ui')!;
    const bob = report.agents.find((a) => a.agentId === 'bob-buggy')!;

    expect(ada).toBeDefined();
    expect(bob).toBeDefined();

    // Ada completed 3/3 tasks autonomously with 100% tool reliability and $0.10/task
    expect(ada.tasksDone).toBe(3);
    expect(ada.autonomyRate).toBe(1);
    expect(ada.lifetimeUsd).toBeCloseTo(0.30, 5);
    expect(ada.usdPerUnit).toBeCloseTo(0.10, 5);
    expect(ada.toolSuccessRate).toBe(1);
    expect(ada.compositeScore).toBeGreaterThan(bob.compositeScore);

    // Bob had 1 humanQA, 1 refuse, 1 abnormal exit, 1 breaker trip, and 50% tool success
    expect(bob.abnormalExits).toBe(1);
    expect(bob.breakerTrips).toBe(1);
    expect(bob.messagesRefused).toBe(1);
    expect(bob.autonomyRate).toBeLessThan(0.5);
    expect(bob.reliabilityScore).toBeLessThan(ada.reliabilityScore);

    // Frontend category leader must be Ada
    expect(report.categoryLeaders.frontend.leaderAgentId).toBe('ada-ui');
    expect(report.fleetSummary.topAgentId).toBe('ada-ui');

    // Smart dispatch recommendation for a frontend prompt picks Ada
    const rec = recommendAgentForTask('Add a new pixel button and style the React modal', report);
    expect(rec).not.toBeNull();
    expect(rec?.category).toBe('frontend');
    expect(rec?.agentId).toBe('ada-ui');
  });

  it('folds session cost resets without losing prior cumulative spend', () => {
    const report = buildHiveAnalyticsReport({
      agents: {
        'w-1': { id: 'w-1', name: 'Worker1', provider: 'claude', model: 'claude-sonnet-4-6' }
      },
      tasks: [{ id: 't1', title: 'Write unit tests', assignee: 'w-1', status: 'done' }],
      logEvents: [],
      costRows: [
        { agentId: 'w-1', sessionId: 's1', input: 1000, output: 500, cacheRead: 0, cacheCreation: 0, usd: 0.50 },
        // Counter reset within same session id (drops from 0.50 to 0.20)
        { agentId: 'w-1', sessionId: 's1', input: 400, output: 200, cacheRead: 0, cacheCreation: 0, usd: 0.20 }
      ]
    });

    const w1 = report.agents.find((a) => a.agentId === 'w-1')!;
    expect(w1.lifetimeUsd).toBeCloseTo(0.70, 5);
    expect(w1.workTokens).toBe(2100);
  });
});
