import React, { useEffect } from 'react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAVY    = '#143A63';
const WHITE   = '#FFFFFF';
const RED     = '#DC2626';
const RED_BG  = '#FEF2F2';
const RED_BDR = '#FECACA';

// ─── Inject keyframe animation once ──────────────────────────────────────────
if (typeof document !== 'undefined') {
  const id = 'confirm-modal-kf';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes confirmModalIn {
        from { opacity:0; transform:scale(0.92) translateY(6px); }
        to   { opacity:1; transform:scale(1)    translateY(0);   }
      }
      .confirm-modal-in {
        animation: confirmModalIn 0.18s cubic-bezier(0.22,1,0.36,1) both;
      }
    `;
    document.head.appendChild(s);
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ConfirmModalProps {
  /** Main body text shown in the modal. */
  message:       string;
  /** Label for the confirm button (defaults to "Confirm"). */
  confirmLabel?: string;
  /** Label for the cancel button (defaults to "Cancel"). */
  cancelLabel?:  string;
  /** Optional short title shown in the header (defaults to the app name). */
  title?:        string;
  /** When true the confirm button uses red danger styling. */
  danger?:       boolean;
  onConfirm:     () => void;
  onCancel:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ConfirmModal({
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  title,
  danger       = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onCancel]);

  const confirmBg    = danger ? RED     : NAVY;
  const confirmColor = WHITE;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.52)',
        zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 20px', boxSizing: 'border-box',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="confirm-modal-in"
        style={{
          maxWidth: 380, width: '100%',
          backgroundColor: WHITE,
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 20px 56px rgba(0,0,0,0.30)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          backgroundColor: danger ? RED : NAVY,
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: WHITE, letterSpacing: 0.1 }}>
            {title ?? 'Grade & Elevation Calculator'}
          </span>
          <button
            onClick={onCancel}
            aria-label="Close"
            style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.75)',
              fontSize: 20, cursor: 'pointer',
              padding: '2px 4px', lineHeight: 1,
            }}
          >✕</button>
        </div>

        {/* ── Body ── */}
        <div style={{
          padding: '20px 20px 8px',
          backgroundColor: danger ? RED_BG : WHITE,
        }}>
          <p style={{
            margin: 0,
            fontSize: 14, lineHeight: 1.55,
            color: danger ? '#7F1D1D' : '#1F2937',
            whiteSpace: 'pre-wrap',
          }}>
            {message}
          </p>
        </div>

        {/* ── Actions ── */}
        <div style={{
          display: 'flex', gap: 10,
          padding: '14px 20px 18px',
          backgroundColor: danger ? RED_BG : WHITE,
        }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              height: 44, borderRadius: 10,
              border: `1px solid ${danger ? RED_BDR : '#D1D5DB'}`,
              backgroundColor: WHITE,
              fontSize: 14, fontWeight: 700,
              color: danger ? RED : '#374151',
              cursor: 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              height: 44, borderRadius: 10,
              border: 'none',
              backgroundColor: confirmBg,
              fontSize: 14, fontWeight: 700,
              color: confirmColor,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
