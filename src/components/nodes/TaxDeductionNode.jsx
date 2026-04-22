import { Handle, Position } from '@xyflow/react';
import { formatCurrency } from '../../utils/format';

export default function TaxDeductionNode({ data, id }) {
  const { label, itemizedTotal, standardDeduction, deductionType, hasOverride, onOverrideClick, overrideKey } = data;

  return (
    <div className="tax-node" style={{ minWidth: 190 }}>
      <div className="tax-node-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        {hasOverride && (
          <button
            onClick={() => onOverrideClick?.(overrideKey, id)}
            style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
            title="Override options"
          >
            📊
          </button>
        )}
      </div>
      <div style={{ padding: '6px 12px 10px' }}>
        <div style={{ marginBottom: 6 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            borderRadius: 5,
            background: deductionType === 'itemized' ? '#eff6ff' : 'transparent',
            border: deductionType === 'itemized' ? '1px solid #bfdbfe' : '1px solid transparent',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 12, color: deductionType === 'itemized' ? '#1d4ed8' : '#64748b', fontWeight: deductionType === 'itemized' ? 600 : 400 }}>
              Itemized {deductionType === 'itemized' ? '✓' : ''}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: deductionType === 'itemized' ? '#1d4ed8' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(itemizedTotal)}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            borderRadius: 5,
            background: deductionType === 'standard' ? '#f0fdf4' : 'transparent',
            border: deductionType === 'standard' ? '1px solid #bbf7d0' : '1px solid transparent',
          }}>
            <span style={{ fontSize: 12, color: deductionType === 'standard' ? '#15803d' : '#64748b', fontWeight: deductionType === 'standard' ? 600 : 400 }}>
              Standard {deductionType === 'standard' ? '✓' : ''}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: deductionType === 'standard' ? '#15803d' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrency(standardDeduction)}
            </span>
          </div>
        </div>
      </div>
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
