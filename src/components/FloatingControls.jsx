import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { exportToPng, exportToSvg } from '../utils/exportGraph';
import { useTaxStore } from '../store/taxStore';
import { PRESETS } from '../utils/presets';
import { encodeStateToHash, clearHash } from '../utils/urlState';

export default function FloatingControls() {
  const { getNodes, fitView } = useReactFlow();
  const { showExportMenu, setShowExportMenu, showPresetsMenu, setShowPresetsMenu, loadScenario, clearDocuments, documents, filingStatus, overrides } = useTaxStore();
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef(null);
  const presetsMenuRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // Sync state to URL hash whenever documents/filingStatus/overrides change.
  useEffect(() => {
    if (documents.length === 0) {
      clearHash();
    } else {
      encodeStateToHash(documents, filingStatus, overrides);
    }
  }, [documents, filingStatus, overrides]);

  useEffect(() => {
    if (!showExportMenu) return;
    function handleClick(e) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showExportMenu]);

  useEffect(() => {
    if (!showPresetsMenu) return;
    function handleClick(e) {
      if (presetsMenuRef.current && !presetsMenuRef.current.contains(e.target)) setShowPresetsMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPresetsMenu]);

  const [showAbout, setShowAbout] = useState(false);
  const [showLimitations, setShowLimitations] = useState(false);
  const isMobile = window.innerWidth < 480;
  const [showMobileWarning, setShowMobileWarning] = useState(isMobile);
  const disclaimerSeen = () => {
    const match = document.cookie.match(/(?:^|;\s*)disclaimer_seen=([^;]*)/);
    return match ? Date.now() - parseInt(match[1], 10) < 60 * 24 * 60 * 60 * 1000 : false;
  };
  const [showDisclaimer, setShowDisclaimer] = useState(!isMobile && !disclaimerSeen());

  const btnStyle = {
    padding: '6px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    background: 'white',
    color: '#334155',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  };

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        padding: '6px 8px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}>
        <button style={{ ...btnStyle, color: '#6366f1' }} onClick={() => setShowAbout(true)}>About</button>
        <button style={{ ...btnStyle, color: '#6366f1' }} onClick={() => setShowLimitations(true)}>Limitations</button>
        <div style={{ width: 1, height: 16, background: '#e2e8f0', flexShrink: 0 }} />
        <button style={{ ...btnStyle, color: '#6366f1' }} onClick={() => {
          navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}>{copied ? '✓ Copied!' : 'Copy link'}</button>
        <div ref={exportMenuRef} style={{ position: 'relative' }}>
          <button style={{ ...btnStyle, color: '#6366f1' }} onClick={() => setShowExportMenu(m => !m)}>Export</button>
          {showExportMenu && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              minWidth: 100,
            }}>
              {[['PNG', exportToPng], ['SVG', exportToSvg]].map(([label, fn]) => (
                <button key={label} disabled={exporting} style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 16px',
                  background: 'white',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#334155',
                  cursor: 'pointer',
                  textAlign: 'left',
                }} onClick={async () => {
                  setShowExportMenu(false);
                  setExporting(true);
                  try { await fn(getNodes()); } finally { setExporting(false); }
                }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: 1, height: 16, background: '#e2e8f0', flexShrink: 0 }} />
        <div ref={presetsMenuRef} style={{ position: 'relative' }}>
          <button style={{ ...btnStyle, color: '#6366f1' }} onClick={() => setShowPresetsMenu(m => !m)}>Examples</button>
          {showPresetsMenu && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 6px)',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              minWidth: 220,
            }}>
              {PRESETS.map(preset => (
                <button key={preset.name} style={{
                  display: 'block',
                  width: '100%',
                  padding: '9px 16px',
                  background: 'white',
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#334155',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderBottom: '1px solid #f1f5f9',
                }} onClick={() => {
                  loadScenario(preset);
                  setShowPresetsMenu(false);
                  setTimeout(() => fitView({ padding: 0.12, duration: 500 }), 50);
                }}>
                  <div>{preset.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginTop: 1 }}>{preset.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button style={{ ...btnStyle, color: '#ef4444' }} onClick={() => { clearDocuments(); clearHash(); }}>Clear</button>
      </div>

      {showMobileWarning && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            padding: '32px 32px 24px',
            maxWidth: 320,
            width: '90%',
          }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              Better on a larger screen
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
              This site is best viewed on tablet or desktop.
            </p>
            <button
              onClick={() => { setShowMobileWarning(false); if (!disclaimerSeen()) setShowDisclaimer(true); }}
              style={{
                padding: '8px 20px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}

      {showDisclaimer && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            padding: '32px 32px 24px',
            maxWidth: 380,
            width: '90%',
          }}>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
              Do not use this tool to file or calculate your taxes! It is in no way guaranteed to be complete or accurate. It is a fun visualization tool only.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  document.cookie = `disclaimer_seen=${Date.now()};max-age=${60 * 24 * 60 * 60};path=/`;
                  setShowDisclaimer(false);
                }}
                style={{
                  padding: '8px 20px',
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showAbout && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowAbout(false)}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            padding: '32px 32px 24px',
            maxWidth: 380,
            width: '90%',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
              Taxes are Beautiful
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
              A project by Gerry Chu
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
              Send feedback or bugs to <a href="mailto:gerry@gerrychu.com" style={{ color: '#6366f1' }}>gerry@gerrychu.com</a>
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <a
                href="https://www.buymeacoffee.com/gerrychu"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                  alt="Buy Me A Coffee"
                  style={{ height: 40, width: 145, borderRadius: 8 }}
                />
              </a>
              <button
                onClick={() => setShowAbout(false)}
                style={{
                  padding: '8px 20px',
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLimitations && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowLimitations(false)}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            padding: '32px 32px 24px',
            maxWidth: 570,
            width: '90%',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>
              Limitations
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#475569', lineHeight: 1.6 }}>
              Do not use this tool to file or calculate your taxes! It is in no way guaranteed to be complete or accurate. It is a fun visualization tool only.
            </p>
            <div style={{ display: 'flex', gap: 24, margin: '0 0 24px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>It should support:</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#475569', lineHeight: 1.8, listStyleType: 'disc' }}>
                  <li>Single and married filing jointly</li>
                  <li>Income tax, ordinary and preferred</li>
                  <li>Social security tax, overpayments</li>
                  <li>Medicare tax</li>
                  <li>W-2 withholdings</li>
                  <li>Ordinary dividends (qualified and non-qualified)</li>
                  <li>Section 199A dividends</li>
                  <li>QBI, subject to cap</li>
                  <li>Short and long term cap gains and deduction cap</li>
                  <li>Capital loss carryovers, previous and next year</li>
                  <li>Student loan interest, subject to MAGI phaseout</li>
                  <li>Mortgage interest, subject to debt cap</li>
                  <li>Property taxes, subject to cap</li>
                  <li>Other state and local taxes, subject to cap</li>
                  <li>Charitable donations, subject to cap</li>
                </ul>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#0f172a' }}>It does not support:</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#475569', lineHeight: 1.8, listStyleType: 'disc' }}>
                  <li>Kids and other dependents</li>
                  <li>Earned income tax credit</li>
                  <li>AMT</li>
                  <li>NIIT</li>
                  <li>Estimated tax</li>
                  <li>Rentals</li>
                  <li>Businesses</li>
                  <li>Everything else</li>
                </ul>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setShowLimitations(false)}
              style={{
                padding: '8px 20px',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
