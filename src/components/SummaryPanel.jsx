import { useState } from 'react';
import { useTaxStore } from '../store/taxStore';
import { formatCurrency } from '../utils/format';

function Row({ label, value, color, bold, border }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '4px 0',
      borderTop: border ? '1px solid #f1f5f9' : 'none',
    }}>
      <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{
        fontSize: bold ? 14 : 12,
        fontWeight: bold ? 700 : 500,
        color: color || '#334155',
        fontVariantNumeric: 'tabular-nums',
        marginLeft: 12,
      }}>
        {value}
      </span>
    </div>
  );
}

export default function SummaryPanel() {
  const { computed } = useTaxStore();
  const [expanded, setExpanded] = useState(false);

  const totalIncome = computed.totalOrdinaryIncome + Math.max(0, computed.ltcgForPreferential || 0);

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      zIndex: 200,
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      minWidth: 220,
    }}>
      {/* Header / toggle */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: expanded ? '1px solid #f1f5f9' : 'none',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Summary
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '4px 14px 12px' }}>
          <Row label="Total income" value={formatCurrency(totalIncome)} />
          <Row label={`Deduction (${computed.deductionType || 'standard'})`} value={formatCurrency(computed.deductionUsed)} />
          <Row label="Taxable income" value={formatCurrency(computed.taxableIncome + Math.max(0, computed.ltcgForPreferential || 0))} />
          <Row label="Ordinary income tax" value={formatCurrency(computed.ordinaryTax)} border />
          {computed.prefTax > 0 && <Row label="Preferential inc tax" value={formatCurrency(computed.prefTax)} />}
          <Row label="Total income tax" value={formatCurrency(computed.totalTax)} bold border />
          {computed.totalSsTax > 0 && <Row label="Social Security tax" value={formatCurrency(computed.totalSsTax)} />}
          {computed.totalMedTax > 0 && <Row label="Medicare tax" value={formatCurrency(computed.totalMedTax)} />}
          {(computed.totalSsTax > 0 || computed.totalMedTax > 0) && (
            <Row label="Total taxes" value={formatCurrency(computed.totalAllTaxes)} bold border />
          )}
          {totalIncome > 0 && (
            <Row label="All-in effective tax rate" value={`${((computed.totalAllTaxes / totalIncome) * 100).toFixed(1)}%`} />
          )}
          <Row label="Total withheld" value={formatCurrency(computed.totalWithheld)} border />
          {computed.adjustedIsRefund
            ? <Row label="Refund" value={formatCurrency(Math.abs(computed.adjustedRefundOrOwed))} color="#15803d" bold />
            : <Row label="Amount owed" value={formatCurrency(Math.abs(computed.adjustedRefundOrOwed))} color="#dc2626" bold />
          }
        </div>
      )}
    </div>
  );
}
