import SourceDocPanel from './components/SourceDocPanel';
import TaxCanvas from './components/TaxCanvas';
import SummaryPanel from './components/SummaryPanel';

export const LEFT_PANEL_WIDTH = 220;

export default function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      {/* Left panel — fixed */}
      <SourceDocPanel width={LEFT_PANEL_WIDTH} />

      {/* Right panel — canvas */}
      <div style={{
        marginLeft: LEFT_PANEL_WIDTH,
        minWidth: 0,
        flex: 1,
        height: '100vh',
        position: 'relative',
      }}>
        <TaxCanvas />
        <SummaryPanel />
      </div>
    </div>
  );
}
