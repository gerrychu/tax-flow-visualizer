import { Handle, Position } from '@xyflow/react';
import { formatCurrency } from '../../utils/format';

export default function TaxBracketNode({ data }) {
  const { label, rate, income, tax, rangeFrom, rangeTo, dimmed, hideInBracket, hideKeep, displayAmount, ordinaryIncome, isOrdinary } = data;

  const rateLabel = `${Math.round(rate * 100)}%`;
  const rangeLabel = rangeTo === Infinity
    ? `$${rangeFrom.toLocaleString()}+`
    : `$${rangeFrom.toLocaleString()}-${rangeTo.toLocaleString()}`;
  const headerLabel = label || `${rateLabel} ${isOrdinary ? 'Ord' : 'Pref'} BKT`;

  return (
    <div
      className={`tax-node relative ${dimmed ? 'opacity-40' : ''}`}
      style={{ minWidth: 190 }}
    >
      <div className="tax-node-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{headerLabel}</span>
        {!hideInBracket && (
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>
            {rangeLabel}
          </span>
        )}
      </div>
      <div className="tax-node-amount">{formatCurrency(displayAmount !== undefined ? displayAmount : income)}</div>
      {ordinaryIncome !== undefined && (
        <div style={{ padding: '0 12px 4px', fontSize: 11, color: '#94a3b8', marginTop: -6 }}>Preferential income in bkt</div>
      )}
      {!hideInBracket && (
        <div className="tax-node-rows">
          {ordinaryIncome !== undefined && (
            <div className="tax-node-row">
              <span className="label">Ordinary inc in bkt</span>
              <span className="value">{formatCurrency(ordinaryIncome)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="tax-node-row">
              <span className="label">Tax</span>
              <span className="value">{formatCurrency(tax)}</span>
            </div>
          )}
          {!hideKeep && (income - tax) > 0 && (
            <div className="tax-node-row">
              <span className="label">Keep</span>
              <span className="value">{formatCurrency(income - tax)}</span>
            </div>
          )}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#94a3b8', width: 8, height: 8, border: '2px solid white' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#94a3b8', width: 8, height: 8, border: '2px solid white' }}
      />
    </div>
  );
}
