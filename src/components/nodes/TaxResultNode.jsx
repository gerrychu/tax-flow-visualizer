import { Handle, Position } from '@xyflow/react';
import { formatCurrency } from '../../utils/format';

export default function TaxResultNode({ data }) {
  const { label, amount, isRefund, isKeep, rows = [] } = data;

  const color = isKeep ? '#15803d' : isRefund ? '#15803d' : '#dc2626';
  const bg = isKeep ? '#f0fdf4' : isRefund ? '#f0fdf4' : '#fef2f2';
  const border = isKeep ? '#bbf7d0' : isRefund ? '#bbf7d0' : '#fecaca';

  return (
    <div
      className="tax-node"
      style={{ minWidth: 190, border: `1.5px solid ${border}`, background: bg }}
    >
      <div className="tax-node-header" style={{ color: color, borderBottom: `1px solid ${border}` }}>
        {label}
      </div>
      <div className="tax-node-amount" style={{ color }}>
        {isRefund && !isKeep ? '+' : ''}{formatCurrency(amount)}
      </div>
      {rows.length > 0 && (
        <div className="tax-node-rows">
          {rows.map((row, i) => (
            <div key={i} className="tax-node-row">
              <span className="label">{row.label}</span>
              <span className="value">{row.value}</span>
            </div>
          ))}
        </div>
      )}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#94a3b8', width: 8, height: 8, border: '2px solid white' }}
      />
    </div>
  );
}
