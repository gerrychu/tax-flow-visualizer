import { Handle, Position } from '@xyflow/react';
import { formatCurrency } from '../../utils/format';

export default function TaxComputedNode({ data, id }) {
  const { label, subtitle, amount, rows = [], highlighted, hasOverride, overrideKey, onOverrideClick, dimmed } = data;

  return (
    <div
      className={`tax-node ${highlighted ? 'highlighted' : ''} ${dimmed ? 'opacity-40' : ''}`}
      style={{ minWidth: 190 }}
    >
      <div className="tax-node-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        {hasOverride && (
          <button
            onClick={() => onOverrideClick?.(overrideKey, id)}
            style={{
              fontSize: 13,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0 2px',
              lineHeight: 1,
            }}
            title="Override options"
          >
            📊
          </button>
        )}
      </div>
      <div className="tax-node-amount">{formatCurrency(amount)}</div>
      {subtitle && (
        <div style={{ padding: '0 12px 6px', fontSize: 11, color: '#94a3b8' }}>{subtitle}</div>
      )}
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
      {data.sourceHandles ? (
        data.sourceHandles.map(({ id }, i) => (
          <Handle
            key={id}
            id={id}
            type="source"
            position={Position.Right}
            style={{
              background: '#94a3b8',
              width: 8,
              height: 8,
              border: '2px solid white',
              top: `${(i + 1) * 100 / (data.sourceHandles.length + 1)}%`,
            }}
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
