import { useEffect, useRef } from 'react';
import { useTaxStore } from '../store/taxStore';

const OVERRIDE_CONFIGS = {
  'deduction.choice': {
    title: 'Deduction method',
    options: [
      { value: 'auto', label: 'Auto (take larger)' },
      { value: 'standard', label: 'Force standard deduction' },
      { value: 'itemized', label: 'Force itemized deduction' },
    ],
  },
  'deduction.mortgageCap': {
    title: 'Mortgage interest $750k loan limit',
    options: [
      { value: 'apply', label: 'Apply $750k limit (uses origination date)' },
      { value: 'ignore', label: 'Ignore limit' },
    ],
  },
  'deduction.saltCap': {
    title: 'SALT $10,000 cap on real estate taxes',
    options: [
      { value: 'apply', label: 'Apply $10,000 SALT cap' },
      { value: 'ignore', label: 'Ignore SALT cap' },
    ],
  },
  'deduction.charitableCap': {
    title: 'Charitable donation 60% AGI cap',
    options: [
      { value: 'apply', label: 'Apply 60% AGI cap' },
      { value: 'ignore', label: 'Ignore cap' },
    ],
  },
  'schedD.stCapLoss': {
    title: 'Schedule D ST capital loss',
    options: [
      { value: 'apply', label: 'Apply $3,000 loss cap (default)' },
      { value: 'ignore', label: 'Ignore $3,000 cap' },
    ],
  },
  'ltcg.rateOverride': {
    title: 'LTCG rate override',
    options: [
      { value: '', label: 'Auto (0% / 15% / 20% based on income)' },
      { value: '0', label: 'Force 0% rate' },
      { value: '0.15', label: 'Force 15% rate' },
      { value: '0.20', label: 'Force 20% rate' },
    ],
  },
};

export default function OverridePopover({ overrideKey, anchorPos, onClose }) {
  const { overrides, setOverride, computed } = useTaxStore();
  const ref = useRef(null);
  const config = OVERRIDE_CONFIGS[overrideKey];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 0);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (!config) return null;

  const DEFAULTS = { 'ltcg.rateOverride': '', 'deduction.choice': 'auto' };
  const currentValue = overrides[overrideKey] ?? (DEFAULTS[overrideKey] ?? 'apply');

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: anchorPos.y,
        left: anchorPos.x,
        zIndex: 9999,
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        minWidth: 280,
        padding: 4,
      }}
    >
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{config.title}</div>
        {overrideKey === 'deduction.choice' && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Itemized: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(computed.itemizedTotal)} ·
            Standard: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(computed.standardDeduction)}
          </div>
        )}
        {overrideKey === 'deduction.charitableCap' && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            AGI: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(computed.agi)} · Cap: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(computed.charitableCap)}
          </div>
        )}
        {overrideKey === 'ltcg.rateOverride' && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            LTCG income: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(computed.ltcgForPreferential)}
          </div>
        )}
      </div>
      <div style={{ padding: '4px 0' }}>
        {config.options.map(opt => {
          const isSelected = currentValue === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => {
                setOverride(overrideKey, opt.value);
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 14px',
                textAlign: 'left',
                fontSize: 13,
                color: isSelected ? '#6366f1' : '#334155',
                background: isSelected ? '#eef2ff' : 'none',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 6,
                fontWeight: isSelected ? 600 : 400,
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'none'; }}
            >
              <span style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: `2px solid ${isSelected ? '#6366f1' : '#cbd5e1'}`,
                background: isSelected ? '#6366f1' : 'white',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isSelected && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'white' }} />}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
