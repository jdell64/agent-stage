import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockUpdateAgent = vi.fn();
const mockAddAgent = vi.fn();
let storeAgents: Array<Record<string, unknown>> = [];

vi.mock('@/components/terminalPool', () => ({
  acquireTerminal: () => ({ term: { cols: 100, rows: 30 }, fit: { fit: vi.fn() } }),
  disposeTerminal: vi.fn(),
  resetTerminal: vi.fn()
}));

vi.mock('@/store/store', () => ({
  useStore: {
    getState: () => ({
      agents: storeAgents,
      archivedAgents: [],
      updateAgent: mockUpdateAgent,
      addAgent: mockAddAgent
    })
  }
}));

import { resetFloorAgents, seedFloorSquad } from '../../src/renderer/src/utils/floorAgents';

function agent(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    character: 'ada',
    accent: 'sky',
    status: 'working',
    project: 'p',
    cwd: '/repo',
    ptyId: `pty-${id}`,
    command: 'claude',
    provider: 'claude',
    description: 'x'
  };
}

function installWindow(spawnPty: ReturnType<typeof vi.fn>, killPty = vi.fn().mockResolvedValue({ ok: true })) {
  (globalThis as unknown as { window: unknown }).window = {
    cth: {
      getConfig: vi.fn().mockResolvedValue({ autoMode: false, defaultCommand: 'claude', defaultModel: 'claude-sonnet-4-6' }),
      hiveRegistry: vi.fn().mockResolvedValue({ agents: {} }),
      gitIsRepo: vi.fn().mockResolvedValue(true),
      killPty,
      spawnPty
    }
  };
}

beforeEach(() => {
  mockUpdateAgent.mockClear();
  mockAddAgent.mockClear();
});

describe('resetFloorAgents', () => {
  it('gives every agent a FRESH session (resume:false), keeping the same agent id and workspace', async () => {
    storeAgents = [agent('a1', 'Ada'), agent('a2', 'Ben'), agent('a3', 'Cleo')];
    const spawnPty = vi.fn().mockResolvedValue({ ok: true, resumed: false });
    installWindow(spawnPty);

    const res = await resetFloorAgents();

    expect(res).toEqual({ reset: 3, failures: [] });
    expect(spawnPty).toHaveBeenCalledTimes(3);
    for (const call of spawnPty.mock.calls) {
      const opts = call[0] as { resume?: boolean; resumeSessionId?: string; hive: { id: string } };
      // Fresh session: never reattach the old conversation...
      expect(opts.resume).toBe(false);
      expect(opts.resumeSessionId).toBeUndefined();
      // ...and respawn into the SAME hive identity, which is what keeps memory.md.
      expect(['a1', 'a2', 'a3']).toContain(opts.hive.id);
    }
  });

  it('reports a failed agent without abandoning the rest of the floor', async () => {
    storeAgents = [agent('a1', 'Ada'), agent('a2', 'Ben')];
    const spawnPty = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'boom' })
      .mockResolvedValueOnce({ ok: true, resumed: false });
    installWindow(spawnPty);

    const res = await resetFloorAgents();

    expect(res.reset).toBe(1);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]).toContain('boom');
  });

  it('is a no-op on an empty floor', async () => {
    storeAgents = [];
    installWindow(vi.fn());
    expect(await resetFloorAgents()).toEqual({ reset: 0, failures: [] });
  });
});

describe('seedFloorSquad', () => {
  it('hires the standard squad workers into the floor folder and adds them to the roster', async () => {
    const spawnPty = vi.fn().mockResolvedValue({ ok: true, cwd: '/floor/home' });
    installWindow(spawnPty);

    const res = await seedFloorSquad('standard', '/floor/home');

    expect(res).toEqual({ hired: 4, failures: [] });
    expect(mockAddAgent).toHaveBeenCalledTimes(4);
    const names = mockAddAgent.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(names).toEqual(['Architect', 'Frontend', 'DevOps', 'Reviewer']);
    for (const call of spawnPty.mock.calls) {
      expect((call[0] as { cwd: string }).cwd).toBe('/floor/home');
    }
  });

  it('hires nobody for the empty squad (the orchestrator boots by itself)', async () => {
    const spawnPty = vi.fn();
    installWindow(spawnPty);
    expect(await seedFloorSquad('empty', '/floor/home')).toEqual({ hired: 0, failures: [] });
    expect(spawnPty).not.toHaveBeenCalled();
  });

  it('one failed hire does not block the others', async () => {
    const spawnPty = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'no cli' })
      .mockResolvedValue({ ok: true, cwd: '/floor/home' });
    installWindow(spawnPty);

    const res = await seedFloorSquad('standard', '/floor/home');

    expect(res.hired).toBe(3);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]).toContain('Architect');
  });
});
