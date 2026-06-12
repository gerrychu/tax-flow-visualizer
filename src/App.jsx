import { useState } from 'react';
import SourceDocPanel from './components/SourceDocPanel';
import TaxCanvas from './components/TaxCanvas';
import SummaryPanel from './components/SummaryPanel';

export const LEFT_PANEL_WIDTH = 220;

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      <SourceDocPanel
        width={LEFT_PANEL_WIDTH}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div style={{
        marginLeft: sidebarOpen ? LEFT_PANEL_WIDTH : 0,
        transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        minWidth: 0,
        flex: 1,
        height: '100vh',
        position: 'relative',
      }}>
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              position: 'absolute', top: 12, left: 12, zIndex: 150,
              padding: '6px 12px',
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ▶ Forms
          </button>
        )}
        <TaxCanvas />
        <SummaryPanel />
      </div>
    </div>
  );
}
