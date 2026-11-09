import { useEffect, useRef, useState } from 'react';
import { SpritePortrait } from './SpritePortrait';
import { FLOOR_NAME_MAX, type FloorSummary, type FloorsSnapshot } from '@shared/floors';

export interface FloorsModalProps {
  snapshot: FloorsSnapshot | null;
  onClose: () => void;
  /** Bring this floor's window to the front. */
  onSelectFloor: (floorNumber: number) => void;
  /** Open the New Floor flow. */
  onNewFloor: () => void;
  onCloseFloor: (floorNumber: number) => void;
  onRenameFloor: (floorNumber: number, name: string) => void;
  /** Fresh session for every agent on the floor (memory.md kept). Already confirmed by the modal. */
  onResetFloor: (floorNumber: number) => void;
}

const WORKING = new Set(['working', 'thinking', 'typing', 'compacting']);

function statusColor(status: string): string {
  if (WORKING.has(status)) return '#28b463';
  if (status === 'error' || status === 'looping' || status === 'blocked') return '#d9534f';
  if (status === 'stopped' || status === 'exited') return '#575049';
  return '#e68a2e';
}

/**
 * Building Tower (`Ctrl+B`): EVERY floor in one viewer, stacked like a building
 * (highest floor on top). Each row shows the floor's name + folder, who is seated
 * on it, each agent's live status, what the floor is doing right now, and the
 * per-floor actions: Focus/Switch, rename, reset agents, close.
 *
 * It reads the live `floors:changed` snapshot every window receives, so a floor's
 * agents and activity update here without opening that floor's window.
 */
export function FloorsModal({
  snapshot,
  onClose,
  onSelectFloor,
  onNewFloor,
  onCloseFloor,
  onRenameFloor,
  onResetFloor
}: FloorsModalProps) {
  const currentFloorNumber = snapshot?.currentFloorNumber ?? 1;
  // Highest floor on top, like a real tower.
  const floors = [...(snapshot?.floors ?? [])].sort((a, b) => b.floorNumber - a.floorNumber);

  const [selected, setSelected] = useState<number>(currentFloorNumber);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmReset, setConfirmReset] = useState<number | null>(null);
  const renameRef = useRef<HTMLInputElement | null>(null);
  // Escape cancels a rename, but unmounting the focused input also fires blur; this latch stops that blur saving it.
  const skipCommit = useRef(false);

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const shortcutLabel = isMac ? '⌘ ⇧ N' : 'Ctrl ⇧ N';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.key === 'Escape') {
        e.preventDefault();
        if (renaming !== null) { skipCommit.current = true; setRenaming(null); }
        else if (confirmReset !== null) setConfirmReset(null);
        else if (menuFor !== null) setMenuFor(null);
        else onClose();
        return;
      }
      if (typing) return;
      const idx = floors.findIndex((f) => f.floorNumber === selected);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = floors[Math.min(floors.length - 1, idx + 1)];
        if (next) setSelected(next.floorNumber);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = floors[Math.max(0, idx - 1)];
        if (prev) setSelected(prev.floorNumber);
      } else if (e.key === 'Enter' && idx >= 0) {
        e.preventDefault();
        onSelectFloor(selected);
        onClose();
      } else if (/^[1-9]$/.test(e.key)) {
        const target = floors.find((f) => f.floorNumber === Number(e.key));
        if (target) {
          e.preventDefault();
          onSelectFloor(target.floorNumber);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onSelectFloor, floors, selected, renaming, confirmReset, menuFor]);

  useEffect(() => {
    if (renaming !== null) renameRef.current?.select();
  }, [renaming]);

  const startRename = (fl: FloorSummary) => {
    skipCommit.current = false;
    setMenuFor(null);
    setRenameDraft(fl.name ?? fl.displayName ?? '');
    setRenaming(fl.floorNumber);
  };
  const commitRename = (fl: FloorSummary) => {
    if (skipCommit.current) { skipCommit.current = false; return; }
    skipCommit.current = true; // Enter then blur must not save twice
    onRenameFloor(fl.floorNumber, renameDraft);
    setRenaming(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Building Tower: all floors"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 350,
        background: 'rgba(12, 10, 8, 0.72)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); setMenuFor(null); }}
        style={{
          width: 640,
          maxWidth: '96vw',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#171513',
          border: '1px solid #35302a',
          borderRadius: 12,
          padding: 18,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          color: '#f2ece4'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 15, fontWeight: 700 }}>Building Tower</span>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: 4,
                background: 'rgba(230, 138, 46, 0.16)',
                border: '1px solid rgba(230, 138, 46, 0.4)',
                color: '#f09436',
                fontFamily: 'var(--cth-font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.6
              }}
            >
              ALL FLOORS
            </span>
            <span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, color: '#a89f93' }}>
              {floors.length} floor{floors.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Building Tower"
            style={iconBtn}
          >
            ✕
          </button>
        </div>

        {/* + New Floor */}
        <button
          type="button"
          onClick={() => { onNewFloor(); onClose(); }}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 8,
            border: '1.5px dashed #3c3630',
            background: '#1c1917',
            color: '#c8bfb3',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontFamily: 'var(--cth-font-ui)',
            fontSize: 13,
            fontWeight: 600
          }}
        >
          <span style={{ fontSize: 16, color: '#a89f93', lineHeight: 1 }}>+</span>
          <span>New Floor</span>
          <span style={kbd}>{shortcutLabel}</span>
        </button>

        {/* Every floor, stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {floors.map((fl) => {
            const isCurrent = fl.floorNumber === currentFloorNumber;
            const isSelected = fl.floorNumber === selected;
            const title = fl.displayName ?? fl.folderName ?? `Floor ${fl.floorNumber}`;
            const statusLabel =
              fl.workingCount > 0
                ? `${fl.workingCount} working`
                : fl.agentCount > 0
                  ? `${fl.agentCount} idle`
                  : 'standby';
            return (
              <div
                key={fl.floorNumber}
                data-floor={fl.floorNumber}
                onClick={() => setSelected(fl.floorNumber)}
                style={{
                  position: 'relative',
                  borderRadius: 10,
                  border: isCurrent
                    ? '1.5px solid #e68a2e'
                    : isSelected
                      ? '1.5px solid #6e5a43'
                      : '1px dashed #3a342d',
                  background: '#1d1a17',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: isCurrent ? '0 0 0 1px rgba(230, 138, 46, 0.2), 0 6px 18px rgba(0, 0, 0, 0.4)' : 'none'
                }}
              >
                {isCurrent && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -9,
                      right: 14,
                      padding: '1px 8px',
                      borderRadius: 10,
                      background: '#241d15',
                      border: '1px solid #e68a2e',
                      color: '#f09436',
                      fontFamily: 'var(--cth-font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 0.6
                    }}
                  >
                    ● CURRENTLY FOCUSED
                  </span>
                )}

                {/* Row header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={floorPill(isCurrent)}>Floor {fl.floorNumber}</span>

                  {renaming === fl.floorNumber ? (
                    <input
                      ref={renameRef}
                      value={renameDraft}
                      maxLength={FLOOR_NAME_MAX}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(fl); }
                        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skipCommit.current = true; setRenaming(null); }
                      }}
                      onBlur={() => commitRename(fl)}
                      aria-label={`Rename Floor ${fl.floorNumber}`}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '3px 8px',
                        borderRadius: 4,
                        border: '1px solid #e68a2e',
                        background: '#14110f',
                        color: '#f2ece4',
                        fontFamily: 'var(--cth-font-ui)',
                        fontSize: 13
                      }}
                    />
                  ) : (
                    <>
                      <span
                        data-floor-name
                        style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 14, fontWeight: 700, color: '#f2ece4', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {title}
                      </span>
                      <span
                        title={fl.home ?? 'No folder yet'}
                        style={{
                          fontFamily: 'var(--cth-font-mono)',
                          fontSize: 11.5,
                          color: '#8c8379',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          minWidth: 0
                        }}
                      >
                        {fl.displayPath ?? 'no folder'}
                      </span>
                    </>
                  )}

                  <span style={statusChip(fl.workingCount > 0)}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: fl.workingCount > 0 ? '#28b463' : fl.agentCount > 0 ? '#e68a2e' : '#575049',
                        boxShadow: fl.workingCount > 0 ? '0 0 6px rgba(40, 180, 99, 0.7)' : 'none'
                      }}
                    />
                    {statusLabel}
                  </span>

                  <button
                    type="button"
                    disabled={isCurrent}
                    onClick={(e) => { e.stopPropagation(); onSelectFloor(fl.floorNumber); onClose(); }}
                    style={{ ...actionBtn, opacity: isCurrent ? 0.6 : 1, cursor: isCurrent ? 'default' : 'pointer' }}
                  >
                    {isCurrent ? 'Active' : isSelected ? 'Focus ↵' : 'Switch'}
                  </button>

                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      aria-label={`Floor ${fl.floorNumber} options`}
                      aria-haspopup="menu"
                      onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === fl.floorNumber ? null : fl.floorNumber); }}
                      style={iconBtn}
                    >
                      ⚙
                    </button>
                    {menuFor === fl.floorNumber && (
                      <div
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 28,
                          zIndex: 5,
                          minWidth: 170,
                          padding: 4,
                          borderRadius: 8,
                          border: '1px solid #3a342d',
                          background: '#211d19',
                          boxShadow: '0 10px 24px rgba(0,0,0,0.55)',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        <button type="button" role="menuitem" style={menuItem} onClick={() => startRename(fl)}>
                          Rename floor
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          style={menuItem}
                          disabled={fl.agentCount === 0}
                          onClick={() => { setMenuFor(null); setConfirmReset(fl.floorNumber); }}
                        >
                          Reset all agents…
                        </button>
                        {floors.length > 1 && (
                          <button
                            type="button"
                            role="menuitem"
                            style={{ ...menuItem, color: '#e07a72' }}
                            onClick={() => { setMenuFor(null); onCloseFloor(fl.floorNumber); }}
                          >
                            Close floor
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ height: 1, background: '#2b2621' }} />

                {confirmReset === fl.floorNumber && (
                  <div
                    role="alertdialog"
                    aria-label={`Reset all agents on ${title}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #6b3a35',
                      background: '#2a1a18'
                    }}
                  >
                    <div style={{ flex: 1, fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: '#e8d6d2', lineHeight: 1.4 }}>
                      <strong>Reset {fl.agentCount} agent{fl.agentCount === 1 ? '' : 's'} on {title}?</strong>
                      <br />
                      Each agent restarts with a fresh session (cleared context). Their memory.md and saved memories are kept.
                    </div>
                    <button type="button" style={actionBtn} onClick={() => setConfirmReset(null)}>Cancel</button>
                    <button
                      type="button"
                      style={{ ...actionBtn, background: '#a8423a', borderColor: '#c9564d', color: '#fff' }}
                      onClick={() => { setConfirmReset(null); onResetFloor(fl.floorNumber); }}
                    >
                      Reset agents
                    </button>
                  </div>
                )}

                {/* Lineup + what the floor is doing */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, minHeight: 58 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flex: 1, minWidth: 0, overflowX: 'auto', padding: '2px 2px 2px' }}>
                    {fl.agents.length > 0 ? (
                      fl.agents.map((ag) => (
                        <div
                          key={ag.id}
                          title={`${ag.name} · ${ag.status}${ag.action ? ` · ${ag.action}` : ''}`}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, position: 'relative', flexShrink: 0 }}
                        >
                          <div style={{ position: 'relative', lineHeight: 0 }}>
                            <SpritePortrait character={ag.character} scale={1.5} />
                            <span
                              style={{
                                position: 'absolute',
                                right: -2,
                                top: -2,
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: statusColor(ag.status),
                                border: '1px solid #171513'
                              }}
                            />
                          </div>
                          <div
                            style={{
                              width: 34,
                              height: 4,
                              borderRadius: 2,
                              background: 'linear-gradient(90deg, #6e4726 0%, #9c6738 50%, #6e4726 100%)',
                              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.6)'
                            }}
                          />
                          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 8.5, color: '#8c8379', maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ag.name}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: '#787067', padding: '12px 4px' }}>
                        {fl.home ? 'No agents seated yet.' : 'Waiting for a folder.'}
                      </span>
                    )}
                  </div>
                  <div
                    data-floor-activity
                    style={{
                      maxWidth: 230,
                      padding: '7px 11px',
                      borderRadius: 8,
                      background: '#26211c',
                      border: '1px solid #352f28',
                      fontFamily: 'var(--cth-font-mono)',
                      fontSize: 11,
                      color: fl.activity ? '#d6cec2' : '#787067',
                      fontStyle: fl.activity ? 'normal' : 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}
                  >
                    {fl.activity ? `⚡ ${fl.activity}` : fl.agentCount > 0 ? 'Idle, awaiting assignment' : 'Awaiting first agent'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--cth-font-mono)', fontSize: 10, color: '#6e665e' }}>
          <span>ONE LICENCE · ONE MACHINE</span>
          <span>
            <span style={kbd}>↑</span> <span style={kbd}>↓</span> Select · <span style={kbd}>Enter</span> Focus · <span style={kbd}>1-9</span> Jump · <span style={kbd}>Esc</span> Dismiss
          </span>
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: '1px solid #332e29',
  background: '#221f1c',
  color: '#a89f93',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  flexShrink: 0
};

const actionBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #3d3730',
  background: '#27231f',
  color: '#d6cec2',
  cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0
};

const menuItem: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  borderRadius: 5,
  border: 'none',
  background: 'transparent',
  color: '#d6cec2',
  cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 12.5
};

const kbd: React.CSSProperties = {
  padding: '2px 7px',
  borderRadius: 4,
  background: '#27231f',
  border: '1px solid #3d3730',
  fontFamily: 'var(--cth-font-mono)',
  fontSize: 11,
  color: '#a89f93'
};

function floorPill(active: boolean): React.CSSProperties {
  return {
    padding: '3px 8px',
    borderRadius: 4,
    background: active ? 'rgba(230, 138, 46, 0.18)' : '#2a2520',
    border: active ? '1px solid rgba(230, 138, 46, 0.35)' : '1px solid #3a342d',
    color: active ? '#f09436' : '#b8aea1',
    fontFamily: 'var(--cth-font-mono)',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0
  };
}

function statusChip(working: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 8px',
    borderRadius: 5,
    background: working ? 'rgba(40, 180, 99, 0.12)' : '#25211d',
    fontFamily: 'var(--cth-font-mono)',
    fontSize: 11.5,
    color: working ? '#5fd08c' : '#8c8379',
    flexShrink: 0
  };
}
