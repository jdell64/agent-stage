import { useEffect } from 'react';
import { SpritePortrait } from './SpritePortrait';
import { Icon } from './Icon';
import { extractFolderName, normalizeHivePath, shortenHomePath, type FloorsSnapshot } from '@shared/floors';

export interface FloorsModalProps {
  snapshot: FloorsSnapshot | null;
  onClose: () => void;
  onSelectFloor: (floorNumber: number) => void;
  onNewFloor: (initialHome?: string) => void;
  onCloseFloor: (floorNumber: number) => void;
}

/**
 * Munder Difflin "Building Tower" Modal (`Ctrl+B`).
 * Renders a stacked storey view (`Floor N` down to `Floor 1`) with an orange
 * `Floor N` pill, `~/path` label, green `● N working` indicator, and live pixel
 * `SpritePortrait` character lineup on desk pedestals.
 */
export function FloorsModal({
  snapshot,
  onClose,
  onSelectFloor,
  onNewFloor,
  onCloseFloor
}: FloorsModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const currentFloorNumber = snapshot?.currentFloorNumber ?? 1;
  // Stack higher floors above lower floors like a real building tower (Floor 2 above Floor 1)
  const floors = [...(snapshot?.floors ?? [])].sort((a, b) => b.floorNumber - a.floorNumber);

  const openNorms = new Set(
    floors.map((f) => normalizeHivePath(f.home)).filter((p): p is string => Boolean(p))
  );
  const unopenedRecents = (snapshot?.recentHives ?? [])
    .filter((h): h is string => {
      if (!h) return false;
      const norm = normalizeHivePath(h);
      return Boolean(norm && !openNorms.has(norm));
    })
    .slice(0, 4);

  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const shortcutLabel = isMac ? '⌘ ⇧ N' : 'Ctrl ⇧ N';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Building Tower — Multiple Floors"
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
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxWidth: '94vw',
          maxHeight: '88vh',
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
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 4
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              BUILDING TOWER
            </span>
            <span
              style={{
                fontFamily: 'var(--cth-font-ui)',
                fontSize: 13,
                color: '#a89f93'
              }}
            >
              {floors.length} active floor{floors.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Building Tower"
            style={{
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
              fontSize: 13
            }}
          >
            ✕
          </button>
        </div>

        {/* Dashed "+ New Floor [Ctrl ⇧ N]" button at the top of the stack (matches screenshot 1) */}
        <button
          type="button"
          onClick={() => {
            onNewFloor();
            onClose();
          }}
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
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              background: '#27231f',
              border: '1px solid #3d3730',
              fontFamily: 'var(--cth-font-mono)',
              fontSize: 11,
              color: '#a89f93'
            }}
          >
            {shortcutLabel}
          </span>
        </button>

        {/* Stacked Storey Cards (Floor N down to Floor 1) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {floors.map((fl) => {
            const isCurrent = fl.floorNumber === currentFloorNumber;
            const statusCount = fl.workingCount > 0 ? fl.workingCount : fl.agentCount;
            const statusLabel =
              fl.workingCount > 0
                ? `${fl.workingCount} working`
                : fl.agentCount > 0
                  ? `${fl.agentCount} on floor`
                  : 'empty floor';

            return (
              <div
                key={fl.floorNumber}
                onClick={() => {
                  onSelectFloor(fl.floorNumber);
                  onClose();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFloor(fl.floorNumber);
                    onClose();
                  }
                }}
                style={{
                  borderRadius: 10,
                  border: isCurrent ? '1.5px solid #e68a2e' : '1px solid #302b26',
                  background: '#1d1a17',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: isCurrent
                    ? '0 0 0 1px rgba(230, 138, 46, 0.2), 0 6px 18px rgba(0, 0, 0, 0.4)'
                    : '0 4px 12px rgba(0, 0, 0, 0.3)'
                }}
              >
                {/* Card Header: [Floor N]  ~/path/to/folder      ● N working */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minWidth: 0
                  }}
                >
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'rgba(230, 138, 46, 0.18)',
                      border: '1px solid rgba(230, 138, 46, 0.35)',
                      color: '#f09436',
                      fontFamily: 'var(--cth-font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    Floor {fl.floorNumber}
                  </span>

                  <span
                    title={fl.home ?? 'Unassigned floor'}
                    style={{
                      fontFamily: 'var(--cth-font-mono)',
                      fontSize: 13,
                      color: '#e8e0d5',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0
                    }}
                  >
                    {fl.displayPath}
                  </span>

                  {isCurrent && (
                    <span
                      style={{
                        fontFamily: 'var(--cth-font-mono)',
                        fontSize: 9.5,
                        color: '#b8aea1',
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: '#2a2520',
                        flexShrink: 0
                      }}
                    >
                      THIS WINDOW
                    </span>
                  )}

                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontFamily: 'var(--cth-font-mono)',
                      fontSize: 11.5,
                      color: statusCount > 0 ? '#a89f93' : '#6e665e',
                      flexShrink: 0
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background:
                          fl.workingCount > 0
                            ? '#28b463'
                            : fl.agentCount > 0
                              ? '#e68a2e'
                              : '#575049',
                        boxShadow:
                          fl.workingCount > 0 ? '0 0 6px rgba(40, 180, 99, 0.7)' : 'none'
                      }}
                    />
                    {statusLabel}
                  </span>

                  {floors.length > 1 && (
                    <button
                      type="button"
                      title={`Close Floor ${fl.floorNumber}`}
                      aria-label={`Close Floor ${fl.floorNumber}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseFloor(fl.floorNumber);
                      }}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        border: '1px solid #332e29',
                        background: '#25211d',
                        color: '#9c9286',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        flexShrink: 0
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#2b2621' }} />

                {/* Pixel SpritePortrait Character Lineup on Desk Pedestals */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 14,
                    minHeight: 54,
                    padding: '4px 6px 2px',
                    overflowX: 'auto'
                  }}
                >
                  {fl.agents.length > 0 ? (
                    fl.agents.map((ag) => (
                      <div
                        key={ag.id}
                        title={`${ag.name} (${ag.status})`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 3,
                          position: 'relative'
                        }}
                      >
                        <div style={{ position: 'relative', lineHeight: 0 }}>
                          <SpritePortrait character={ag.character} scale={1.5} />
                        </div>
                        {/* Warm wooden desk pedestal bar underneath each character */}
                        <div
                          style={{
                            width: 34,
                            height: 4,
                            borderRadius: 2,
                            background: 'linear-gradient(90deg, #6e4726 0%, #9c6738 50%, #6e4726 100%)',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.6)'
                          }}
                        />
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        fontFamily: 'var(--cth-font-mono)',
                        fontSize: 11,
                        color: '#787067',
                        padding: '12px 4px'
                      }}
                    >
                      {fl.home
                        ? 'No agents seated on this floor yet — click to switch to this floor.'
                        : 'Waiting for folder selection — click to pick a workspace folder.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unopened Recent Folders — Quick-launch in a new floor */}
        {unopenedRecents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
            <div
              style={{
                fontFamily: 'var(--cth-font-display)',
                fontSize: 8.5,
                color: '#8c8379',
                letterSpacing: 0.5
              }}
            >
              OPEN RECENT FOLDER IN NEW FLOOR
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unopenedRecents.map((recentPath) => (
                <button
                  key={recentPath}
                  type="button"
                  onClick={() => {
                    onNewFloor(recentPath);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #2d2823',
                    background: '#1c1916',
                    color: '#d6cec2',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <Icon name="folder" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--cth-font-ui)',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#e8e0d5'
                      }}
                    >
                      {extractFolderName(recentPath)}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--cth-font-mono)',
                        fontSize: 11,
                        color: '#8c8379',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {shortenHomePath(recentPath)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--cth-font-mono)',
                      fontSize: 11,
                      color: '#f09436',
                      flexShrink: 0
                    }}
                  >
                    + open floor →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
