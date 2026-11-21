import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  cleanupSecondaryFloorAfterContentsGone,
  registerSecondaryFloorGoneHandlers
} from '../../src/main/floorRuntimeLifecycle';

describe('secondary floor renderer loss', () => {
  it('kills owned PTYs and removes the runtime on renderer loss, only once', () => {
    const contents = new EventEmitter();
    const actions: string[] = [];
    let current = true;
    const cleanup = () => cleanupSecondaryFloorAfterContentsGone({
      isPrimary: false,
      isCurrent: () => current,
      detachView: () => actions.push('detach'),
      killOwnerPtys: () => actions.push('kill-ptys'),
      stopServices: () => actions.push('stop-services'),
      removeRuntime: () => { actions.push('remove-runtime'); current = false; },
      activateFallback: () => actions.push('activate-fallback'),
      broadcast: () => actions.push('broadcast')
    });

    registerSecondaryFloorGoneHandlers(
      (listener) => contents.once('destroyed', listener),
      (listener) => contents.once('render-process-gone', listener),
      cleanup
    );
    contents.emit('render-process-gone');
    contents.emit('destroyed');

    expect(actions).toEqual([
      'detach', 'kill-ptys', 'stop-services', 'remove-runtime', 'activate-fallback', 'broadcast'
    ]);
  });

  it('does not tear down a primary or an already-removed floor', () => {
    const actions: string[] = [];
    const deps = {
      isPrimary: false,
      isCurrent: () => false,
      detachView: () => actions.push('detach'),
      killOwnerPtys: () => actions.push('kill-ptys'),
      stopServices: () => actions.push('stop-services'),
      removeRuntime: () => actions.push('remove-runtime'),
      activateFallback: () => actions.push('activate-fallback'),
      broadcast: () => actions.push('broadcast')
    };
    expect(cleanupSecondaryFloorAfterContentsGone(deps)).toBe(false);
    expect(cleanupSecondaryFloorAfterContentsGone({ ...deps, isPrimary: true, isCurrent: () => true })).toBe(false);
    expect(actions).toEqual([]);
  });
});
