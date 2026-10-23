import { describe, expect, it } from 'vitest';
import { newAgentId } from '../../src/shared/agentId';

describe('newAgentId', () => {
  it('creates distinct opaque IDs independent of agent names', () => {
    const first = newAgentId();
    const second = newAgentId();

    expect(first).toMatch(/^agent-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
    expect(first).not.toMatch(/ryan|jim|michael/i);
  });
});
