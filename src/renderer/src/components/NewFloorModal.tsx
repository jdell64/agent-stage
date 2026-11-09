import { useEffect, useMemo, useRef, useState } from 'react';
import { SpritePortrait } from './SpritePortrait';
import {
  FLOOR_NAME_MAX,
  FLOOR_SQUADS,
  projectFolderName,
  sanitizeFloorName,
  shortenHomePath,
  squadDefinition,
  type FloorFolderStatus,
  type FloorSquadPreset,
  type NewFloorInfo,
  type OpenFloorOptions
} from '@shared/floors';

export interface NewFloorModalProps {
  onClose: () => void;
  /** Resolves when the floor has been opened (or an existing floor focused). */
  onCreate: (opts: OpenFloorOptions) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * New Floor: name it, pick its folder (browse or a recent repo), pick a starting
 * squad. One folder can only ever belong to one floor, so a folder that another
 * floor already holds (or nests with) is shown as locked and cannot be chosen.
 */
export function NewFloorModal({ onClose, onCreate }: NewFloorModalProps) {
  const [info, setInfo] = useState<NewFloorInfo | null>(null);
  const [home, setHome] = useState('');
  const [name, setName] = useState('');
  // Until the user types their own alias, the name follows the chosen folder.
  const [nameTouched, setNameTouched] = useState(false);
  const [squad, setSquad] = useState<FloorSquadPreset>('standard');
  const [status, setStatus] = useState<FloorFolderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    window.cth?.floors?.newFloorInfo?.().then((i) => { if (active) setInfo(i); }).catch(() => { /* ignore */ });
    nameRef.current?.focus();
    return () => { active = false; };
  }, []);

  // Live status of whatever folder is typed/picked (git branch, dirty, or locked by a floor).
  useEffect(() => {
    const trimmed = home.trim();
    if (!trimmed) { setStatus(null); return; }
    let active = true;
    const t = setTimeout(() => {
      window.cth?.floors?.inspectFolder?.(trimmed).then((s) => { if (active) setStatus(s); }).catch(() => { /* ignore */ });
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [home]);

  const floorNumber = info?.nextFloorNumber ?? 2;
  const locked = status?.lockedByFloor != null;
  const effectiveName = sanitizeFloorName(name) ?? projectFolderName(home) ?? `Floor ${floorNumber}`;
  const def = squadDefinition(squad);
  const canOpen = !!home.trim() && !locked && !busy;

  const pickFolder = (path: string) => {
    setHome(path);
    setError(null);
    if (!nameTouched) setName(projectFolderName(path) ?? '');
  };

  const browse = async () => {
    const picked = await window.cth?.floors?.browseFolder?.();
    if (picked) pickFolder(picked);
  };

  const submit = async () => {
    if (!canOpen) return;
    setBusy(true);
    setError(null);
    const res = await onCreate({ home: home.trim(), name: effectiveName, squad });
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? 'Could not open the floor.');
      return;
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') {
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const recents = useMemo(() => info?.recents ?? [], [info]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New Floor"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 360, background: 'rgba(12, 10, 8, 0.74)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxWidth: '96vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#171513',
          border: '1px solid #35302a',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65)',
          color: '#f2ece4'
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #2b2621', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 17, fontWeight: 700 }}>New Floor</span>
              <span style={tag}>WORKSPACE ISOLATION</span>
            </div>
            <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: '#8c8379', marginTop: 4 }}>
              An isolated floor: its own folder, agents, inbox and memory. Floors share one building memory.
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={closeBtn}>✕</button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Name */}
          <section style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ ...tag, background: '#e68a2e', color: '#1b140d', border: '1px solid #f5a646' }}>FLOOR {floorNumber}</span>
              <span style={sectionLabel}>FLOOR NAME</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--cth-font-mono)', fontSize: 10.5, color: '#6e665e' }}>auto-assigned next available number</span>
            </div>
            <input
              ref={nameRef}
              value={name}
              maxLength={FLOOR_NAME_MAX}
              placeholder={projectFolderName(home) ?? 'billing-portal'}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              aria-label="Floor name"
              style={input}
            />
          </section>

          {/* Folder */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={sectionLabel}>TARGET PROJECT DIRECTORY <span style={{ color: '#6e665e', fontWeight: 400 }}>(one folder per floor)</span></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={home}
                onChange={(e) => { setHome(e.target.value); setError(null); }}
                placeholder="/path/to/project"
                aria-label="Floor folder"
                style={{ ...input, flex: 1 }}
              />
              <button type="button" onClick={() => void browse()} style={secondaryBtn}>Browse Folders…</button>
            </div>
            {status && (
              <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: locked ? '#e07a72' : '#8c8379' }}>
                {locked
                  ? `Locked: this folder is already Floor ${status.lockedByFloor} (${status.lockedByName}). Pick another folder.`
                  : status.kind === 'git'
                    ? `Git repository · ${status.branch ?? 'detached'}${status.dirty ? ' · uncommitted changes' : ' · clean'}`
                    : status.kind === 'folder'
                      ? 'Existing folder (not a git repository)'
                      : 'New folder, it will be created'}
              </div>
            )}

            {recents.length > 0 && (
              <div style={{ border: '1px solid #2e2924', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: '#211d19', ...sectionLabel }}>
                  <span>RECENT LOCAL REPOSITORIES</span>
                  <span>STATUS</span>
                </div>
                {recents.map((r) => {
                  const isLocked = r.lockedByFloor != null;
                  const selected = r.path === home.trim();
                  return (
                    <button
                      key={r.path}
                      type="button"
                      disabled={isLocked}
                      onClick={() => pickFolder(r.path)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        border: 'none',
                        borderTop: '1px solid #26221e',
                        background: selected ? '#26201a' : '#1b1815',
                        color: isLocked ? '#6e665e' : '#e8e0d5',
                        cursor: isLocked ? 'not-allowed' : 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <span style={{ width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${selected ? '#e68a2e' : '#4a433b'}`, background: selected ? '#e68a2e' : 'transparent', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.path}>
                        {shortenHomePath(r.path) ?? r.path}
                      </span>
                      <span style={{ ...tag, color: r.kind === 'git' ? '#5fd08c' : '#8c8379' }}>
                        {r.kind === 'git' ? `Git ${r.branch ?? 'detached'}` : r.kind === 'folder' ? 'Folder' : 'Missing'}
                      </span>
                      <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: isLocked ? '#e07a72' : '#8c8379', minWidth: 78, textAlign: 'right' }}>
                        {isLocked ? `Floor ${r.lockedByFloor}` : 'Available'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(40, 180, 99, 0.10)', border: '1px solid rgba(40, 180, 99, 0.3)', color: '#7fd9a3', fontFamily: 'var(--cth-font-mono)', fontSize: 11, lineHeight: 1.45 }}>
              <strong>Single-folder-per-floor lock:</strong> each folder (and anything nested in it) can belong to only one floor, so floors never collide.
            </div>
          </section>

          {/* Squad */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={sectionLabel}>STARTING SQUAD</span>
              <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 10.5, color: '#e68a2e' }}>{def.members.length} agent{def.members.length === 1 ? '' : 's'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {FLOOR_SQUADS.map((s) => {
                const on = s.id === squad;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSquad(s.id)}
                    style={{
                      textAlign: 'left',
                      padding: 10,
                      borderRadius: 8,
                      border: on ? '1.5px solid #e68a2e' : '1px solid #302b26',
                      background: on ? '#26201a' : '#1b1815',
                      color: '#e8e0d5',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}
                  >
                    <span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 700 }}>{s.title}</span>
                    <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 10.5, color: '#8c8379', lineHeight: 1.35 }}>{s.blurb}</span>
                    <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 9.5, color: on ? '#e68a2e' : '#6e665e', marginTop: 2 }}>{on ? '● SELECTED' : s.tagline}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ ...card, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 18, minHeight: 74, flexWrap: 'wrap' }}>
              {def.members.map((m) => (
                <div key={m.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }} title={m.role}>
                  <SpritePortrait character={m.character} scale={1.5} />
                  <div style={{ width: 34, height: 4, borderRadius: 2, background: 'linear-gradient(90deg, #6e4726 0%, #9c6738 50%, #6e4726 100%)' }} />
                  <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 8.5, color: '#8c8379' }}>{m.label}</span>
                </div>
              ))}
            </div>
          </section>

          {error && <div role="alert" style={{ color: '#e07a72', fontFamily: 'var(--cth-font-ui)', fontSize: 12.5 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid #2b2621', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 10, color: '#6e665e', flex: 1 }}>ONE LICENCE · ONE MACHINE</span>
          <button type="button" onClick={onClose} style={secondaryBtn}>Cancel <span style={kbd}>Esc</span></button>
          <button
            type="button"
            disabled={!canOpen}
            onClick={() => void submit()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #f5a646',
              background: canOpen ? 'linear-gradient(180deg, #ea8d2a 0%, #c96d12 100%)' : '#3a332c',
              color: canOpen ? '#1b140d' : '#8c8379',
              fontFamily: 'var(--cth-font-ui)',
              fontSize: 13,
              fontWeight: 700,
              cursor: canOpen ? 'pointer' : 'not-allowed'
            }}
          >
            {busy ? 'Opening…' : `Open Floor ${floorNumber} →`} <span style={{ ...kbd, background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.25)', color: 'inherit' }}>Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const tag: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  background: '#27231f',
  border: '1px solid #3d3730',
  color: '#b8aea1',
  fontFamily: 'var(--cth-font-mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  whiteSpace: 'nowrap'
};

const sectionLabel: React.CSSProperties = {
  fontFamily: 'var(--cth-font-mono)',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.6,
  color: '#a89f93'
};

const card: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: '1px solid #2e2924',
  background: '#1b1815'
};

const input: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid #3a342d',
  background: '#14110f',
  color: '#f2ece4',
  fontFamily: 'var(--cth-font-mono)',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box'
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #3d3730',
  background: '#27231f',
  color: '#d6cec2',
  cursor: 'pointer',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 12.5,
  fontWeight: 600,
  whiteSpace: 'nowrap'
};

const closeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid #332e29',
  background: '#221f1c',
  color: '#a89f93',
  cursor: 'pointer'
};

const kbd: React.CSSProperties = {
  marginLeft: 4,
  padding: '1px 6px',
  borderRadius: 4,
  background: '#1c1917',
  border: '1px solid #3d3730',
  fontFamily: 'var(--cth-font-mono)',
  fontSize: 10,
  color: '#8c8379'
};
