import type { FloorsSnapshot } from '@shared/floors';

export interface FloorRailProps {
  snapshot: FloorsSnapshot | null;
  onOpenTower: () => void;
  onSelectFloor: (floorNumber: number) => void;
  onNewFloor: () => void;
}

/**
 * Discord-style far-left vertical Floor Rail (`56px` wide).
 * One tile per REAL open floor (never a placeholder for a recent folder: those
 * live in the New Floor flow), live green working-agent badges, a `+` New Floor
 * button, and the top warm-amber `TOWER` overview button (`Ctrl+B`).
 */
export function FloorRail({
  snapshot,
  onOpenTower,
  onSelectFloor,
  onNewFloor
}: FloorRailProps) {
  const floors = snapshot?.floors ?? [];
  const currentFloorNumber = snapshot?.currentFloorNumber ?? 1;

  return (
    <aside
      aria-label="Floor switcher rail"
      style={{
        width: 58,
        minWidth: 58,
        background: '#171513',
        borderRight: '1px solid #2e2a25',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 6px',
        gap: 8,
        userSelect: 'none',
        zIndex: 20
      }}
    >
      {/* Top warm-amber Building Tower button */}
      <button
        type="button"
        onClick={onOpenTower}
        title="Building Tower Overview (Ctrl+B)"
        aria-label="Building Tower Overview"
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          border: '1px solid #f5a646',
          background: 'linear-gradient(180deg, #ea8d2a 0%, #c96d12 100%)',
          color: '#1b140d',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: 0,
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.28)'
        }}
      >
        <TowerGlyph />
        <span
          style={{
            fontFamily: 'var(--cth-font-display)',
            fontSize: 6,
            letterSpacing: 0.4,
            lineHeight: '8px',
            fontWeight: 700,
            color: '#1b140d'
          }}
        >
          TOWER
        </span>
      </button>

      {/* Subtle separator */}
      <div
        style={{
          width: 28,
          height: 2,
          background: '#2e2a25',
          borderRadius: 1,
          margin: '2px 0'
        }}
      />

      {/* Open Floor tiles */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          overflowY: 'auto',
          flex: 1
        }}
      >
        {floors.map((fl) => {
          const isCurrent = fl.floorNumber === currentFloorNumber;
          return (
            <div
              key={fl.floorNumber}
              style={{
                position: 'relative',
                width: '100%',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              {/* Left active indicator bar (Discord-style) */}
              {isCurrent && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: -6,
                    top: 8,
                    bottom: 8,
                    width: 4,
                    borderRadius: '0 3px 3px 0',
                    background: '#f09436'
                  }}
                />
              )}

              <button
                type="button"
                onClick={() => onSelectFloor(fl.floorNumber)}
                title={`Floor ${fl.floorNumber}: ${fl.displayName ?? fl.folderName} (${fl.displayPath}) — ${fl.workingCount} working, ${fl.agentCount} total`}
                aria-label={`Floor ${fl.floorNumber}: ${fl.folderName}`}
                aria-current={isCurrent ? 'page' : undefined}
                style={{
                  position: 'relative',
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  border: isCurrent ? '2px solid #f09436' : '1px solid #3c3630',
                  background: isCurrent ? '#2b241d' : '#221f1c',
                  color: isCurrent ? '#fff7eb' : '#d6cec2',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  padding: '2px 3px',
                  boxShadow: isCurrent
                    ? '0 0 0 1px rgba(240, 148, 54, 0.25), 0 3px 8px rgba(0, 0, 0, 0.4)'
                    : '0 2px 4px rgba(0, 0, 0, 0.3)'
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--cth-font-ui)',
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: '15px',
                    color: isCurrent ? '#ffffff' : '#dfd7cb'
                  }}
                >
                  F{fl.floorNumber}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--cth-font-mono)',
                    fontSize: 7.5,
                    fontWeight: 700,
                    lineHeight: '9px',
                    color: isCurrent ? '#f4b166' : '#9c9286',
                    maxWidth: 38,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {fl.shortTag}
                </span>
              </button>

              {/* Top-right green live working-agent count badge */}
              {fl.workingCount > 0 && (
                <span
                  title={`${fl.workingCount} agent${fl.workingCount === 1 ? '' : 's'} actively working on Floor ${fl.floorNumber}`}
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: 1,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: '#28b463',
                    border: '2px solid #171513',
                    color: '#ffffff',
                    fontFamily: 'var(--cth-font-ui)',
                    fontSize: 9,
                    fontWeight: 800,
                    lineHeight: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.5)'
                  }}
                >
                  {fl.workingCount}
                </span>
              )}
            </div>
          );
        })}

        {/* Dashed '+' New Floor button */}
        <button
          type="button"
          onClick={onNewFloor}
          title="New Floor (Ctrl+Shift+N)"
          aria-label="New Floor"
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            border: '1.5px dashed #4a423b',
            background: 'transparent',
            color: '#9c9286',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 500,
            lineHeight: 1,
            padding: 0
          }}
        >
          +
        </button>
      </div>

      {/* Bottom status indicator + MD badge */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          paddingTop: 6
        }}
      >
        <span
          title={`${floors.length} active floor${floors.length === 1 ? '' : 's'}`}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#28b463',
            boxShadow: '0 0 6px rgba(40, 180, 99, 0.6)'
          }}
        />
        <div
          style={{
            width: 34,
            height: 22,
            borderRadius: 4,
            background: '#231f1c',
            border: '1px solid #3a342e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--cth-font-display)',
            fontSize: 8,
            color: '#8c8379',
            letterSpacing: 0.5
          }}
        >
          AS
        </div>
      </div>
    </aside>
  );
}

function TowerGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="2" width="12" height="14" rx="1.5" />
      <line x1="6.5" y1="5.5" x2="7.5" y2="5.5" />
      <line x1="10.5" y1="5.5" x2="11.5" y2="5.5" />
      <line x1="6.5" y1="8.5" x2="7.5" y2="8.5" />
      <line x1="10.5" y1="8.5" x2="11.5" y2="8.5" />
      <path d="M7.5 16v-3.5h3V16" />
    </svg>
  );
}
