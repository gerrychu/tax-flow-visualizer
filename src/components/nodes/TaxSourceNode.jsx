import { Handle, Position } from '@xyflow/react';
import { formatCurrency } from '../../utils/format';

export default function TaxSourceNode({ data }) {
  const { label, rows = [], highlighted } = data;

  return (
    <div
      className={`tax-node ${highlighted ? 'highlighted' : ''}`}
      style={{ minWidth: 190 }}
    >
      <div className="tax-node-header" style={{ color: '#475569' }}>{label}</div>
      <div className="tax-node-rows">
        {rows.map((row, i) => (
          <div key={i} className="tax-node-row">
            <span className="label">{row.label}</span>
            <span className="value">{row.value}</span>
          </div>
        ))}
      </div>
      {data.rowHandles ? (
        data.rowHandles.map(({ id, rowIndex }) => (
          <Handle
            key={id}
            id={id}
            type="source"
            position={Position.Right}
            style={{ background: '#94a3b8', width: 8, height: 8, border: '2px solid white', top: 46 + rowIndex * 22 }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#94a3b8', width: 8, height: 8, border: '2px solid white' }}
        />
      )}
    </div>
  );
}
