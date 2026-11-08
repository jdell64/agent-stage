import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '../../src/renderer/src/store/store';

const mockUpdateAgent = vi.fn();
const mockAddAgent = vi.fn();
const mockDisposeTerminal = vi.fn();
const mockResetTerminal = vi.fn();
const mockAcquireTerminal = vi.fn(() => ({
  term: { cols: 120, rows: 40 },
  fit: { fit: vi.fn() },
}));

vi.mock('@/components/terminalPool', () => ({
  acquireTerminal: (...args: unknown[]) => mockAcquireTerminal(...args),
  disposeTerminal: (...args: unknown[]) => mockDisposeTerminal(...args),
  resetTerminal: (...args: unknown[]) => mockResetTerminal(...args),
}));

vi.mock('@/store/store', () => ({
  useStore: {
    getState: () => ({
      agents: [],
      archivedAgents: [{ id: 'archived-1' }],
      updateAgent: mockUpdateAgent,
      addAgent: mockAddAgent,
    }),
  },
}));

import { restartAgentPty } from '../../src/renderer/src/utils/restartAgent';

function baseAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'worker-1',
    name: 'Worf',
    character: 'worf',
    accent: 'coral',
    status: 'idle',
    project: 'agent-stage',
    cwd: '/repo/base',
    ptyId: 'pty-worker-1',
    command: 'claude --model claude-sonnet-4-6',
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    description: 'Security officer',
    ...overrides,
  };
}

describe('restartAgentPty', () => {
  it('restarts a stopped (Ctrl-C) agent and resumes its recorded session in its isolated worktree', async () => {
    mockUpdateAgent.mockClear();
    mockDisposeTerminal.mockClear();
    mockResetTerminal.mockClear();

    const spawnPty = vi.fn().mockResolvedValue({ ok: true, resumed: true });
    const killPty = vi.fn().mockResolvedValue({ ok: false, error: 'no pty: pty-worker-1' });
    const gitIsRepo = vi.fn().mockResolvedValue(true);

    (globalThis as unknown as { window: unknown }).window = {
      cth: {
        getConfig: vi.fn().mockResolvedValue({ autoMode: true, defaultCommand: 'claude' }),
        hiveRegistry: vi.fn().mockResolvedValue({
          agents: {
            'worker-1': { sessionId: 'sess-123', command: 'claude --model claude-sonnet-4-6' },
          },
        }),
        resolveSessionCwd: vi.fn().mockResolvedValue('/repo/worktrees/worker-1'),
        gitIsRepo,
        killPty,
        spawnPty,
      },
    };

    const agent = baseAgent({ worktreePath: '/repo/worktrees/worker-1' });
    const res = await restartAgentPty(agent, { resume: true });

    expect(res).toEqual({ ok: true, resumed: true, fellBackToFresh: false });
    expect(killPty).toHaveBeenCalledWith('pty-worker-1', { preserveWorktree: true });
    expect(gitIsRepo).toHaveBeenCalledWith('/repo/worktrees/worker-1');
    expect(spawnPty).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pty-worker-1',
        cwd: '/repo/worktrees/worker-1',
        isolate: false,
        resume: true,
        resumeSessionId: 'sess-123',
      })
    );
    expect(mockDisposeTerminal).toHaveBeenCalledWith('pty-worker-1');
    expect(mockUpdateAgent).toHaveBeenCalledWith(
      'worker-1',
      expect.objectContaining({
        status: 'idle',
        action: 'continuing…',
        terminalGeneration: 1,
      })
    );
  });

  it('gracefully falls back to a fresh session when killed via Ctrl-C before a sessionId was recorded', async () => {
    mockUpdateAgent.mockClear();
    mockDisposeTerminal.mockClear();
    mockResetTerminal.mockClear();

    const spawnPty = vi.fn().mockResolvedValue({ ok: true, resumed: false });
    const killPty = vi.fn().mockResolvedValue({ ok: false, error: 'no pty: pty-worker-1' });

    (globalThis as unknown as { window: unknown }).window = {
      cth: {
        getConfig: vi.fn().mockResolvedValue({ autoMode: true, defaultCommand: 'claude' }),
        hiveRegistry: vi.fn().mockResolvedValue({ agents: {} }),
        resolveSessionCwd: vi.fn().mockResolvedValue(null),
        gitIsRepo: vi.fn().mockResolvedValue(false),
        killPty,
        spawnPty,
      },
    };

    const res = await restartAgentPty(baseAgent(), { resume: true });

    expect(res).toEqual({ ok: true, resumed: false, fellBackToFresh: true });
    expect(spawnPty).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pty-worker-1',
        cwd: '/repo/base',
        resume: false,
        resumeSessionId: undefined,
      })
    );
    expect(mockResetTerminal).toHaveBeenCalledWith('pty-worker-1');
    expect(mockUpdateAgent).toHaveBeenCalledWith(
      'worker-1',
      expect.objectContaining({
        status: 'idle',
        action: 'restarted (fresh session)…',
      })
    );
  });

  it('restores an archived agent back onto the active floor', async () => {
    mockAddAgent.mockClear();

    const spawnPty = vi.fn().mockResolvedValue({ ok: true, resumed: true });
    (globalThis as unknown as { window: unknown }).window = {
      cth: {
        getConfig: vi.fn().mockResolvedValue({ autoMode: true, defaultCommand: 'claude' }),
        hiveRegistry: vi.fn().mockResolvedValue({
          agents: { 'archived-1': { sessionId: 'sess-arch-1' } },
        }),
        resolveSessionCwd: vi.fn().mockResolvedValue('/repo/base'),
        gitIsRepo: vi.fn().mockResolvedValue(false),
        killPty: vi.fn().mockResolvedValue({ ok: false, error: 'no pty: pty-archived-1' }),
        spawnPty,
      },
    };

    const archived = baseAgent({ id: 'archived-1', ptyId: undefined, archived: true });
    const res = await restartAgentPty(archived, { resume: true });

    expect(res.ok).toBe(true);
    expect(mockAddAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'archived-1',
        ptyId: 'pty-archived-1',
        archived: false,
      })
    );
  });
});
