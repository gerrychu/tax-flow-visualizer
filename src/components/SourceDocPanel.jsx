import { useState, useRef, useEffect } from 'react';
import { useTaxStore, DOC_FIELDS, DOC_TYPE_ORDER } from '../store/taxStore';

const DOC_TYPE_LABELS = {
  'W-2': 'W-2',
  '1099-INT': '1099-INT',
  '1099-DIV': '1099-DIV',
  '1099-B': '1099-B',
  'Capital loss carryover': 'Capital loss carryover',
  'Other taxable income': 'Other taxable income',
  'Adjustments to income': 'Adjustments to income',
  '1098-E': '1098-E Student loan',
  '1098': '1098 Mortgage interest',
  'State and local taxes': 'State & local tax',
  'Charitable donation': 'Charitable donation',
};

const SINGLE_INSTANCE_TYPES = new Set(['Capital loss carryover']);
const NO_NOTE_TYPES = new Set(['W-2']);

const NOTE_PLACEHOLDERS = {
  'W-2': 'Acme Corp - Jane',
  '1098': '123 Main St - Fannie Mae',
  'State and local taxes': 'State income tax / sales tax',
  'Charitable donation': 'Charity name',
  '1099-B': 'Investment',
  'Adjustments to income': 'Trad IRA contrib & HSA contrib, self-employment tax & health insurance',
  '1098-E': 'Student loan company',
};

// Parse accounting-notation input: "(5000)" → "-5000", strips commas
function parseRawInput(s) {
  const trimmed = s.trim();
  const parenMatch = trimmed.match(/^\(([0-9.]*)\)$/);
  if (parenMatch) return parenMatch[1] ? `-${parenMatch[1]}` : '';
  return trimmed;
}

function CurrencyInput({ value, onChange, placeholder = '0', allowNegative = false, forceNegative = false }) {
  const [raw, setRaw] = useState(value !== '' ? value : '');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!focused) setRaw(value !== '' ? value : '');
  }, [value, focused]);

  const numVal = parseFloat(raw);
  const display = focused
    ? raw
    : (raw !== '' && !isNaN(numVal)
        ? numVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '');

  function handleBlur() {
    setFocused(false);
    let parsed = parseRawInput(raw);
    if (forceNegative && parsed !== '' && parsed !== '-') {
      const n = parseFloat(parsed);
      if (!isNaN(n) && n > 0) parsed = String(-n);
    }
    setRaw(parsed);
    onChange(parsed);
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: 8, color: '#94a3b8', fontSize: 13, pointerEvents: 'none' }}>$</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') inputRef.current?.blur();
        }}
        onChange={e => {
          const v = allowNegative
            ? e.target.value.replace(/[^0-9.()-]/g, '')
            : e.target.value.replace(/[^0-9.]/g, '');
          setRaw(v);
        }}
        style={{
          width: '100%',
          padding: '5px 8px 5px 20px',
          border: '1px solid #e2e8f0',
          borderRadius: 5,
          fontSize: 13,
          color: '#0f172a',
          background: 'white',
          outline: 'none',
          fontVariantNumeric: 'tabular-nums',
        }}
        onFocusCapture={e => {
          e.target.style.borderColor = '#6366f1';
          e.target.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.15)';
        }}
        onBlurCapture={e => {
          e.target.style.borderColor = '#e2e8f0';
          e.target.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}

function DocumentCard({ doc, focusNote, onFocusHandled }) {
  const { updateDocument, deleteDocument, setFocusedDoc, focusedDocId, expandToDocId, clearExpandToDoc } = useTaxStore();
  const [collapsed, setCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const cardRef = useRef(null);
  const noteInputRef = useRef(null);
  const isFocused = focusedDocId === doc.id;

  useEffect(() => {
    if (focusNote) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      noteInputRef.current?.focus();
      onFocusHandled?.();
    }
  }, [focusNote]);

  useEffect(() => {
    if (expandToDocId === doc.id) {
      setCollapsed(false);
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      clearExpandToDoc();
    }
  }, [expandToDocId]);

  const fields = DOC_FIELDS[doc.type] || [];

  useEffect(() => {
    function handleClick(e) {
      if (contextMenu && cardRef.current && !cardRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  function handleContextMenu(e) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function handleDelete() {
    deleteDocument(doc.id);
    setContextMenu(null);
  }

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setFocusedDoc(doc.id)}
      onMouseLeave={() => setFocusedDoc(null)}
      style={{
        background: 'white',
        border: isFocused ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'visible',
        boxShadow: isFocused ? '0 0 0 3px rgba(99,102,241,0.1)' : '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Header */}
      <div
        onContextMenu={handleContextMenu}
        onClick={() => setCollapsed(c => !c)}
        style={{
          padding: '8px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid #f1f5f9',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
          {DOC_TYPE_LABELS[doc.type]}
          {doc.note ? ` — ${doc.note}` : ''}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 9999,
            minWidth: 120,
          }}
        >
          <button
            onClick={handleDelete}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 14px',
              textAlign: 'left',
              fontSize: 13,
              color: '#dc2626',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 6,
            }}
            onMouseEnter={e => e.target.style.background = '#fef2f2'}
            onMouseLeave={e => e.target.style.background = 'none'}
          >
            Delete
          </button>
        </div>
      )}

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: '8px 10px 10px' }}>
          {/* Note field — hidden for types that don't use it */}
          {!SINGLE_INSTANCE_TYPES.has(doc.type) && !NO_NOTE_TYPES.has(doc.type) && <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>Note</label>
            <input
              ref={noteInputRef}
              type="text"
              value={doc.note}
              onChange={e => updateDocument(doc.id, { note: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
              placeholder={NOTE_PLACEHOLDERS[doc.type] || ''}
              style={{
                width: '100%',
                padding: '5px 8px',
                border: '1px solid #e2e8f0',
                borderRadius: 5,
                fontSize: 12,
                color: '#334155',
                background: 'white',
                outline: 'none',
              }}
              onFocus={e => {
                e.target.style.borderColor = '#6366f1';
                e.target.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.15)';
              }}
              onBlur={e => {
                e.target.style.borderColor = '#e2e8f0';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>}

          {/* Fields */}
          {fields.map(field => (
            <div key={field.key} style={{ marginBottom: 7 }}>
              <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 3 }}>
                {field.label}
              </label>
              {field.type === 'text' ? (
                <input
                  type="text"
                  value={doc.fields[field.key] || ''}
                  onChange={e => updateDocument(doc.id, { fields: { [field.key]: e.target.value } })}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 5,
                    fontSize: 13,
                    color: '#334155',
                    background: 'white',
                    outline: 'none',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#6366f1';
                    e.target.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.15)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#e2e8f0';
                    e.target.style.boxShadow = 'none';
                  }}
                />
              ) : field.type === 'currency' ? (
                <CurrencyInput
                  value={doc.fields[field.key] || ''}
                  onChange={v => {
                    let val = v;
                    if (field.maxFromField) {
                      const max = parseFloat(doc.fields[field.maxFromField]) || 0;
                      const n = parseFloat(v);
                      if (!isNaN(n) && n > max) val = String(max);
                    }
                    updateDocument(doc.id, { fields: { [field.key]: val } });
                  }}
                  allowNegative={field.allowNegative || false}
                  forceNegative={field.forceNegative || false}
                />
              ) : field.type === 'date' ? (
                <input
                  type="date"
                  value={doc.fields[field.key] || ''}
                  onChange={e => updateDocument(doc.id, { fields: { [field.key]: e.target.value } })}
                  onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 5,
                    fontSize: 12,
                    color: '#334155',
                    background: 'white',
                    outline: 'none',
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SourceDocPanel({ width = 220 }) {
  const { documents, filingStatus, setFilingStatus, addDocument } = useTaxStore();
  const [showPicker, setShowPicker] = useState(false);
  const [newDocId, setNewDocId] = useState(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    }
    document.addEventListener('mousedown', handleClick, true);
    return () => document.removeEventListener('mousedown', handleClick, true);
  }, []);

  // Sort documents by type order, then by creation time
  const sortedDocs = [...documents].sort((a, b) => {
    const ai = DOC_TYPE_ORDER.indexOf(a.type);
    const bi = DOC_TYPE_ORDER.indexOf(b.type);
    if (ai !== bi) return ai - bi;
    return 0; // preserve insertion order within type
  });

  return (
    <div style={{
      width: width,
      height: '100vh',
      background: '#f8fafc',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      left: 0,
      top: 0,
      zIndex: 100,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 12px 12px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {/* Tax year */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Tax year</label>
          <select
            value="2025"
            readOnly
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              fontSize: 13,
              color: '#334155',
              background: 'white',
              cursor: 'default',
            }}
          >
            <option value="2025">2025</option>
          </select>
        </div>

        {/* Filing status */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Filing status</label>
          <select
            value={filingStatus}
            onChange={e => setFilingStatus(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              fontSize: 13,
              color: '#334155',
              background: 'white',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="single">Single</option>
            <option value="mfj">Married filing jointly</option>
          </select>
        </div>

        {/* Add document button */}
        <div style={{ position: 'relative' }} ref={pickerRef}>
          <button
            onClick={() => setShowPicker(v => !v)}
            style={{
              width: '100%',
              padding: '7px 10px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            + Enter a form
          </button>

          {showPicker && (
            <div style={{
              position: 'absolute',
              top: '110%',
              left: 0,
              right: 0,
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 200,
              overflow: 'hidden',
            }}>
              {DOC_TYPE_ORDER.map(type => {
                const disabled = SINGLE_INSTANCE_TYPES.has(type) && documents.some(d => d.type === type);
                const sectionHeader = type === 'W-2' ? 'Income' : type === 'Adjustments to income' ? 'Adjustments' : type === '1098' ? 'Deductions' : null;
                return (
                  <div key={type}>
                    {sectionHeader && (
                      <div style={{
                        padding: '6px 14px 3px',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#94a3b8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderTop: type === 'W-2' ? 'none' : '1px solid #f1f5f9',
                        marginTop: type === 'W-2' ? 0 : 4,
                      }}>
                        {sectionHeader}
                      </div>
                    )}
                    <button
                      onClick={() => { if (!disabled) { setNewDocId(addDocument(type)); setShowPicker(false); } }}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '9px 14px',
                        textAlign: 'left',
                        fontSize: 13,
                        color: disabled ? '#cbd5e1' : '#334155',
                        background: 'none',
                        border: 'none',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        borderBottom: '1px solid #f8fafc',
                      }}
                      onMouseEnter={e => { if (!disabled) e.target.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { e.target.style.background = 'none'; }}
                    >
                      {DOC_TYPE_LABELS[type] ?? type}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Document cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
        {sortedDocs.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '24px 0' }}>
            No forms yet.<br />Click "+ Enter a form" to start.
          </div>
        )}
        {sortedDocs.map(doc => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            focusNote={doc.id === newDocId}
            onFocusHandled={() => setNewDocId(null)}
          />
        ))}
      </div>
    </div>
  );
}
