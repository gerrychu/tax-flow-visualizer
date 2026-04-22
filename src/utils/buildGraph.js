import { formatCurrency } from './format';
import { nodeX, NODE_V_GAP, SPINE_CENTER_Y, ZONE_STARTS, Z2_START, SUB_COL_WIDTH, Z3_Z4_OFFSET, Z4_Z5_OFFSET } from './layout';

// Edge color palette
export const EDGE_COLORS = {
  wages: '#3b82f6',
  interest: '#06b6d4',
  dividend: '#0ea5e9',
  capitalGain: '#8b5cf6',
  capitalLoss: '#c4b5fd',
  deduction: '#14b8a6',
  'adjustment-deduction': '#10b981',
  bracket: '#f97316',
  keep: '#22c55e',
  withholding: '#14b8a6',
  ssMedicare: '#9b7ba8',
  ssMedicareWithholding: '#14b8a6',
  preferential: '#c026d3',
  ltcg: '#f59e0b',
  otherIncome: '#0ea5e9',
  adjustment: '#a78bfa',
  studentLoan: '#818cf8',
  ordFillingPref: '#bfdbfe',
};

let _edgeSeq = 0;
function eid() { return `e${++_edgeSeq}`; }

function makeEdge(id, source, target, color, amount = 0, opts = {}) {
  const { sourceHandle, targetHandle, ...dataOpts } = opts;
  return {
    id,
    source,
    target,
    type: 'taxSankey',
    ...(sourceHandle !== undefined && { sourceHandle }),
    ...(targetHandle !== undefined && { targetHandle }),
    data: { color, amount, ...dataOpts },
    style: { stroke: color },
  };
}

function makeNode(id, zone, subCol, type, data) {
  return {
    id,
    type,
    position: { x: nodeX(zone, subCol), y: 0 },
    data: { ...data, zone, subCol },
    draggable: true,
  };
}

function w2NodeLabel(doc) {
  const company = (doc.fields.company || '').trim().split(/\s+/)[0];
  const name = (doc.fields.employeeName || '').trim().split(/\s+/)[0];
  const parts = [company, name].filter(Boolean);
  return parts.length > 0 ? `W-2 — ${parts.join(' — ')}` : 'W-2';
}

function w2WhLabel(doc, fallback) {
  const company = (doc.fields.company || '').trim().split(/\s+/)[0];
  const suffix = company || fallback;
  return suffix ? `W-2 — Withholding — ${suffix}` : 'W-2 — Withholding';
}

// ─── Main graph builder ───────────────────────────────────────────────────────
export function buildGraph(documents, _filingStatus, _overrides, computed, focusedDocId) {
  _edgeSeq = 0;
  const nodes = [];
  const edges = [];

  const byType = {};
  for (const doc of documents) {
    if (!byType[doc.type]) byType[doc.type] = [];
    byType[doc.type].push(doc);
  }

  const w2s = byType['W-2'] || [];
  const int1099s = byType['1099-INT'] || [];
  const div1099s = byType['1099-DIV'] || [];
  const b1099s = byType['1099-B'] || [];
  const carryoverDocs = byType['Capital loss carryover'] || [];
  const otherIncomeDocs = byType['Other taxable income'] || [];
  const adjToIncomeDocs = byType['Adjustments to income'] || [];
  const stdLoanDocs = byType['1098-E'] || [];
  const mortgages = byType['1098'] || [];
  const saltDocs = byType['State and local taxes'] || [];
  const charities = byType['Charitable donation'] || [];

  const medWagesDocs = w2s.filter(d => (parseFloat(d.fields.box5) || 0) > 0);
  const totalMedWages = medWagesDocs.reduce((s, d) => s + (parseFloat(d.fields.box5) || 0), 0);
  const medWhgDocs = w2s.filter(d => (parseFloat(d.fields.box6) || 0) > 0);

  // ── ZONE 1: W-2 income nodes ─────────────────────────────────────────────
  let wagesSourceId = null;

  if (w2s.length === 1) {
    const doc = w2s[0];
    const box1 = parseFloat(doc.fields.box1) || 0;
    if (box1 > 0) {
      const nid = `w2-inc-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: w2NodeLabel(doc),
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [
          { label: 'Box 1 Wages', value: formatCurrency(doc.fields.box1) },
        ],
      }));
      wagesSourceId = nid;
    }
  } else if (w2s.length > 1) {
    const incIds = [];
    w2s.forEach((doc) => {
      const box1 = parseFloat(doc.fields.box1) || 0;
      if (box1 <= 0) return;
      const nid = `w2-inc-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: w2NodeLabel(doc),
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [
          { label: 'Box 1 Wages', value: formatCurrency(doc.fields.box1) },
        ],
      }));
      incIds.push({ nid, doc });
    });
    if (incIds.length > 0 && computed.w2Wages > 0) {
      const aggId = 'w2-wages-agg';
      nodes.push(makeNode(aggId, 2, 0, 'taxComputed', {
        label: 'Total wages',
        amount: computed.w2Wages,
        rows: [],
      }));
      incIds.forEach(({ nid, doc }) => {
        edges.push(makeEdge(eid(), nid, aggId, EDGE_COLORS.wages, parseFloat(doc.fields.box1) || 0, { tooltipLabel: 'W-2 wages' }));
      });
      wagesSourceId = incIds.length === 1 ? incIds[0].nid : aggId;
    } else if (incIds.length === 0) {
      wagesSourceId = null;
    }
  }

  // ── ZONE 1 (continued): 1099 income nodes ────────────────────────────────
  // Stacked below W-2 nodes in the same zone. Sub-columns: 0 = source nodes, 1 = agg nodes.
  // Order: 1099-INT, 1099-DIV, 1099-B (pushed after W-2s so assignYPositions stacks them below).

  // 1099-INT
  let interestSrcId = null;
  let intMultiIds = []; // for y-sync post-processing
  if (int1099s.length === 1) {
    const doc = int1099s[0];
    const nid = `int-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: doc.note ? `1099-INT — ${doc.note}` : '1099-INT',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [{ label: 'Line 1 Interest', value: formatCurrency(doc.fields.line1) }],
    }));
    interestSrcId = nid;
  } else if (int1099s.length > 1) {
    const ids = [];
    int1099s.forEach((doc, i) => {
      const nid = `int-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `1099-INT — ${doc.note}` : `1099-INT #${i + 1}`,
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Line 1 Interest', value: formatCurrency(doc.fields.line1) }],
      }));
      ids.push({ nid, doc });
    });
    intMultiIds = ids;
    // No zone-1 agg — sources connect directly to the zone-2 total-int node
  }

  // 1099-DIV — row handles: 'ord' (row 0) for ordinary divs → Schedule B, 'qual' (row 1) for qualified → LTCG
  // div-qual-agg lives in zone 2 subCol 0 (positioned by y-sync after assignYPositions)
  let divOrdSrcId = null;  // first source node id, used for Total ordinary dividends y-sync
  let divQualSrcId = null; // feeds LTCG tax — always the div-qual-agg node when qual divs > 0
  let divMultiIds = []; // for y-sync post-processing
  if (div1099s.length === 1) {
    const doc = div1099s[0];
    const nid = `div-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: doc.note ? `1099-DIV — ${doc.note}` : '1099-DIV',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [
        { label: 'Box 1a Ordinary dividends', value: formatCurrency(doc.fields.line1a) },
        { label: '\u00a0\u00a0\u00a0Non-qualified dividends', value: formatCurrency((doc.fields.line1a || 0) - (doc.fields.line1b || 0)) },
        { label: '\u00a0\u00a0\u00a0Box 1b Qualified dividends', value: formatCurrency(doc.fields.line1b) },
      ],
      rowHandles: [{ id: 'ord', rowIndex: 1 }, { id: 'qual', rowIndex: 2 }],
    }));
    divOrdSrcId = nid;
    if (computed.totalQualifiedDividends > 0) {
      const aggId = 'div-qual-agg';
      nodes.push(makeNode(aggId, 2, 0, 'taxComputed', {
        label: 'Total qualified dividends',
        amount: computed.totalQualifiedDividends,
        rows: [],
      }));
      edges.push(makeEdge(eid(), nid, aggId, EDGE_COLORS.dividend, computed.totalQualifiedDividends, { sourceHandle: 'qual', tooltipLabel: 'Qualified dividends' }));
      divQualSrcId = aggId;
    }
  } else if (div1099s.length > 1) {
    const ids = [];
    div1099s.forEach((doc, i) => {
      const nid = `div-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `1099-DIV — ${doc.note}` : `1099-DIV #${i + 1}`,
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [
          { label: 'Ordinary dividends', value: formatCurrency(doc.fields.line1a) },
          { label: '\u00a0\u00a0\u00a0Non-qualified dividends', value: formatCurrency((doc.fields.line1a || 0) - (doc.fields.line1b || 0)) },
          { label: '\u00a0\u00a0\u00a0Qualified dividends', value: formatCurrency(doc.fields.line1b) },
        ],
        rowHandles: [{ id: 'ord', rowIndex: 1 }, { id: 'qual', rowIndex: 2 }],
      }));
      ids.push({ nid, doc });
    });
    divMultiIds = ids;
    divOrdSrcId = ids[0]?.nid || null; // first source used for Total ordinary dividends y-sync only
    if (computed.totalQualifiedDividends > 0) {
      const aggId = 'div-qual-agg';
      nodes.push(makeNode(aggId, 2, 0, 'taxComputed', {
        label: 'Total qualified dividends',
        amount: computed.totalQualifiedDividends,
        rows: [],
      }));
      ids.forEach(({ nid, doc }) => {
        const amt = parseFloat(doc.fields.line1b) || 0;
        if (amt > 0) edges.push(makeEdge(eid(), nid, aggId, EDGE_COLORS.dividend, amt, { sourceHandle: 'qual', tooltipLabel: 'Qualified dividends' }));
      });
      divQualSrcId = aggId;
    }
  }

  // 1099-B — each source node has two row handles: 'st' (row 0) and 'lt' (row 1)
  // Single: handles go directly to Schedule D.
  // Multiple: 'st' handles fan into b-st-agg, 'lt' handles fan into b-lt-agg.
  let bStSrcId = null; // source for ST flow into Schedule D Line 7
  let bLtSrcId = null; // source for LT flow into Schedule D Line 15
  let bMultiIds = []; // for y-sync post-processing
  if (b1099s.length === 1) {
    const doc = b1099s[0];
    const nid = `b-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: doc.note ? `1099-B — ${doc.note}` : '1099-B',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [
        { label: 'Short-term gain/loss', value: formatCurrency(doc.fields.shortTerm) },
        { label: 'Long-term gain/loss', value: formatCurrency(doc.fields.longTerm) },
      ],
      rowHandles: [{ id: 'st', rowIndex: 0 }, { id: 'lt', rowIndex: 1 }],
    }));
    bStSrcId = nid;
    bLtSrcId = nid;
  } else if (b1099s.length > 1) {
    const ids = [];
    b1099s.forEach((doc, i) => {
      const nid = `b-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `1099-B — ${doc.note}` : `1099-B #${i + 1}`,
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [
          { label: 'Short-term gain/loss', value: formatCurrency(doc.fields.shortTerm) },
          { label: 'Long-term gain/loss', value: formatCurrency(doc.fields.longTerm) },
        ],
        rowHandles: [{ id: 'st', rowIndex: 0 }, { id: 'lt', rowIndex: 1 }],
      }));
      ids.push({ nid, doc });
    });
    bMultiIds = ids;
    // bStSrcId/bLtSrcId stay null — edges go directly from each source to Schedule D below
  }

  // Capital loss carryover — zone 1, subCol 0, below 1099-B nodes
  let carryoverSrcId = null;
  if (carryoverDocs.length > 0) {
    const doc = carryoverDocs[0];
    const nid = `carryover-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: 'Capital loss carryover',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [
        { label: 'Short-term loss', value: formatCurrency(doc.fields.shortTermLoss) },
        { label: 'Long-term loss', value: formatCurrency(doc.fields.longTermLoss) },
      ],
      rowHandles: [{ id: 'st', rowIndex: 0 }, { id: 'lt', rowIndex: 1 }],
    }));
    carryoverSrcId = nid;
  }

  // Other taxable income — zone 1, subCol 0, below capital loss carryover
  // Multiple docs get a total node in zone 2 subCol 0
  let otherIncomeSrcId = null;
  const otherIncomeMultiIds = [];
  if (otherIncomeDocs.length === 1) {
    const doc = otherIncomeDocs[0];
    const nid = `other-inc-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: doc.note ? `Other income — ${doc.note}` : 'Other taxable income',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [{ label: 'Amount', value: formatCurrency(doc.fields.amount) }],
    }));
    otherIncomeSrcId = nid;
  } else if (otherIncomeDocs.length > 1) {
    otherIncomeDocs.forEach((doc, i) => {
      const nid = `other-inc-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `Other income — ${doc.note}` : `Other income #${i + 1}`,
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Amount', value: formatCurrency(doc.fields.amount) }],
      }));
      otherIncomeMultiIds.push({ nid, doc });
    });
    if (computed.totalOtherIncome > 0) {
      const aggId = 'other-inc-agg';
      nodes.push(makeNode(aggId, 2, 0, 'taxComputed', {
        label: 'Total other income',
        amount: computed.totalOtherIncome,
        rows: [],
      }));
      otherIncomeMultiIds.forEach(({ nid, doc }) => {
        const amt = Math.max(0, parseFloat(doc.fields.amount) || 0);
        if (amt > 0) edges.push(makeEdge(eid(), nid, aggId, EDGE_COLORS.otherIncome, amt, { tooltipLabel: 'Other income' }));
      });
      otherIncomeSrcId = aggId;
    }
  }

  // Adjustments to income — zone 1, subCol 0, below capital loss carryover
  // Multiple docs get an agg node in zone 1 subCol 1
  let adjSrcId = null;
  if (adjToIncomeDocs.length === 1) {
    const doc = adjToIncomeDocs[0];
    const nid = `adj-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: doc.note ? `Adjustments — ${doc.note}` : 'Adjustments to income',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [{ label: 'Amount', value: formatCurrency(doc.fields.amount) }],
    }));
    adjSrcId = nid;
  } else if (adjToIncomeDocs.length > 1) {
    const adjIds = [];
    adjToIncomeDocs.forEach((doc, i) => {
      const nid = `adj-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `Adjustments — ${doc.note}` : `Adjustments #${i + 1}`,
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Amount', value: formatCurrency(doc.fields.amount) }],
      }));
      adjIds.push({ nid, doc });
    });
    if (computed.totalAdjustmentsToIncome > 0) {
      const aggId = 'adj-agg';
      nodes.push(makeNode(aggId, 2, 0, 'taxComputed', {
        label: 'Total adjustments',
        amount: computed.totalAdjustmentsToIncome,
        rows: [],
      }));
      adjIds.forEach(({ nid, doc }) => {
        const amount = Math.max(0, parseFloat(doc.fields.amount) || 0);
        if (amount > 0) edges.push(makeEdge(eid(), nid, aggId, EDGE_COLORS['adjustment-deduction'], amount, { tooltipLabel: 'Adjustment to income' }));
      });
      adjSrcId = aggId;
    } else if (adjIds.length > 0) {
      adjSrcId = adjIds[0].nid;
    }
  }

  // 1098-E (student loan interest) — zone 1, subCol 0, below adjustments to income
  // Total node (zone 1 subCol 1) shown when multiple docs or raw amount > $2,500 cap
  // Phaseout node (zone 1 subCol 1, below total) shown when MAGI is in the phaseout range
  let stdLoanSrcId = null;
  const stdLoanMultiIds = [];
  if (stdLoanDocs.length === 1) {
    const doc = stdLoanDocs[0];
    const nid = `stdloan-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: doc.note ? `1098-E — ${doc.note}` : '1098-E',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [{ label: 'Box 1 Student loan interest', value: formatCurrency(doc.fields.box1) }],
    }));
    stdLoanSrcId = nid;
  } else if (stdLoanDocs.length > 1) {
    stdLoanDocs.forEach((doc, i) => {
      const nid = `stdloan-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `1098-E — ${doc.note}` : `1098-E #${i + 1}`,
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Box 1 Student loan interest', value: formatCurrency(doc.fields.box1) }],
      }));
      stdLoanMultiIds.push({ nid, doc });
    });
  }

  // Total student loan interest node — shown when multiple docs or raw > cap
  const showStudentLoanTotal = computed.totalStudentLoanInterestRaw > 0 &&
    (stdLoanDocs.length > 1 || computed.studentLoanIsCapped);
  let stdLoanTotalId = null;
  if (showStudentLoanTotal) {
    stdLoanTotalId = 'stdloan-total';
    nodes.push(makeNode(stdLoanTotalId, 2, 0, 'taxComputed', {
      label: 'Student loan interest',
      amount: computed.totalStudentLoanInterestRaw,
      rows: [
        ...(computed.studentLoanIsCapped ? [{ label: 'Cap', value: formatCurrency(2500) }] : []),
      ],
    }));
    if (stdLoanDocs.length === 1) {
      edges.push(makeEdge(eid(), stdLoanSrcId, stdLoanTotalId, EDGE_COLORS.studentLoan, computed.totalStudentLoanInterestRaw, { tooltipLabel: 'Student loan interest' }));
    } else {
      stdLoanMultiIds.forEach(({ nid, doc }) => {
        const amt = Math.max(0, parseFloat(doc.fields.box1) || 0);
        if (amt > 0) edges.push(makeEdge(eid(), nid, stdLoanTotalId, EDGE_COLORS.studentLoan, amt, { tooltipLabel: 'Student loan interest' }));
      });
    }
    stdLoanSrcId = stdLoanTotalId;
  }

  // Phaseout node — shown when MAGI is in the phaseout range
  // Zone 2 subCol 0 if no cap node, subCol 1 if cap node present
  let stdLoanPhaseoutId = null;
  if (computed.hasStudentLoanPhaseout) {
    stdLoanPhaseoutId = 'stdloan-phaseout';
    const phaseoutSubCol = showStudentLoanTotal ? 1 : 0;
    const phaseoutSrc = stdLoanTotalId || stdLoanSrcId;
    const inputAmt = computed.studentLoanInterestCapped;
    const { start, end } = computed.slPhaseoutRange;
    const bandLabel = `$${start.toLocaleString()} – $${end.toLocaleString()}`;
    nodes.push(makeNode(stdLoanPhaseoutId, 2, phaseoutSubCol, 'taxComputed', {
      label: 'Student loan int phaseout',
      amount: computed.studentLoanInterestCapped,
      rows: [
        { label: 'Phaseout based on MAGI', value: formatCurrency(computed.magiForStudentLoan) },
        { label: 'Phaseout band', value: bandLabel },
        { label: 'Amt after phaseout', value: formatCurrency(computed.studentLoanDeduction) },
      ],
    }));
    if (phaseoutSrc) edges.push(makeEdge(eid(), phaseoutSrc, stdLoanPhaseoutId, EDGE_COLORS['adjustment-deduction'], inputAmt, { tooltipLabel: 'Student loan interest' }));
    stdLoanSrcId = stdLoanPhaseoutId;
  }

  // Section 199A dividends — zone 1, subCol 0, below 1098-E, before deductions
  const sec199aDocs = div1099s.filter(d => (parseFloat(d.fields.line5) || 0) > 0);
  if (sec199aDocs.length > 0) {
    sec199aDocs.forEach((doc, i) => {
      const nid = `sec199a-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `Section 199A — ${doc.note}` : (sec199aDocs.length === 1 ? 'Section 199A dividends' : `Section 199A #${i + 1}`),
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Box 5', value: formatCurrency(doc.fields.line5) }],
      }));
    });
    const aggId = 'sec199a-agg';
    const totalSec199A = sec199aDocs.reduce((s, d) => s + (parseFloat(d.fields.line5) || 0), 0);
    nodes.push(makeNode(aggId, 2, 0, 'taxComputed', {
      label: 'Total Section 199A dividends',
      amount: totalSec199A,
      rows: [{ label: '20% deduction', value: formatCurrency(totalSec199A * 0.2) }],
    }));
    sec199aDocs.forEach(doc => {
      const amt = parseFloat(doc.fields.line5) || 0;
      if (amt > 0) edges.push(makeEdge(eid(), `sec199a-${doc.id}`, aggId, EDGE_COLORS.deduction, amt, { tooltipLabel: 'Section 199A dividends' }));
    });
  }

  // ── ZONE 2: Schedule aggregation ────────────────────────────────────────
  // Sub-columns: 0 = schedule nodes, 1 = ST/LT netting, 2 = total ordinary income

  // Total interest node (Schedule B Line 4)
  let totalIntId = null;
  if (int1099s.length > 0 && computed.totalInterest > 0) {
    totalIntId = 'total-int';
    nodes.push(makeNode(totalIntId, 2, 0, 'taxComputed', {
      label: 'Total interest',
      amount: computed.totalInterest,
      rows: [],
    }));
    if (intMultiIds.length > 0) {
      intMultiIds.forEach(({ nid, doc }) => {
        const amt = parseFloat(doc.fields.line1) || 0;
        if (amt > 0) edges.push(makeEdge(eid(), nid, totalIntId, EDGE_COLORS.interest, amt, { tooltipLabel: 'Interest income' }));
      });
    } else if (interestSrcId) {
      edges.push(makeEdge(eid(), interestSrcId, totalIntId, EDGE_COLORS.interest, computed.totalInterest, { tooltipLabel: 'Interest income' }));
    }
  }

  // Total ordinary dividends node (Schedule B Line 6)
  let schedBId = null;
  const divOnlyAmount = computed.totalOrdinaryDividends - computed.totalQualifiedDividends;
  if (div1099s.length > 0 && divOnlyAmount > 0) {
    schedBId = 'sched-b';
    nodes.push(makeNode(schedBId, 2, 0, 'taxComputed', {
      label: 'Total non-qualified dividends',
      amount: divOnlyAmount,
      rows: [],
    }));
    if (div1099s.length === 1 && divOrdSrcId) {
      edges.push(makeEdge(eid(), divOrdSrcId, schedBId, EDGE_COLORS.dividend, computed.totalOrdinaryDividends - computed.totalQualifiedDividends, { sourceHandle: 'ord', tooltipLabel: 'Non-qualified dividends' }));
    } else if (div1099s.length > 1) {
      divMultiIds.forEach(({ nid, doc }) => {
        const amt = (parseFloat(doc.fields.line1a) || 0) - (parseFloat(doc.fields.line1b) || 0);
        if (amt > 0) edges.push(makeEdge(eid(), nid, schedBId, EDGE_COLORS.dividend, amt, { sourceHandle: 'ord', tooltipLabel: 'Non-qualified dividends' }));
      });
    }
  }

  // Schedule D — present when there are 1099-B docs or a capital loss carryover
  let schedD7Id = null, schedD17Id = null, stLtNetId = null, carryNextYearId = null;
  const hasSchedDInputs = b1099s.length > 0 || carryoverDocs.length > 0;
  const isNetLoss = computed.stForOrdinary < 0;
  const hasNextYearCarryover = computed.stNextYearCarryover > 0 || computed.ltNextYearCarryover > 0;

  const hasStInputs = b1099s.some(d => (parseFloat(d.fields.shortTerm) || 0) !== 0) || computed.stCarryover > 0;
  const hasLtInputs = b1099s.some(d => (parseFloat(d.fields.longTerm) || 0) !== 0) || computed.ltCarryover > 0;
  const bothPositive = computed.schedDLine7 > 0 && computed.schedDLine15 > 0;

  if (hasSchedDInputs) {
    if (hasStInputs) {
      schedD7Id = 'sched-d-7';
      nodes.push(makeNode(schedD7Id, 2, 0, 'taxComputed', {
        label: 'Net short-term',
        amount: computed.schedDLine7,
        rows: [],
      }));
    }
    if (hasLtInputs) {
      schedD17Id = 'sched-d-17';
      nodes.push(makeNode(schedD17Id, 2, 0, 'taxComputed', {
        label: 'Net long-term',
        amount: computed.schedDLine15,
        rows: [],
      }));
    }

    // ST/LT Netting node — shown only when netting is meaningful:
    //   1. Both ST and LT inputs exist (combining two lines), OR
    //   2. Only ST exists and the ST loss exceeds the $3k cap (carryover present), OR
    //   3. Only LT exists and the LT loss exceeds the $3k cap (carryover present)
    const showStLtNet = (hasStInputs && hasLtInputs && !bothPositive) || (isNetLoss && (
      (hasStInputs && !hasLtInputs && hasNextYearCarryover) ||
      (!hasStInputs && hasLtInputs && hasNextYearCarryover)
    ));

    if (showStLtNet) {
      stLtNetId = 'st-lt-net';
      const netLossTotal = computed.schedDLine7 + computed.schedDLine15; // negative
      const isCapped = Math.abs(netLossTotal) > Math.abs(computed.stForOrdinary);
      const stLtNetLabel = [
        (hasStInputs && hasLtInputs) ? 'ST/LT netting' : null,
        (isCapped && isNetLoss)      ? 'Cap loss limit' : null,
      ].filter(Boolean).join(' & ');
      nodes.push(makeNode(stLtNetId, 2, 1, 'taxComputed', {
        label: stLtNetLabel,
        amount: netLossTotal,
        rows: [
          ...(isCapped && isNetLoss ? [{ label: 'Loss deduction (max $3k)', value: formatCurrency(computed.stForOrdinary) }] : []),
          ...(!isNetLoss && computed.stForOrdinary > 0 ? [{ label: 'Short-term cap gain', value: '' }] : []),
          ...(!isNetLoss && computed.ltAfterNetting > 0 ? [{ label: 'Long-term cap gain', value: '' }] : []),
        ],
        ...(hasNextYearCarryover && { sourceHandles: [{ id: 'income' }, { id: 'carryover' }] }),
      }));

      // Carryover-to-next-year node, shown when loss exceeds the $3k cap
      if (hasNextYearCarryover) {
        carryNextYearId = 'capital-loss-carryover-next';
        nodes.push(makeNode(carryNextYearId, 2, 2, 'taxComputed', {
          label: 'Carryover to next year',
          amount: -(computed.stNextYearCarryover + computed.ltNextYearCarryover),
          rows: [
            ...(computed.stNextYearCarryover > 0 ? [{ label: 'Short-term', value: formatCurrency(-computed.stNextYearCarryover) }] : []),
            ...(computed.ltNextYearCarryover > 0 ? [{ label: 'Long-term', value: formatCurrency(-computed.ltNextYearCarryover) }] : []),
          ],
        }));
      }
    }

    // 1099-B flows into Schedule D — use signed amounts (positive = gain, negative = loss)
    // so the z-stack offset logic can separate the two groups visually.
    // Sankey width uses Math.abs internally so both directions still render with positive thickness.
    if (b1099s.length === 1 && bStSrcId) {
      if (schedD7Id && computed.stGainRaw !== 0) edges.push(makeEdge(eid(), bStSrcId, schedD7Id, computed.stGainRaw < 0 ? EDGE_COLORS.capitalLoss : EDGE_COLORS.capitalGain, computed.stGainRaw, { sourceHandle: 'st', tooltipLabel: computed.stGainRaw < 0 ? 'Short-term loss' : 'Short-term gain' }));
      if (schedD17Id && computed.ltGainRaw !== 0) edges.push(makeEdge(eid(), bLtSrcId, schedD17Id, computed.ltGainRaw < 0 ? EDGE_COLORS.capitalLoss : EDGE_COLORS.capitalGain, computed.ltGainRaw, { sourceHandle: 'lt', tooltipLabel: computed.ltGainRaw < 0 ? 'Long-term loss' : 'Long-term gain' }));
    } else if (b1099s.length > 1) {
      bMultiIds.forEach(({ nid, doc }) => {
        const st = parseFloat(doc.fields.shortTerm) || 0;
        const lt = parseFloat(doc.fields.longTerm) || 0;
        if (schedD7Id && st !== 0) edges.push(makeEdge(eid(), nid, schedD7Id, st < 0 ? EDGE_COLORS.capitalLoss : EDGE_COLORS.capitalGain, st, { sourceHandle: 'st', tooltipLabel: st < 0 ? 'Short-term loss' : 'Short-term gain' }));
        if (schedD17Id && lt !== 0) edges.push(makeEdge(eid(), nid, schedD17Id, lt < 0 ? EDGE_COLORS.capitalLoss : EDGE_COLORS.capitalGain, lt, { sourceHandle: 'lt', tooltipLabel: lt < 0 ? 'Long-term loss' : 'Long-term gain' }));
      });
    }
    // Carryover losses flow into Schedule D — negative because they reduce the net
    if (carryoverSrcId) {
      if (schedD7Id && computed.stCarryover > 0) edges.push(makeEdge(eid(), carryoverSrcId, schedD7Id, EDGE_COLORS.capitalLoss, -computed.stCarryover, { sourceHandle: 'st', tooltipLabel: 'ST loss carryover' }));
      if (schedD17Id && computed.ltCarryover > 0) edges.push(makeEdge(eid(), carryoverSrcId, schedD17Id, EDGE_COLORS.capitalLoss, -computed.ltCarryover, { sourceHandle: 'lt', tooltipLabel: 'LT loss carryover' }));
    }

    if (stLtNetId) {
      // Schedule D lines feed the netting node — signed so z-stack logic separates gains/losses visually
      if (schedD7Id && computed.schedDLine7 !== 0) edges.push(makeEdge(eid(), schedD7Id, stLtNetId, computed.schedDLine7 < 0 ? EDGE_COLORS.capitalLoss : EDGE_COLORS.capitalGain, computed.schedDLine7, { tooltipLabel: 'Short-term net' }));
      if (schedD17Id && computed.schedDLine15 !== 0) edges.push(makeEdge(eid(), schedD17Id, stLtNetId, computed.schedDLine15 < 0 ? EDGE_COLORS.capitalLoss : EDGE_COLORS.capitalGain, computed.schedDLine15, { tooltipLabel: 'Long-term net' }));
      // Carryover node gets remaining loss beyond the $3k deduction
      if (carryNextYearId) edges.push(makeEdge(eid(), stLtNetId, carryNextYearId, EDGE_COLORS.capitalLoss, -(computed.stNextYearCarryover + computed.ltNextYearCarryover), { sourceHandle: 'carryover', tooltipLabel: 'Loss carryover to next year' }));
    }
    // Gain-case edges (schedD → totalIncome / LTCG) are added after totalIncomeId is defined below
  }

  // Preferential income — aggregates qualified dividends + net LT cap gains
  // Shown only when at least one preferential flow exists.
  let prefIncomeId = null;
  const hasPrefIncomeInputs = computed.totalQualifiedDividends > 0 || computed.ltAfterNetting > 0;
  if (hasPrefIncomeInputs) {
    prefIncomeId = 'pref-income';
    // x: subCol 2 (flexible column) when LT > 0 and ST < 0 (netting present, LT dominates); else subCol 1
    const prefSubCol = (computed.ltAfterNetting > 0 && computed.schedDLine7 < 0) ? 2 : 1;
    nodes.push(makeNode(prefIncomeId, 2, prefSubCol, 'taxComputed', {
      label: 'Preferential income',
      amount: computed.ltcgForPreferential,
      rows: [],
    }));
    if (divQualSrcId && computed.totalQualifiedDividends > 0) {
      edges.push(makeEdge(eid(), divQualSrcId, prefIncomeId, EDGE_COLORS.preferential, computed.totalQualifiedDividends, { tooltipLabel: 'Qualified dividends' }));
    }
    if (computed.ltAfterNetting > 0) {
      const ltSrc = stLtNetId || schedD17Id;
      if (ltSrc) edges.push(makeEdge(eid(), ltSrc, prefIncomeId, EDGE_COLORS.preferential, computed.ltAfterNetting, { tooltipLabel: 'Long-term capital gain' }));
    }
  }

  // numDynamicSubCol: how many dynamic sub-columns exist to the left of Total income.
  //   0 — no nodes in subCol 1
  //   1 — nodes in subCol 1 (ST/LT netting, pref income at subCol 1, or student loan phaseout at subCol 1)
  //   2 — preferential income node is in subCol 2 (pushed there by ST/LT netting)
  const prefInSubCol2 = prefIncomeId !== null && computed.ltAfterNetting > 0 && computed.schedDLine7 < 0;
  const subCol1HasNodes =
    stLtNetId !== null ||
    (prefIncomeId !== null && !prefInSubCol2) ||
    (stdLoanPhaseoutId !== null && showStudentLoanTotal);
  const numDynamicSubCol = prefInSubCol2 ? 2 : (subCol1HasNodes ? 1 : 0);
  const totalIncomeSubCol = 1 + numDynamicSubCol;
  const agiSubCol = totalIncomeSubCol + 1;

  // Update zone starts dynamically based on numDynamicSubCol.
  // Z3_START = Z2_START + (3 + numDynamicSubCol) * SUB_COL_WIDTH
  const z3Start = Z2_START + (3 + numDynamicSubCol) * SUB_COL_WIDTH;
  ZONE_STARTS[3] = z3Start;
  ZONE_STARTS[4] = z3Start + Z3_Z4_OFFSET;
  ZONE_STARTS[5] = z3Start + Z3_Z4_OFFSET + Z4_Z5_OFFSET;

  // Carryover-to-next-year shares the same x as Total income so it moves with it.
  // Give it an isolated data.subCol (won't match any real node) so assignYPositions
  // doesn't stack it with Total income — carryover y is always set by the y-sync block.
  if (carryNextYearId) {
    const carryNode = nodes.find(n => n.id === carryNextYearId);
    if (carryNode) {
      carryNode.data = { ...carryNode.data, subCol: 20 };
      carryNode.position.x = nodeX(2, totalIncomeSubCol);
    }
  }

  // Total income — aggregates wages + interest + dividends + ST/LT cap gains
  const totalIncomeId = 'total-income';
  nodes.push(makeNode(totalIncomeId, 2, totalIncomeSubCol, 'taxComputed', {
    label: 'Total income',
    amount: computed.totalOrdinaryIncome + Math.max(0, computed.ltcgForPreferential || 0),
    rows: [
      ...(w2s.length > 0 ? [{ label: 'Wages', value: formatCurrency(computed.w2Wages) }] : []),
      ...(int1099s.length > 0 ? [{ label: 'Interest', value: formatCurrency(computed.totalInterest) }] : []),
      ...(div1099s.length > 0 ? [{ label: 'Non-qual dividends', value: formatCurrency(divOnlyAmount) }] : []),
      ...(hasSchedDInputs && computed.stForOrdinary > 0 ? [{ label: 'ST cap gains', value: formatCurrency(computed.stForOrdinary) }] : []),
      ...(prefIncomeId ? [{ label: 'Preferential income', value: formatCurrency(computed.ltcgForPreferential) }] : []),
      ...(hasSchedDInputs && isNetLoss ? [{ label: 'Capital loss deduction', value: formatCurrency(computed.stForOrdinary) }] : []),
      ...(otherIncomeDocs.length > 0 && computed.totalOtherIncome > 0 ? [{ label: 'Other income', value: formatCurrency(computed.totalOtherIncome) }] : []),
    ],
  }));

  if (wagesSourceId) edges.push(makeEdge(eid(), wagesSourceId, totalIncomeId, EDGE_COLORS.wages, computed.w2Wages, { tooltipLabel: 'W-2 wages' }));
  if (totalIntId) edges.push(makeEdge(eid(), totalIntId, totalIncomeId, EDGE_COLORS.interest, computed.totalInterest, { tooltipLabel: 'Total interest' }));
  if (schedBId) edges.push(makeEdge(eid(), schedBId, totalIncomeId, EDGE_COLORS.dividend, divOnlyAmount, { tooltipLabel: 'Non-qualified dividends' }));
  if (otherIncomeSrcId && computed.totalOtherIncome > 0) {
    edges.push(makeEdge(eid(), otherIncomeSrcId, totalIncomeId, EDGE_COLORS.otherIncome, computed.totalOtherIncome, { sourceCurvature: 1.2, targetCurvature: 0.15, tooltipLabel: 'Other income' }));
  }

  if (stLtNetId) {
    // Netting node present: it feeds Total income with the net result
    if (isNetLoss) {
      edges.push(makeEdge(eid(), stLtNetId, totalIncomeId, EDGE_COLORS.capitalLoss, computed.stForOrdinary,
        hasNextYearCarryover ? { sourceHandle: 'income', tooltipLabel: 'Capital loss deduction' } : { tooltipLabel: 'Capital loss deduction' }));
    } else {
      if (computed.stForOrdinary > 0) {
        edges.push(makeEdge(eid(), stLtNetId, totalIncomeId, EDGE_COLORS.capitalGain, computed.stForOrdinary, { tooltipLabel: 'Short-term cap gain' }));
      }
    }
  } else if (hasSchedDInputs) {
    // No netting node: Schedule D lines feed Total income directly
    if (!isNetLoss) {
      if (schedD7Id && computed.stForOrdinary > 0) {
        edges.push(makeEdge(eid(), schedD7Id, totalIncomeId, EDGE_COLORS.capitalGain, computed.stForOrdinary, { tooltipLabel: 'Short-term cap gain' }));
      }
    } else if (isNetLoss) {
      const directSrc = schedD7Id || schedD17Id;
      if (directSrc) {
        edges.push(makeEdge(eid(), directSrc, totalIncomeId, EDGE_COLORS.capitalLoss, Math.abs(computed.stForOrdinary), { tooltipLabel: 'Capital loss deduction' }));
      }
    }
  }
  // Preferential income routes through Total income → AGI before reaching LTCG tax
  if (prefIncomeId) {
    edges.push(makeEdge(eid(), prefIncomeId, totalIncomeId, EDGE_COLORS.preferential, computed.ltcgForPreferential, { tooltipLabel: 'Preferential income' }));
  }


  // Adjusted gross income — pinned so its right edge sits 10px left of the zone 2→3 divider.
  const totalOrdIncId = 'total-ord-inc';
  nodes.push(makeNode(totalOrdIncId, 2, agiSubCol, 'taxComputed', {
    label: 'Adjusted gross income',
    amount: computed.agi,
    rows: [
      ...(computed.totalAdjustmentsToIncome > 0 ? [{ label: 'Adjustments to income', value: formatCurrency(-computed.totalAdjustmentsToIncome) }] : []),
      ...(computed.studentLoanDeduction > 0 ? [{ label: 'Student loan interest', value: formatCurrency(-computed.studentLoanDeduction) }] : []),
    ],
  }));
  nodes[nodes.length - 1].position.x = nodeX(2, agiSubCol);
  edges.push(makeEdge(eid(), totalIncomeId, totalOrdIncId, EDGE_COLORS.wages, computed.totalOrdinaryIncome, { tooltipLabel: 'Ordinary income' }));
  if (prefIncomeId) {
    edges.push(makeEdge(eid(), totalIncomeId, totalOrdIncId, EDGE_COLORS.preferential, computed.ltcgForPreferential, { tooltipLabel: 'Preferential income' }));
  }
  // Adjustments to income flow directly into AGI (centered at its input handle)
  // Single adjustment node: flatten curve on source side, steepen on target side
  if (adjSrcId && computed.totalAdjustmentsToIncome > 0) {
    const adjCurvature = { sourceCurvature: 1.2, targetCurvature: 0.15, tooltipLabel: 'Total adjustments' };
    edges.push(makeEdge(eid(), adjSrcId, totalOrdIncId, EDGE_COLORS['adjustment-deduction'], computed.totalAdjustmentsToIncome, adjCurvature));
  }

  // Student loan interest deduction flows into AGI (centered at its input handle)
  if (stdLoanSrcId && computed.studentLoanDeduction > 0) {
    const slCurvature = { sourceCurvature: 1.2, targetCurvature: 0.15, tooltipLabel: 'Student loan deduction' };
    edges.push(makeEdge(eid(), stdLoanSrcId, totalOrdIncId, EDGE_COLORS['adjustment-deduction'], computed.studentLoanDeduction, slCurvature));
  }

  // QBI deduction node — zone 2, same x-column as AGI, y-synced to first Section 199A source
  let qbiDeductionId = null;
  let effectiveQbi = 0;
  if (sec199aDocs.length > 0 && computed.totalSection199A > 0) {
    qbiDeductionId = 'qbi-deduction';
    const rawQbi = computed.totalSection199A * 0.2;
    const qbiCap = 0.2 * computed.totalOrdinaryIncome;
    const isQbiCapped = rawQbi > qbiCap;
    effectiveQbi = isQbiCapped ? qbiCap : rawQbi;

    let qbiCapId = null;
    if (isQbiCapped) {
      qbiCapId = 'qbi-deduction-cap';
      nodes.push(makeNode(qbiCapId, 2, agiSubCol, 'taxComputed', {
        label: 'QBI deduction cap',
        amount: rawQbi,
        rows: [{ label: 'Cap to 20% Ordinary income', value: formatCurrency(qbiCap) }],
      }));
      nodes[nodes.length - 1].position.x = nodeX(2, totalIncomeSubCol);
      edges.push(makeEdge(eid(), 'sec199a-agg', qbiCapId, EDGE_COLORS.deduction, rawQbi, { tooltipLabel: 'Raw QBI (20% of 199A)' }));
    }

    nodes.push(makeNode(qbiDeductionId, 2, agiSubCol, 'taxComputed', {
      label: 'QBI deduction',
      amount: effectiveQbi,
      rows: [],
    }));
    nodes[nodes.length - 1].position.x = nodeX(2, agiSubCol);

    if (isQbiCapped) {
      edges.push(makeEdge(eid(), qbiCapId, qbiDeductionId, EDGE_COLORS.deduction, effectiveQbi, { tooltipLabel: 'Capped QBI deduction' }));
    } else {
      edges.push(makeEdge(eid(), 'sec199a-agg', qbiDeductionId, EDGE_COLORS.deduction, rawQbi, { tooltipLabel: 'QBI (20% of 199A)' }));
    }
  }

  // ── ZONE 3: Deductions & Taxable Income ──────────────────────────────────
  // Layout: zone 1 = sources (1098 + SALT + charitable), zone 2 = aggregation, zone 3 subCol 0 = deduction, zone 3 subCol 1 = taxable income
  const isCharCapped = computed.totalCharitableRaw > computed.charitableCap;
  const showCharAgg = charities.length > 0;
  const showMortAgg = mortgages.length > 1 || computed.isMortgageCapped; // interest agg only
  const showSaltAgg = saltDocs.length > 0 || computed.isSaltCapped;
  const taxableSubCol = 0;

  // 1098 sources
  // mortIntSourceId: the node that feeds interest into deduction (source or agg)
  // mortIntNeedsHandle: whether the interest edge needs sourceHandle: 'interest'
  // mortTaxSourceId/mortTaxNeedsHandle: for single-1098 real estate tax edge (multi-1098 handled via mortMultiIds)
  // mortMultiIds: per-source data for multiple-1098 real estate tax edges (added later after deductionId is known)
  let mortIntSourceId = null;
  let mortTaxSourceId = null;
  let mortIntNeedsHandle = false;
  let mortTaxNeedsHandle = false;
  let mortMultiIds = []; // { nid, doc } for multiple 1098s

  const mortLimitLabel = computed.mortgageLimitApplied === 1_000_000 ? '$1M' : '$750k';

  if (mortgages.length === 1) {
    const doc = mortgages[0];
    const nid = `mort-${doc.id}`;
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label: doc.note ? `1098 — ${doc.note}` : '1098',
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [
        { label: 'Box 1 — Mortgage interest', value: formatCurrency(doc.fields.mortgageInterest) },
        { label: 'Box 2 — Outstanding principal', value: formatCurrency(doc.fields.outstandingPrincipal) },
        { label: 'Box 3 — Origination date', value: doc.fields.originationDate || '—' },
        { label: 'Principal balance Dec 31', value: formatCurrency(doc.fields.principalBalanceDec31) },
        { label: 'Real estate taxes paid', value: formatCurrency(doc.fields.realEstateTaxes) },
      ],
      rowHandles: [{ id: 'interest', rowIndex: 0 }, { id: 'tax', rowIndex: 4 }],
    }));

    if (computed.isMortgageCapped) {
      // Show agg node for interest with cap note; taxes flow directly from source
      const mIntAggId = 'mort-int-agg';
      nodes.push(makeNode(mIntAggId, 2, 0, 'taxComputed', {
        label: 'Mortgage interest',
        amount: computed.totalMortgageInterestRaw,
        rows: [{ label: `Capped to ${mortLimitLabel} limit`, value: formatCurrency(computed.totalMortgageInterest) }],
        hasOverride: true,
        overrideKey: 'deduction.mortgageCap',
      }));
      edges.push(makeEdge(eid(), nid, mIntAggId, EDGE_COLORS.deduction, computed.totalMortgageInterestRaw, { sourceHandle: 'interest', tooltipLabel: 'Mortgage interest' }));
      mortIntSourceId = mIntAggId;
      mortTaxSourceId = nid;
      mortTaxNeedsHandle = true;
    } else {
      mortIntSourceId = nid;
      mortTaxSourceId = nid;
      mortIntNeedsHandle = true;
      mortTaxNeedsHandle = true;
    }
  } else if (mortgages.length > 1) {
    mortgages.forEach((doc, i) => {
      const nid = `mort-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: doc.note ? `1098 — ${doc.note}` : `1098 #${i + 1}`,
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [
          { label: 'Box 1 — Mortgage interest', value: formatCurrency(doc.fields.mortgageInterest) },
          { label: 'Box 2 — Outstanding principal', value: formatCurrency(doc.fields.outstandingPrincipal) },
          { label: 'Box 3 — Origination date', value: doc.fields.originationDate || '—' },
          { label: 'Real estate taxes paid', value: formatCurrency(doc.fields.realEstateTaxes) },
        ],
        rowHandles: [{ id: 'interest', rowIndex: 0 }, { id: 'tax', rowIndex: 3 }],
      }));
      mortMultiIds.push({ nid, doc });
    });
    const mIntAggId = 'mort-int-agg';
    nodes.push(makeNode(mIntAggId, 2, 0, 'taxComputed', {
      label: 'Total mortgage interest',
      amount: computed.totalMortgageInterestRaw,
      rows: computed.isMortgageCapped
        ? [{ label: `Capped to ${mortLimitLabel} limit`, value: formatCurrency(computed.totalMortgageInterest) }]
        : [],
      hasOverride: true,
      overrideKey: 'deduction.mortgageCap',
    }));
    mortMultiIds.forEach(({ nid, doc }) => {
      edges.push(makeEdge(eid(), nid, mIntAggId, EDGE_COLORS.deduction, parseFloat(doc.fields.mortgageInterest) || 0, { sourceHandle: 'interest', tooltipLabel: 'Mortgage interest' }));
    });
    mortIntSourceId = mIntAggId;
  }

  // State and local tax sources — zone 1, subCol 0
  const saltSourceIds = [];
  saltDocs.forEach((doc, i) => {
    const nid = `salt-${doc.id}`;
    const label = saltDocs.length === 1
      ? (doc.note ? `State & local taxes — ${doc.note}` : 'State & local taxes')
      : (doc.note ? `State & local taxes — ${doc.note}` : `State & local taxes #${i + 1}`);
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label,
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [{ label: 'Amount', value: formatCurrency(doc.fields.amount) }],
    }));
    saltSourceIds.push({ nid, doc });
  });

  if (showSaltAgg) {
    nodes.push(makeNode('salt-agg', 2, 0, 'taxComputed', {
      label: 'Total state & local taxes',
      amount: computed.totalSaltRaw,
      rows: computed.isSaltCapped
        ? [{ label: 'After $10k SALT cap', value: formatCurrency(computed.totalSalt) }]
        : [],
      hasOverride: true,
      overrideKey: 'deduction.saltCap',
    }));
  }

  // Charitable donation sources — zone 1, subCol 0
  let charNodeId = null;
  const charSourceIds = []; // individual source node IDs

  charities.forEach((doc, i) => {
    const nid = `char-${doc.id}`;
    const label = charities.length === 1
      ? (doc.note ? `Donation — ${doc.note}` : 'Charitable donation')
      : (doc.note ? `Donation — ${doc.note}` : `Charitable donation #${i + 1}`);
    nodes.push(makeNode(nid, 1, 0, 'taxSource', {
      label,
      sourceDocId: doc.id,
      highlighted: focusedDocId === doc.id,
      rows: [{ label: 'Amount', value: formatCurrency(doc.fields.amount) }],
    }));
    charSourceIds.push({ nid, doc });
  });

  if (showCharAgg) {
    const cAggId = 'char-agg';
    nodes.push(makeNode(cAggId, 2, 0, 'taxComputed', {
      label: 'Total charitable',
      amount: computed.totalCharitableRaw,
      rows: isCharCapped
        ? [{ label: 'Capped to 60% AGI', value: formatCurrency(computed.totalCharitable) }]
        : [],
    }));
    charSourceIds.forEach(({ nid, doc }) => {
      edges.push(makeEdge(eid(), nid, cAggId, EDGE_COLORS.deduction, parseFloat(doc.fields.amount) || 0, { tooltipLabel: 'Charitable donation' }));
    });
    charNodeId = cAggId;
  } else if (charSourceIds.length === 1) {
    charNodeId = charSourceIds[0].nid;
  }



  // Itemized deductions aggregation node — collects all itemized inputs before the deduction node.
  // Pinned to the same x as AGI; y is synced to the topmost input node after layout.
  const itemizedDeductId = computed.itemizedTotal > 0 ? 'itemized-deduct' : null;
  if (itemizedDeductId) {
    nodes.push(makeNode(itemizedDeductId, 2, agiSubCol, 'taxComputed', {
      label: 'Itemized deductions',
      amount: computed.itemizedTotal,
    }));
    nodes[nodes.length - 1].position.x = nodeX(2, agiSubCol);
  }

  // Taxable income node — pushed first so it gets y=60, aligning with total ordinary income
  const taxableIncId = 'taxable-inc';
  nodes.push(makeNode(taxableIncId, 3, taxableSubCol, 'taxComputed', {
    label: 'Taxable income',
    amount: computed.taxableIncome - (qbiDeductionId ? effectiveQbi : 0),
    rows: [
      { label: 'Income from AGI', value: formatCurrency(computed.taxableIncome - (prefIncomeId ? (computed.ltcgForPreferential || 0) : 0)) },
      ...(prefIncomeId ? [{ label: 'Preferential income', value: formatCurrency(computed.ltcgForPreferential) }] : []),
      ...(qbiDeductionId ? [{ label: 'QBI deduction', value: `− ${formatCurrency(effectiveQbi)}` }] : []),
    ],
  }));

  // Deduction node — same column as taxable income, stacked below it.
  // Its y will be synced to the deduction 0% tax node after assignYPositions.
  const deductionId = 'deduction';
  nodes.push(makeNode(deductionId, 3, taxableSubCol, 'taxDeduction', {
    label: 'Deduction',
    amount: computed.deductionUsed,
    itemizedTotal: computed.itemizedTotal,
    standardDeduction: computed.standardDeduction,
    deductionType: computed.deductionType,
    hasOverride: true,
    overrideKey: 'deduction.choice',
  }));

  // The final target for itemized flows: the new aggregation node when it exists, else deduction directly
  const itemizedTarget = itemizedDeductId || deductionId;

  // Edges into deduction / itemized aggregation
  if (mortIntSourceId && computed.totalMortgageInterest > 0) {
    const intOpts = mortIntNeedsHandle ? { sourceHandle: 'interest' } : {};
    edges.push(makeEdge(eid(), mortIntSourceId, itemizedTarget, EDGE_COLORS.deduction, computed.totalMortgageInterest, { ...intOpts, tooltipLabel: 'Mortgage interest' }));
  }
  // Single 1098 real estate taxes → SALT agg, or itemized agg, or deduction
  if (mortTaxSourceId && computed.totalRealEstateTaxesRaw > 0) {
    const taxTarget = showSaltAgg ? 'salt-agg' : itemizedTarget;
    const taxOpts = mortTaxNeedsHandle ? { sourceHandle: 'tax' } : {};
    edges.push(makeEdge(eid(), mortTaxSourceId, taxTarget, EDGE_COLORS.deduction, computed.totalRealEstateTaxesRaw, { ...taxOpts, tooltipLabel: 'Property tax' }));
  }
  // Multiple 1098 real estate taxes → SALT agg, or itemized agg, or deduction
  if (mortMultiIds.length > 0) {
    const taxTarget = showSaltAgg ? 'salt-agg' : itemizedTarget;
    mortMultiIds.forEach(({ nid, doc }) => {
      const amt = parseFloat(doc.fields.realEstateTaxes) || 0;
      if (amt > 0) edges.push(makeEdge(eid(), nid, taxTarget, EDGE_COLORS.deduction, amt, { sourceHandle: 'tax', tooltipLabel: 'Property tax' }));
    });
  }
  // State/local tax sources → SALT agg (after real estate taxes so they arrive at the bottom)
  saltSourceIds.forEach(({ nid, doc }) => {
    edges.push(makeEdge(eid(), nid, 'salt-agg', EDGE_COLORS.deduction, parseFloat(doc.fields.amount) || 0, { tooltipLabel: 'State & local tax' }));
  });
  // SALT agg → itemized agg or deduction
  if (showSaltAgg && computed.totalSalt > 0) {
    edges.push(makeEdge(eid(), 'salt-agg', itemizedTarget, EDGE_COLORS.deduction, computed.totalSalt, { tooltipLabel: 'State & local tax' }));
  }
  if (charNodeId) {
    edges.push(makeEdge(eid(), charNodeId, itemizedTarget, EDGE_COLORS.deduction, computed.totalCharitable, { tooltipLabel: 'Charitable deduction' }));
  }
  // Itemized agg → deduction (single teal flow, centered on the deduction input handle)
  if (itemizedDeductId) {
    edges.push(makeEdge(eid(), itemizedDeductId, deductionId, EDGE_COLORS.deduction, computed.itemizedTotal, { tooltipLabel: 'Itemized deductions' }));
  }

  // Parallel split: total ordinary income → taxable income (direct) + deduction node
  edges.push(makeEdge(eid(), totalOrdIncId, taxableIncId, EDGE_COLORS.wages, computed.taxableIncome - (prefIncomeId ? (computed.ltcgForPreferential || 0) : 0), { tooltipLabel: 'Ordinary income (after deduction)' }));
  edges.push(makeEdge(eid(), totalOrdIncId, deductionId, EDGE_COLORS.wages, computed.deductionUsed, { tooltipLabel: 'Ordinary income (deducted)' }));
  if (prefIncomeId) {
    edges.push(makeEdge(eid(), totalOrdIncId, taxableIncId, EDGE_COLORS.preferential, computed.ltcgForPreferential, { tooltipLabel: 'Preferential income' }));
  }
  if (qbiDeductionId) {
    edges.push(makeEdge(eid(), qbiDeductionId, taxableIncId, EDGE_COLORS.deduction, effectiveQbi, { tooltipLabel: 'QBI deduction' }));
  }

  // ── ZONE 4: Tax calculation ───────────────────────────────────────────────
  // Highest bracket first → lowest bracket last, so layout is top=high, bottom=low.
  // Skip brackets with $0 income.
  const brackets = computed.bracketResults
    .map((b, i) => ({ ...b, bid: `bracket-${i}` }))
    .filter(b => b.income > 0)
    .reverse(); // highest rate at top, lowest at bottom

  brackets.forEach(b => {
    nodes.push(makeNode(b.bid, 4, 0, 'taxBracket', {
      rate: b.rate,
      income: b.income,
      tax: b.tax,
      rangeFrom: b.rangeFrom,
      rangeTo: b.rangeTo,
      dimmed: false,
      isOrdinary: true,
    }));
    edges.push(makeEdge(eid(), taxableIncId, b.bid, EDGE_COLORS.wages, b.income, { tooltipLabel: `Taxable income in ${Math.round(b.rate * 100)}% ordinary bracket` }));
  });

  // Deduction 0% tax node — below all brackets
  const deductBracketId = 'deduct-bracket';
  nodes.push(makeNode(deductBracketId, 4, 0, 'taxBracket', {
    label: 'Deduction 0% tax',
    rate: 0,
    income: computed.deductionUsed,
    tax: 0,
    displayAmount: computed.deductionUsed,
    hideInBracket: true,
    rangeFrom: 0,
    rangeTo: 0,
    dimmed: false,
  }));
  edges.push(makeEdge(eid(), deductionId, deductBracketId, EDGE_COLORS.deduction, computed.deductionUsed, { tooltipLabel: computed.deductionType === 'itemized' ? 'Itemized deduction' : 'Standard deduction' }));

  const prefIncome = computed.ltcgForPreferential || 0;

  // Ordinary income node — post-deduction ordinary taxable income (what fills LTCG bracket space)
  const ordinaryIncId = 'ordinary-inc';
  if (prefIncome > 0) {
    nodes.push(makeNode(ordinaryIncId, 3, taxableSubCol, 'taxComputed', {
      label: 'Ordinary income',
      amount: computed.totalOrdinaryIncome,
      subtitle: 'Total income minus preferential inc.',
    }));
  }

  // Total tax node — zone 5 subCol 0
  const totalTaxId = 'total-tax';
  nodes.push(makeNode(totalTaxId, 5, 0, 'taxComputed', {
    label: 'Total income tax',
    amount: computed.totalTax,
    rows: [
      { label: 'Ordinary inc tax', value: formatCurrency(computed.ordinaryTax) },
      { label: 'Preferential inc tax', value: formatCurrency(computed.prefTax) },
    ],
  }));
  brackets.forEach(b => {
    if (b.tax > 0) edges.push(makeEdge(eid(), b.bid, totalTaxId, EDGE_COLORS.bracket, b.tax, { tooltipLabel: `Income tax from ${Math.round(b.rate * 100)}% ordinary bracket` }));
  });

  // LTCG bracket nodes — zone 4 subCol 1, highest rate at top (20% → 15% → 0%)
  // All 3 tiers are shown when LTCG exists; only those with income > 0 get inflow/outflow edges.
  const prefBracketData = prefIncome > 0
    ? (computed.prefBracketResults || []).map((b, i) => ({ ...b, bid: `pref-bracket-${i}` }))
    : [];
  prefBracketData.forEach(b => {
    if (b.income === 0 && b.ordinaryIncome === 0) return; // completely unfilled — hide
    nodes.push(makeNode(b.bid, 4, 1, 'taxBracket', {
      rate:           b.rate,
      income:         b.income,
      tax:            b.tax,
      rangeFrom:      b.rangeFrom,
      rangeTo:        b.rangeTo,
      ordinaryIncome: b.ordinaryIncome,
      dimmed:         b.income === 0,
    }));
    if (b.income > 0) {
      edges.push(makeEdge(eid(), taxableIncId, b.bid, EDGE_COLORS.preferential, b.income, { tooltipLabel: `Preferential income in ${Math.round(b.rate * 100)}% preferential bracket` }));
    }
    if (b.ordinaryIncome > 0) {
      edges.push(makeEdge(eid(), ordinaryIncId, b.bid, EDGE_COLORS.ordFillingPref, b.ordinaryIncome, { tooltipLabel: `Ordinary income in ${Math.round(b.rate * 100)}% preferential bracket (untaxed)` }));
    }
  });

  // Amount you keep — zone 5 subCol 0, below total income tax
  const keepId = 'amount-keep';
  nodes.push(makeNode(keepId, 5, 0, 'taxResult', {
    label: 'Amount you keep',
    amount: computed.amountYouKeep,
    isKeep: true,
    rows: [],
  }));

  // ── ZONE 5: Withholding & results ─────────────────────────────────────────
  let withholdingId = null;
  const withholdingSourceIds = []; // source nodes only — stacked vertically below refund
  let withholdingAggId = null;    // agg node — aligned to the right of the first source

  if (w2s.length === 1) {
    const doc = w2s[0];
    const amount = parseFloat(doc.fields.box2) || 0;
    if (amount > 0) {
      const nid = `w2-wh-${doc.id}`;
      nodes.push(makeNode(nid, 5, 1, 'taxSource', {
        label: w2WhLabel(doc, null),
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Box 2 Income tax withheld', value: formatCurrency(doc.fields.box2) }],
      }));
      withholdingId = nid;
      withholdingSourceIds.push(nid);
    }
  } else if (w2s.length > 1) {
    const whIds = [];
    w2s.forEach((doc, i) => {
      const amount = parseFloat(doc.fields.box2) || 0;
      if (amount > 0) {
        const nid = `w2-wh-${doc.id}`;
        nodes.push(makeNode(nid, 5, 1, 'taxSource', {
          label: w2WhLabel(doc, `#${i + 1}`),
          sourceDocId: doc.id,
          highlighted: focusedDocId === doc.id,
          rows: [{ label: 'Box 2 Income tax withheld', value: formatCurrency(doc.fields.box2) }],
        }));
        whIds.push({ nid, doc });
        withholdingSourceIds.push(nid);
      }
    });
    if (whIds.length > 1 && computed.w2Withheld > 0) {
      const whAggId = 'w2-wh-agg';
      nodes.push(makeNode(whAggId, 5, 2, 'taxComputed', {
        label: 'Total withheld',
        amount: computed.w2Withheld,
        rows: [],
      }));
      whIds.forEach(({ nid, doc }) => {
        edges.push(makeEdge(eid(), nid, whAggId, EDGE_COLORS.withholding, parseFloat(doc.fields.box2) || 0, { tooltipLabel: 'Income tax withheld' }));
      });
      withholdingId = whAggId;
      withholdingAggId = whAggId;
    } else if (whIds.length === 1) {
      // Only one non-zero withholding — no agg needed
      withholdingId = whIds[0].nid;
    }
  }

  // Social Security nodes — Box 4 (WHG) group first (above), then Box 3 (wages) group below
  w2s.forEach((doc, i) => {
    const ssTax = parseFloat(doc.fields.box4) || 0;
    if (ssTax > 0) {
      const company = (doc.fields.company || '').trim().split(/\s+/)[0];
      const suffix = company || (w2s.length > 1 ? `#${i + 1}` : null);
      const empName = (doc.fields.employeeName || '').trim().split(/\s+/)[0];
      const parts = [suffix, empName].filter(Boolean);
      const nid = `w2-ss-wh-${doc.id}`;
      nodes.push(makeNode(nid, 5, 1, 'taxSource', {
        label: parts.length > 0 ? `W-2 — SS WHG — ${parts.join(' — ')}` : 'W-2 — SS WHG',
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Box 4 SS tax withheld', value: formatCurrency(doc.fields.box4) }],
        wagesGroup: 'ss-whg',
      }));
      withholdingSourceIds.push(nid);
    }
  });
  w2s.forEach((doc, i) => {
    const ssWages = parseFloat(doc.fields.box3) || 0;
    if (ssWages > 0) {
      const company = (doc.fields.company || '').trim().split(/\s+/)[0];
      const suffix = company || (w2s.length > 1 ? `#${i + 1}` : null);
      const empName = (doc.fields.employeeName || '').trim().split(/\s+/)[0];
      const parts = [suffix, empName].filter(Boolean);
      const nid = `w2-ss-wages-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: parts.length > 0 ? `W-2 — SS — ${parts.join(' — ')}` : 'W-2 — SS',
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Box 3 SS wages', value: formatCurrency(doc.fields.box3) }],
        wagesGroup: 'ss',
      }));
    }
  });
  // W-2 Medicare WHG nodes — zone 5, stacked below refund
  w2s.forEach((doc, i) => {
    const medTax = parseFloat(doc.fields.box6) || 0;
    if (medTax > 0) {
      const company = (doc.fields.company || '').trim().split(/\s+/)[0];
      const suffix = company || (w2s.length > 1 ? `#${i + 1}` : null);
      const nid = `w2-med-whg-${doc.id}`;
      nodes.push(makeNode(nid, 5, 1, 'taxSource', {
        label: suffix ? `W-2 Medicare WHG — ${suffix}` : 'W-2 Medicare WHG',
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Box 6 Medicare tax withheld', value: formatCurrency(doc.fields.box6) }],
        wagesGroup: 'med-whg',
      }));
      withholdingSourceIds.push(nid);
    }
  });
  // W-2 Medicare wages nodes — zone 1, end of zone
  w2s.forEach((doc, i) => {
    const medWages = parseFloat(doc.fields.box5) || 0;
    if (medWages > 0) {
      const company = (doc.fields.company || '').trim().split(/\s+/)[0];
      const suffix = company || (w2s.length > 1 ? `#${i + 1}` : null);
      const nid = `w2-med-wages-${doc.id}`;
      nodes.push(makeNode(nid, 1, 0, 'taxSource', {
        label: suffix ? `W-2 Medicare — ${suffix}` : 'W-2 Medicare',
        sourceDocId: doc.id,
        highlighted: focusedDocId === doc.id,
        rows: [{ label: 'Box 5 Medicare wages', value: formatCurrency(doc.fields.box5) }],
        wagesGroup: 'med',
      }));
    }
  });
  // Total Medicare wages aggregation — zone 2, subCol 0
  if (medWagesDocs.length > 0) {
    nodes.push(makeNode('med-wages-agg', 2, 0, 'taxComputed', {
      label: 'Total Medicare wages',
      amount: totalMedWages,
      rows: [],
      ySyncGroup: 'med-wages',
    }));
    medWagesDocs.forEach(doc => {
      edges.push(makeEdge(eid(), `w2-med-wages-${doc.id}`, 'med-wages-agg', EDGE_COLORS.ssMedicare, parseFloat(doc.fields.box5) || 0, { tooltipLabel: 'Medicare wages' }));
    });

    // Zone 2 pass-through at AGI column — feeds into medicare brackets
    nodes.push(makeNode('med-wages-z2', 2, agiSubCol, 'taxComputed', {
      label: 'Total Medicare wages',
      amount: totalMedWages,
      rows: [],
      ySyncGroup: 'med-wages',
    }));
    nodes[nodes.length - 1].position.x = nodeX(2, agiSubCol);
    edges.push(makeEdge(eid(), 'med-wages-agg', 'med-wages-z2', EDGE_COLORS.ssMedicare, totalMedWages, { tooltipLabel: 'Total Medicare wages' }));

    // Zone 4 medicare brackets — 1.45% (standard) on top, 0.9% (excess) below
    const medThreshold = _filingStatus === 'mfj' ? 250000 : 200000;
    const medWagesStd   = Math.min(totalMedWages, medThreshold);
    const medWagesAbove = Math.max(0, totalMedWages - medThreshold);
    nodes.push(makeNode('med-bracket-145', 4, 4, 'taxBracket', {
      label: 'Medicare 1.45%',
      rate: 0.0145,
      income: medWagesStd,
      tax: medWagesStd * 0.0145,
      rangeFrom: 0,
      rangeTo: medThreshold,
      hideKeep: true,
      ySyncGroup: 'med-wages',
    }));
    nodes[nodes.length - 1].position.x = nodeX(4, 0);
    if (medWagesAbove > 0) {
      nodes.push(makeNode('med-bracket-09', 4, 4, 'taxBracket', {
        label: 'Medicare 0.9%',
        rate: 0.009,
        income: medWagesAbove,
        tax: medWagesAbove * 0.009,
        rangeFrom: medThreshold,
        rangeTo: Infinity,
        hideKeep: true,
        ySyncGroup: 'med-wages',
      }));
      nodes[nodes.length - 1].position.x = nodeX(4, 0);
      edges.push(makeEdge(eid(), 'med-wages-z2', 'med-bracket-09', EDGE_COLORS.ssMedicare, medWagesAbove, { tooltipLabel: 'Medicare wages above threshold' }));
    }
    if (medWagesStd > 0) edges.push(makeEdge(eid(), 'med-wages-z2', 'med-bracket-145', EDGE_COLORS.ssMedicare, medWagesStd, { tooltipLabel: 'Medicare wages' }));

    // Total Medicare tax node — zone 5, x aligned with Total income tax
    const totalMedTax = medWagesStd * 0.0145 + medWagesAbove * 0.009;
    nodes.push(makeNode('med-tax-total', 5, 0, 'taxComputed', {
      label: 'Total Medicare tax',
      amount: totalMedTax,
      rows: [],
      ySyncGroup: 'med-wages',
    }));
    if (medWagesStd * 0.0145 > 0) edges.push(makeEdge(eid(), 'med-bracket-145', 'med-tax-total', EDGE_COLORS.ssMedicare, medWagesStd * 0.0145, { tooltipLabel: 'Medicare tax (1.45%)' }));
    if (medWagesAbove * 0.009 > 0) edges.push(makeEdge(eid(), 'med-bracket-09', 'med-tax-total', EDGE_COLORS.ssMedicare, medWagesAbove * 0.009, { tooltipLabel: 'Additional Medicare tax (0.9%)' }));
  }

  // Zone 5 Medicare WHG aggregation
  if (medWhgDocs.length > 0) {
    const totalMedWhg = medWhgDocs.reduce((s, d) => s + (parseFloat(d.fields.box6) || 0), 0);
    nodes.push(makeNode('med-whg-agg', 5, 2, 'taxComputed', {
      label: 'Total Medicare withheld',
      amount: totalMedWhg,
      rows: [],
    }));
    medWhgDocs.forEach(doc => {
      edges.push(makeEdge(eid(), `w2-med-whg-${doc.id}`, 'med-whg-agg', EDGE_COLORS.ssMedicareWithholding, parseFloat(doc.fields.box6) || 0, { tooltipLabel: 'Medicare tax withheld' }));
    });
  }

  // Medicare tax net — zone 5 subCol 2, receives Total Medicare tax and Total Medicare withheld
  if (medWagesDocs.length > 0 || medWhgDocs.length > 0) {
    const totalMedTax = medWagesDocs.length > 0
      ? (() => { const std = Math.min(totalMedWages, _filingStatus === 'mfj' ? 250000 : 200000); const above = Math.max(0, totalMedWages - (_filingStatus === 'mfj' ? 250000 : 200000)); return std * 0.0145 + above * 0.009; })()
      : 0;
    const totalMedWhgNet = medWhgDocs.reduce((s, d) => s + (parseFloat(d.fields.box6) || 0), 0);
    const medTaxNetSubCol = medWhgDocs.length > 0 ? 3 : 1;
    nodes.push(makeNode('med-tax-net', 5, medTaxNetSubCol, 'taxComputed', {
      label: 'Medicare tax net',
      amount: totalMedWhgNet - totalMedTax,
      rows: [],
      ySyncGroup: 'med-wages',
    }));
    if (totalMedTax > 0)    edges.push(makeEdge(eid(), 'med-tax-total', 'med-tax-net', EDGE_COLORS.ssMedicare, totalMedTax, { tooltipLabel: 'Total Medicare tax' }));
    if (totalMedWhgNet > 0) edges.push(makeEdge(eid(), 'med-whg-agg',   'med-tax-net', EDGE_COLORS.ssMedicareWithholding, totalMedWhgNet, { tooltipLabel: 'Total Medicare withheld' }));
  }

  // SS overpayment calculation nodes — per employee with multiple W-2s
  // subCol 1: SS Wages + Social Security Tax + SS Withheld (stacked); subCol 2: SS Overpayment
  // Build SS data for ALL employees with SS wages (not just overpayment cases)
  const SS_WAGE_BASE_BG = 176100;
  const SS_RATE_BG = 0.062;
  const w2ByEmployeeBG = {};
  for (const doc of w2s) {
    const empKey = (doc.fields.employeeName || '').trim() || `__id_${doc.id}`;
    if (!w2ByEmployeeBG[empKey]) w2ByEmployeeBG[empKey] = [];
    w2ByEmployeeBG[empKey].push(doc);
  }
  const ssAllEmployeeRows = Object.values(w2ByEmployeeBG)
    .map(docs => {
      const employeeName = (docs[0].fields.employeeName || '').trim();
      const totalSsWages = docs.reduce((s, d) => s + Math.max(0, parseFloat(d.fields.box3) || 0), 0);
      if (totalSsWages === 0) return null;
      const cappedSsWages = Math.min(totalSsWages, SS_WAGE_BASE_BG);
      const calculatedSsTax = cappedSsWages * SS_RATE_BG;
      const totalSsWithheld = docs.reduce((s, d) => s + Math.max(0, parseFloat(d.fields.box4) || 0), 0);
      const overpayment = totalSsWithheld - calculatedSsTax;
      return { employeeName, totalSsWages, cappedSsWages, calculatedSsTax, totalSsWithheld, overpayment, docIds: docs.map(d => d.id) };
    })
    .filter(Boolean);

  // Per-employee "Total SS wages" nodes — shown for all employees with SS wages
  ssAllEmployeeRows.forEach(({ employeeName, totalSsWages, docIds }) => {
    const empFirst = (employeeName || '').split(/\s+/)[0];
    const ssWagesId = `ss-wages-${docIds[0]}`;
    nodes.push(makeNode(ssWagesId, 2, 0, 'taxComputed', {
      label: empFirst ? `Total SS wages — ${empFirst}` : 'Total Social Security wages',
      amount: totalSsWages,
      rows: totalSsWages > SS_WAGE_BASE_BG ? [{ label: 'Wage base cap', value: formatCurrency(SS_WAGE_BASE_BG) }] : [],
      ySyncGroup: 'ss-wages',
    }));
    docIds.forEach(docId => {
      const doc = w2s.find(d => d.id === docId);
      if (!doc) return;
      const ssWages = Math.max(0, parseFloat(doc.fields.box3) || 0);
      if (ssWages > 0) edges.push(makeEdge(eid(), `w2-ss-wages-${docId}`, ssWagesId, EDGE_COLORS.ssMedicare, ssWages, { tooltipLabel: 'Social Security wages' }));
    });
  });

  // Global SS aggregation nodes — shown whenever any SS wages exist
  if (ssAllEmployeeRows.length > 0) {
    const totalCappedWages = ssAllEmployeeRows.reduce((s, r) => s + r.cappedSsWages, 0);
    const ssTotalWagesId = 'ss-total-wages';
    nodes.push(makeNode(ssTotalWagesId, 2, agiSubCol, 'taxComputed', {
      label: 'Total Social security wages',
      amount: totalCappedWages,
      rows: [],
      ySyncGroup: 'ss-wages',
    }));
    nodes[nodes.length - 1].position.x = nodeX(2, agiSubCol);
    ssAllEmployeeRows.forEach(({ cappedSsWages, docIds }) => {
      if (cappedSsWages > 0) edges.push(makeEdge(eid(), `ss-wages-${docIds[0]}`, ssTotalWagesId, EDGE_COLORS.ssMedicare, cappedSsWages, { tooltipLabel: 'Social Security wages' }));
    });

    const totalCalculatedSsTax = ssAllEmployeeRows.reduce((s, r) => s + r.calculatedSsTax, 0);
    const ss6PctTaxId = 'ss-6pct-tax';
    nodes.push(makeNode(ss6PctTaxId, 4, 3, 'taxComputed', {
      label: 'SS 6.2% tax',
      amount: totalCappedWages,
      rows: [{ label: 'SS tax', value: formatCurrency(totalCalculatedSsTax) }],
      ySyncGroup: 'ss-wages',
    }));
    nodes[nodes.length - 1].position.x = nodeX(4, 0);
    if (totalCappedWages > 0) edges.push(makeEdge(eid(), ssTotalWagesId, ss6PctTaxId, EDGE_COLORS.ssMedicare, totalCappedWages, { tooltipLabel: 'Total SS wages' }));

    const ssTaxTotalId = 'ss-tax-total';
    nodes.push(makeNode(ssTaxTotalId, 5, 0, 'taxComputed', {
      label: 'Total Social Security tax',
      amount: totalCalculatedSsTax,
      rows: [],
      ySyncGroup: 'ss-wages',
    }));
    if (totalCalculatedSsTax > 0) edges.push(makeEdge(eid(), ss6PctTaxId, ssTaxTotalId, EDGE_COLORS.ssMedicare, totalCalculatedSsTax, { tooltipLabel: 'Social Security tax (6.2%)' }));

    const totalSsWithheld = ssAllEmployeeRows.reduce((s, r) => s + r.totalSsWithheld, 0);
    const ssWhTotalId = totalSsWithheld > 0 ? 'ss-wh-agg' : null;
    if (ssWhTotalId) {
      nodes.push(makeNode(ssWhTotalId, 5, 2, 'taxComputed', {
        label: 'Total SS withheld',
        amount: totalSsWithheld,
        rows: [],
        ySyncGroup: 'ss-whg',
      }));
      ssAllEmployeeRows.forEach(({ docIds }) => {
        docIds.forEach(docId => {
          const doc = w2s.find(d => d.id === docId);
          if (!doc) return;
          const ssTax = Math.max(0, parseFloat(doc.fields.box4) || 0);
          if (ssTax > 0) edges.push(makeEdge(eid(), `w2-ss-wh-${docId}`, ssWhTotalId, EDGE_COLORS.ssMedicareWithholding, ssTax, { tooltipLabel: 'Social Security tax withheld' }));
        });
      });
    }

    const totalSsOverpay = ssAllEmployeeRows.reduce((s, r) => s + r.overpayment, 0);
    const ssOverpayTotalId = 'ss-overpay-total';
    const ssOverpaySubCol = ssWhTotalId ? 3 : 1;
    nodes.push(makeNode(ssOverpayTotalId, 5, ssOverpaySubCol, 'taxComputed', {
      label: 'SS tax overpayment',
      amount: totalSsOverpay,
      rows: [],
      ySyncGroup: 'ss-wages',
    }));
    if (totalCalculatedSsTax > 0) edges.push(makeEdge(eid(), ssTaxTotalId, ssOverpayTotalId, EDGE_COLORS.ssMedicare, totalCalculatedSsTax, { tooltipLabel: 'Total Social Security tax' }));
    if (ssWhTotalId && totalSsWithheld > 0) edges.push(makeEdge(eid(), ssWhTotalId, ssOverpayTotalId, EDGE_COLORS.ssMedicareWithholding, totalSsWithheld, { tooltipLabel: 'Total Social Security withheld' }));
  }

  const ssOverpayRows = computed.ssOverpaymentByEmployee || [];

  // numDynamicSubColsZ5: highest zone-5 subCol (1–3) occupied by any node placed so far.
  const numDynamicSubColsZ5 = [3, 2, 1].find(sc =>
    nodes.some(n => n.data?.zone === 5 && n.data?.subCol === sc)
  ) ?? 0;

  const medTaxNetNode = nodes.find(n => n.id === 'med-tax-net');

  // Refund/Owed node — x positioned based on numDynamicSubColsZ5
  const refundId = 'refund-owed';
  const medTaxNetAdjustment = medTaxNetNode?.data?.amount ?? 0;
  const adjustedRefundOrOwed = computed.refundOrOwed + medTaxNetAdjustment;
  const adjustedIsRefund = adjustedRefundOrOwed >= 0;
  nodes.push(makeNode(refundId, 5, 1 + numDynamicSubColsZ5, 'taxResult', {
    label: adjustedIsRefund ? 'Refund' : 'Amount owed',
    amount: Math.abs(adjustedRefundOrOwed),
    isRefund: adjustedIsRefund,
    rows: [
      { label: 'Total income tax', value: formatCurrency(computed.totalTax) },
      { label: 'Total withheld', value: formatCurrency(computed.w2Withheld) },
      ...(computed.totalSsOverpayment > 0 ? [{ label: 'SS overpayment', value: formatCurrency(computed.totalSsOverpayment) }] : []),
      ...(medTaxNetNode && medTaxNetNode.data.amount !== 0 ? [{ label: 'Medicare tax net', value: formatCurrency(medTaxNetNode.data.amount) }] : []),
    ],
  }));

  edges.push(makeEdge(eid(), totalTaxId, refundId, EDGE_COLORS.bracket, computed.totalTax, { tooltipLabel: 'Total income tax' }));
  if (withholdingId) {
    edges.push(makeEdge(eid(), withholdingId, refundId, EDGE_COLORS.withholding, computed.w2Withheld, { tooltipLabel: 'Income tax withheld' }));
  }
  const ssOverpayNode = nodes.find(n => n.id === 'ss-overpay-total');
  if (ssOverpayNode && ssOverpayNode.data.amount !== 0) {
    edges.push(makeEdge(eid(), 'ss-overpay-total', refundId, EDGE_COLORS.ssMedicareWithholding, Math.abs(ssOverpayNode.data.amount), { tooltipLabel: 'Social Security overpayment' }));
  }
  if (medTaxNetNode && medTaxNetNode.data.amount !== 0) {
    edges.push(makeEdge(eid(), 'med-tax-net', refundId, EDGE_COLORS.ssMedicareWithholding, Math.abs(medTaxNetNode.data.amount), { tooltipLabel: 'Medicare tax net' }));
  }


  // Flows into amount you keep — brackets first (top), then LTCG, then deduction (bottom)
  brackets.forEach(b => {
    const kept = b.income * (1 - b.rate);
    if (kept > 0) edges.push(makeEdge(eid(), b.bid, keepId, EDGE_COLORS.deduction, kept, { tooltipLabel: `Kept income from ${Math.round(b.rate * 100)}% ordinary bracket` }));
  });
  // Deduction before LTCG so LTCG arrives at the very bottom
  edges.push(makeEdge(eid(), deductBracketId, keepId, EDGE_COLORS.deduction, computed.deductionUsed, { tooltipLabel: computed.deductionType === 'itemized' ? 'Itemized deduction (0% tax)' : 'Standard deduction (0% tax)' }));
  // LTCG bracket outflows — only brackets with income > 0 emit tax and keep flows
  prefBracketData.forEach(b => {
    if (b.income === 0) return;
    if (b.tax > 0)
      edges.push(makeEdge(eid(), b.bid, totalTaxId, EDGE_COLORS.ltcg, b.tax, { tooltipLabel: `Preferential income tax from ${Math.round(b.rate * 100)}% preferential bracket` }));
    const kept = b.income - b.tax;
    if (kept > 0)
      edges.push(makeEdge(eid(), b.bid, keepId, EDGE_COLORS.deduction, kept, { tooltipLabel: `Kept preferential income from ${Math.round(b.rate * 100)}% preferential bracket` }));
  });

  // ── Zone dividers (vertical dotted lines between zones) ───────────────────
  // Placed at the midpoint between each pair of adjacent zone starts.
  // Divider 1 (z2→z3) uses z2z3Divider (AGI is pinned against it).
  [
    null, // z1→z2 divider hidden
    null, // z2→z3 divider hidden
    null, // z3→z4 divider hidden
    null, // z4→z5 divider hidden
  ].filter(x => x !== null).forEach((x, i) => {
    nodes.push({
      id: `zone-divider-${i}`,
      type: 'zoneDivider',
      position: { x, y: 0 },
      data: {},
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      style: { border: 'none', background: 'none', padding: 0 },
    });
  });

  // Assign y-positions
  assignYPositions(nodes);

  // Re-position zone 1 subCol 0 source nodes using the first-node algorithm:
  // The first node of each doc-type group starts at NODE_V_GAP + max(prev group's last zone-1 bottom,
  // prev group's first zone-1 y + tallest associated zone-2 node height).
  // Subsequent nodes within a group keep the original stacking (prev y + height + gap).
  {
    const docTypeGroups = [
      { docType: 'W-2',                     nodeIds: w2s.filter(d => (parseFloat(d.fields.box1) || 0) > 0).map(d => `w2-inc-${d.id}`) },
      { docType: '1099-INT',                 nodeIds: int1099s.map(d => `int-${d.id}`) },
      { docType: '1099-DIV',                 nodeIds: div1099s.map(d => `div-${d.id}`) },
      { docType: '1099-B', nodeIds: [
          ...b1099s.map(d => `b-${d.id}`),
          ...carryoverDocs.map(d => `carryover-${d.id}`),
        ],
      },
      { docType: 'Other taxable income',     nodeIds: otherIncomeDocs.map(d => `other-inc-${d.id}`) },
      { docType: 'Adjustments to income',    nodeIds: adjToIncomeDocs.map(d => `adj-${d.id}`) },
      { docType: '1098-E',                   nodeIds: stdLoanDocs.map(d => `stdloan-${d.id}`) },
      { docType: 'Section 199A',             nodeIds: sec199aDocs.map(d => `sec199a-${d.id}`) },
      { docType: '1098+SALT', nodeIds: [
          ...mortgages.map(d => `mort-${d.id}`),
          ...saltDocs.map(d => `salt-${d.id}`),
        ],
      },
      { docType: 'Charitable donation',      nodeIds: charities.map(d => `char-${d.id}`) },
      { docType: 'W-2 SS wages',             nodeIds: w2s.filter(d => (parseFloat(d.fields.box3) || 0) > 0).map(d => `w2-ss-wages-${d.id}`) },
      { docType: 'W-2 Medicare wages',       nodeIds: w2s.filter(d => (parseFloat(d.fields.box5) || 0) > 0).map(d => `w2-med-wages-${d.id}`) },
    ];
    const docTypeZone2NodeIds = {
      'W-2':                   nodes.find(n => n.id === 'w2-wages-agg') ? ['w2-wages-agg'] : [],
      '1099-INT':              totalIntId ? [totalIntId] : [],
      '1099-DIV':              [schedBId, divQualSrcId === 'div-qual-agg' ? 'div-qual-agg' : null].filter(Boolean),
      '1099-B':                [schedD7Id, schedD17Id].filter(Boolean),
      'Other taxable income':  (otherIncomeMultiIds.length > 1 && computed.totalOtherIncome > 0) ? ['other-inc-agg'] : [],
      'Adjustments to income': (adjToIncomeDocs.length > 1 && computed.totalAdjustmentsToIncome > 0) ? ['adj-agg'] : [],
      '1098-E':                [stdLoanTotalId, stdLoanPhaseoutId].filter(Boolean),
      'Section 199A':          sec199aDocs.length > 0 ? ['sec199a-agg'] : [],
      '1098+SALT':             [showMortAgg ? 'mort-int-agg' : null, showSaltAgg ? 'salt-agg' : null].filter(Boolean),
      'Charitable donation':   showCharAgg ? ['char-agg'] : [],
      'W-2 SS wages':          ssOverpayRows.map(r => `ss-wages-${r.docIds[0]}`),
      'W-2 Medicare wages':    medWagesDocs.length > 0 ? ['med-wages-agg'] : [],
    };
    // Rough bracket-column bottom for initial placement — uses estimated heights.
    // Only includes type 'taxBracket' nodes (ordinary income, deduct-bracket, LTCG+QD).
    // ss-6pct-tax and medicare brackets are excluded because their y-positions aren't
    // final at this point (they get y-synced after repositionZone1SourceNodes runs).
    // Fine-tuned correction with actual measured heights happens in TaxCanvas nodesInitialized.
    const allBracketNodes = nodes.filter(n => n.type === 'taxBracket');
    const bracketColBottom = allBracketNodes.length > 0
      ? Math.max(...allBracketNodes.map(n => n.position.y + estimateNodeHeight(n)))
      : 0;

    repositionZone1SourceNodes(nodes, docTypeGroups, docTypeZone2NodeIds, {
      'W-2 SS wages': { extraBottom: bracketColBottom, gapMultiplier: 2 },
      'W-2 Medicare wages': {
        gapMultiplier: 2,
        extraBottom: () => {
          // SS wages nodes are already positioned by this point (processed earlier in the loop).
          // Estimate where the last SS WHG node would stack to, replicating the y-sync formula.
          const firstSsWages = nodes
            .filter(n => n.data?.wagesGroup === 'ss')
            .sort((a, b) => a.position.y - b.position.y)[0];
          if (!firstSsWages) return bracketColBottom;
          const ssWhgNodes = nodes.filter(n => n.data?.wagesGroup === 'ss-whg');
          if (ssWhgNodes.length === 0) return bracketColBottom;
          let y = firstSsWages.position.y + estimateNodeHeight(firstSsWages);
          for (const n of ssWhgNodes) {
            y += estimateNodeHeight(n) + NODE_V_GAP;
          }
          // After loop: y = lastWhgTop + lastWhgHeight + NODE_V_GAP
          // bottom of last WHG node = y - NODE_V_GAP
          return Math.max(y - NODE_V_GAP, bracketColBottom);
        },
      },
    });
  }

  // Align other income total node y to the first other income source node
  if (otherIncomeMultiIds.length > 1 && computed.totalOtherIncome > 0) {
    const firstOtherSrc = nodes.find(n => n.id === otherIncomeMultiIds[0]?.nid);
    const otherAggNode = nodes.find(n => n.id === 'other-inc-agg');
    if (firstOtherSrc && otherAggNode) otherAggNode.position.y = firstOtherSrc.position.y;
  }

  // Align Section 199A agg node and QBI deduction node y to the first Section 199A source node
  if (sec199aDocs.length > 0) {
    const firstSec199aSrc = nodes.find(n => n.id === `sec199a-${sec199aDocs[0].id}`);
    const sec199aAggNode  = nodes.find(n => n.id === 'sec199a-agg');
    const qbiCapNode      = nodes.find(n => n.id === 'qbi-deduction-cap');
    const qbiDeductNode   = nodes.find(n => n.id === 'qbi-deduction');
    if (firstSec199aSrc && sec199aAggNode) sec199aAggNode.position.y = firstSec199aSrc.position.y;
    if (sec199aAggNode && qbiCapNode)      qbiCapNode.position.y     = sec199aAggNode.position.y;
    if (firstSec199aSrc && qbiDeductNode)  qbiDeductNode.position.y  = firstSec199aSrc.position.y;
  }

  // Align student loan total and phaseout nodes y to the first 1098-E source node
  const firstStdLoanSrc = nodes.find(n => n.id === `stdloan-${stdLoanDocs[0]?.id}`);
  if (firstStdLoanSrc) {
    if (stdLoanTotalId) {
      const n = nodes.find(n => n.id === stdLoanTotalId);
      if (n) n.position.y = firstStdLoanSrc.position.y;
    }
    if (stdLoanPhaseoutId) {
      const n = nodes.find(n => n.id === stdLoanPhaseoutId);
      if (n) n.position.y = firstStdLoanSrc.position.y;
    }
  }

  // Align total-adjustments agg node y to the first adj source node
  if (adjToIncomeDocs.length > 1 && computed.totalAdjustmentsToIncome > 0) {
    const firstAdjNode = nodes.find(n => n.id === `adj-${adjToIncomeDocs[0].id}`);
    const aggNode = nodes.find(n => n.id === 'adj-agg');
    if (firstAdjNode && aggNode) {
      aggNode.position.y = firstAdjNode.position.y;
    }
  }

  // Position deduction node directly below taxable income, separated by the standard gap
  {
    const taxableNode = nodes.find(n => n.id === taxableIncId);
    const deductNode  = nodes.find(n => n.id === deductionId);
    if (taxableNode && deductNode) {
      deductNode.position.y = taxableNode.position.y + estimateNodeHeight(taxableNode) + NODE_V_GAP;
    }
  }



  // Align Total interest node with its source (single 1099-INT or first of multiple)
  if (totalIntId) {
    const totalIntNode = nodes.find(n => n.id === totalIntId);
    const anchorId = interestSrcId || intMultiIds[0]?.nid;
    const intSrcNode = nodes.find(n => n.id === anchorId);
    if (totalIntNode && intSrcNode) totalIntNode.position.y = intSrcNode.position.y;
  }

  // Align Total ordinary dividends with the first div source feeding into it.
  // Must run after int-agg is repositioned above.
  if (schedBId && divOrdSrcId) {
    const schedBNode = nodes.find(n => n.id === schedBId);
    const divSrcNode = nodes.find(n => n.id === divOrdSrcId);
    if (schedBNode && divSrcNode) schedBNode.position.y = divSrcNode.position.y;
  }

  // Position div-qual-agg in zone 2 — must run after Total ordinary dividends is positioned above.
  // — below Total ordinary dividends (y + height + gap) if that node exists
  // — otherwise aligned with the first 1099-DIV source node
  if (divQualSrcId === 'div-qual-agg') {
    const qualAgg = nodes.find(n => n.id === 'div-qual-agg');
    if (qualAgg) {
      if (schedBId) {
        const schedBNode = nodes.find(n => n.id === schedBId);
        if (schedBNode) qualAgg.position.y = schedBNode.position.y + estimateNodeHeight(schedBNode) + NODE_V_GAP;
      } else {
        const firstDivSrc = nodes.find(n => n.id === `div-${div1099s[0]?.id}`);
        if (firstDivSrc) qualAgg.position.y = firstDivSrc.position.y;
      }
    }
  }

  // Align Schedule D nodes with the first 1099-B source (or carryover if no 1099-B).
  // Must run after Schedule B is positioned (to avoid overlap in the same subCol).
  if (hasSchedDInputs && (schedD7Id || schedD17Id)) {
    const anchorId = b1099s.length > 0 ? `b-${b1099s[0].id}` : carryoverSrcId;
    const anchorNode = nodes.find(n => n.id === anchorId);
    const schedD7Node = schedD7Id ? nodes.find(n => n.id === schedD7Id) : null;
    const schedD15Node = schedD17Id ? nodes.find(n => n.id === schedD17Id) : null;
    const topSchedDNode = schedD7Node || schedD15Node;
    const stLtNetNode = stLtNetId ? nodes.find(n => n.id === stLtNetId) : null;
    if (anchorNode && topSchedDNode) {
      // Start aligned with anchor node, but don't overlap Schedule B
      let topY = anchorNode.position.y;
      if (schedBId) {
        const schedBNode = nodes.find(n => n.id === schedBId);
        if (schedBNode) topY = Math.max(topY, schedBNode.position.y + estimateNodeHeight(schedBNode) + NODE_V_GAP);
      }
      if (schedD7Node) schedD7Node.position.y = topY;
      if (schedD15Node) schedD15Node.position.y = schedD7Node ? topY + estimateNodeHeight(schedD7Node) + NODE_V_GAP : topY;
      // ST/LT Netting aligns with the topmost Schedule D node
      if (stLtNetNode) stLtNetNode.position.y = topY;
      // Carryover-to-next-year: max of ST/LT netting node y and bottom of Total income + gap
      const carryNextNode = carryNextYearId ? nodes.find(n => n.id === carryNextYearId) : null;
      if (carryNextNode) {
        const totalIncNode = nodes.find(n => n.id === totalIncomeId);
        const totalIncBottom = totalIncNode
          ? totalIncNode.position.y + estimateNodeHeight(totalIncNode) + NODE_V_GAP
          : 0;
        const stLtNetY = stLtNetNode ? stLtNetNode.position.y : topY;
        carryNextNode.position.y = Math.max(stLtNetY, totalIncBottom);
      }
    }
  }

  // Align Preferential income node
  if (prefIncomeId) {
    const prefNode = nodes.find(n => n.id === prefIncomeId);
    if (prefNode) {
      if (divQualSrcId && computed.totalQualifiedDividends > 0) {
        const qualAggNode = nodes.find(n => n.id === divQualSrcId);
        if (qualAggNode) prefNode.position.y = qualAggNode.position.y;
      } else if (computed.schedDLine15 > 0 && computed.schedDLine7 >= 0) {
        const ltNode = schedD17Id ? nodes.find(n => n.id === schedD17Id) : null;
        if (ltNode) prefNode.position.y = ltNode.position.y;
      } else if (computed.schedDLine15 > 0 && computed.schedDLine7 < 0) {
        const netNode = stLtNetId ? nodes.find(n => n.id === stLtNetId) : null;
        if (netNode) prefNode.position.y = netNode.position.y;
      }
    }
  }

  // Align mort-int-agg with the first 1098 source node (both single-capped and multi cases)
  const intAggNode = nodes.find(n => n.id === 'mort-int-agg');
  if (intAggNode) {
    const firstMortSrcId = mortMultiIds.length > 0
      ? mortMultiIds[0].nid
      : (mortgages.length === 1 ? `mort-${mortgages[0].id}` : null);
    const firstMortSrc = nodes.find(n => n.id === firstMortSrcId);
    if (firstMortSrc) intAggNode.position.y = firstMortSrc.position.y;
  }

  // Align salt-agg: with first state/local source if present, otherwise below mort-int-agg
  // (to avoid overlap when both are in zone 2 subCol 0), otherwise with first 1098 real estate source
  if (showSaltAgg) {
    const saltAggNode = nodes.find(n => n.id === 'salt-agg');
    if (saltAggNode) {
      if (saltSourceIds.length > 0 && !intAggNode) {
        const firstSaltSrc = nodes.find(n => n.id === saltSourceIds[0].nid);
        if (firstSaltSrc) saltAggNode.position.y = firstSaltSrc.position.y;
      } else if (intAggNode) {
        // mort-int-agg present — stack salt-agg below it to avoid overlap in zone 2 subCol 0
        saltAggNode.position.y = intAggNode.position.y + estimateNodeHeight(intAggNode) + NODE_V_GAP;
      } else {
        // No mort-int-agg — align with the 1098 source feeding real estate taxes
        const firstReSrcId = mortTaxSourceId || (mortMultiIds.length > 0 ? mortMultiIds[0].nid : null);
        const firstReSrc = nodes.find(n => n.id === firstReSrcId);
        if (firstReSrc) saltAggNode.position.y = firstReSrc.position.y;
      }
    }
  }

  // Align the charitable agg node with the first charitable source node
  if (showCharAgg && charSourceIds.length > 0) {
    const firstCharSource = nodes.find(n => n.id === charSourceIds[0].nid);
    const charAggNode = nodes.find(n => n.id === 'char-agg');
    if (firstCharSource && charAggNode) {
      charAggNode.position.y = firstCharSource.position.y;
    }
  }

  // Ensure charitable source nodes start below salt-agg bottom.
  // repositionZone1SourceNodes estimates salt-agg's position starting from prevGroupFirstY
  // (the first 1098+SALT node), but salt-agg is actually aligned to the first SALT source node,
  // which may be further down (after all mortgage nodes in the group). This post-processing
  // pass corrects any resulting overlap.
  if (showSaltAgg && charSourceIds.length > 0) {
    const saltAggNode = nodes.find(n => n.id === 'salt-agg');
    const firstCharNode = nodes.find(n => n.id === charSourceIds[0].nid);
    if (saltAggNode && firstCharNode) {
      const minCharY = saltAggNode.position.y + estimateNodeHeight(saltAggNode) + NODE_V_GAP;
      if (firstCharNode.position.y < minCharY) {
        const delta = minCharY - firstCharNode.position.y;
        charSourceIds.forEach(({ nid }) => {
          const n = nodes.find(node => node.id === nid);
          if (n) n.position.y += delta;
        });
        const charAggNode = nodes.find(n => n.id === 'char-agg');
        if (charAggNode) charAggNode.position.y += delta;
      }
    }
  }

  // Align itemized deductions node y with the topmost input node that flows into it
  if (itemizedDeductId) {
    const itemizedNode = nodes.find(n => n.id === itemizedDeductId);
    if (itemizedNode) {
      const candidateIds = [
        (mortIntSourceId && computed.totalMortgageInterest > 0) ? mortIntSourceId : null,
        (showSaltAgg && computed.totalSalt > 0) ? 'salt-agg' : null,
        (!showSaltAgg && mortTaxSourceId && computed.totalRealEstateTaxesRaw > 0) ? mortTaxSourceId : null,
        charNodeId,
      ].filter(Boolean);
      const ys = candidateIds
        .map(id => nodes.find(n => n.id === id)?.position.y)
        .filter(y => y !== undefined);
      if (ys.length > 0) itemizedNode.position.y = Math.min(...ys);
    }
  }

  // Give keepId standard spacing below totalTaxId using the actual node height
  syncKeepY(nodes, keepId, totalTaxId);

  // Position withholding nodes below the refund/owed node
  syncWithholdingY(nodes, withholdingSourceIds, withholdingAggId, refundId);

  // Align medicare nodes with their first source nodes
  if (medWagesDocs.length > 0) {
    const firstMedWagesNode = nodes.find(n => n.id === `w2-med-wages-${medWagesDocs[0].id}`);
    const medAggNode        = nodes.find(n => n.id === 'med-wages-agg');
    const medWagesZ2Node    = nodes.find(n => n.id === 'med-wages-z2');
    const medBracket145Node = nodes.find(n => n.id === 'med-bracket-145');
    const medBracket09Node  = nodes.find(n => n.id === 'med-bracket-09');
    const medTaxTotalNode   = nodes.find(n => n.id === 'med-tax-total');
    if (firstMedWagesNode) {
      if (medAggNode)        medAggNode.position.y        = firstMedWagesNode.position.y;
      if (medWagesZ2Node)    medWagesZ2Node.position.y    = firstMedWagesNode.position.y;
      if (medBracket09Node)  medBracket09Node.position.y  = firstMedWagesNode.position.y;
      if (medBracket145Node) medBracket145Node.position.y = medBracket09Node
        ? firstMedWagesNode.position.y + estimateNodeHeight(medBracket09Node) + NODE_V_GAP
        : firstMedWagesNode.position.y;
      if (medTaxTotalNode)   medTaxTotalNode.position.y   = firstMedWagesNode.position.y;
      const medTaxNetNode = nodes.find(n => n.id === 'med-tax-net');
      if (medTaxNetNode)     medTaxNetNode.position.y     = firstMedWagesNode.position.y;
    }
  }
  if (medWhgDocs.length > 0) {
    const firstMedWagesNode = nodes.find(n => n.id === `w2-med-wages-${medWagesDocs[0]?.id}`);
    const medWhgAggNode     = nodes.find(n => n.id === 'med-whg-agg');
    if (firstMedWagesNode) {
      // Stack all Medicare WHG source nodes below the first Medicare wages node, NODE_V_GAP/2 apart
      const medWhgSourceNodes = nodes.filter(n => n.data?.wagesGroup === 'med-whg');
      let whgY = firstMedWagesNode.position.y + estimateNodeHeight(firstMedWagesNode);
      for (const n of medWhgSourceNodes) {
        n.position.y = whgY;
        whgY += estimateNodeHeight(n) + NODE_V_GAP;
      }
    }
    const firstMedWhgNode = nodes.find(n => n.id === `w2-med-whg-${medWhgDocs[0].id}`);
    if (medWhgAggNode && firstMedWhgNode) medWhgAggNode.position.y = firstMedWhgNode.position.y;
  }

  // Align per-employee SS wages node with the first W-2 SS source that flows into it
  ssAllEmployeeRows.forEach(({ docIds }) => {
    const w2Node      = nodes.find(n => n.id === `w2-ss-wages-${docIds[0]}`);
    const ssWagesNode = nodes.find(n => n.id === `ss-wages-${docIds[0]}`);
    if (w2Node && ssWagesNode) ssWagesNode.position.y = w2Node.position.y;
  });
  // Align global nodes with the first W-2 SS source nodes
  if (ssAllEmployeeRows.length > 0) {
    const firstRow = ssAllEmployeeRows[0];
    const firstSsWagesNode   = nodes.find(n => n.id === `w2-ss-wages-${firstRow.docIds[0]}`);
    const firstSsWhgNode     = nodes.find(n => n.id === `w2-ss-wh-${firstRow.docIds[0]}`);
    const ssTotalWagesNode   = nodes.find(n => n.id === 'ss-total-wages');
    const ss6PctTaxNode      = nodes.find(n => n.id === 'ss-6pct-tax');
    const ssTaxTotalNode     = nodes.find(n => n.id === 'ss-tax-total');
    const ssWhTotalNode      = nodes.find(n => n.id === 'ss-wh-agg');
    const ssOverpayTotalNode = nodes.find(n => n.id === 'ss-overpay-total');
    if (ssTotalWagesNode && firstSsWagesNode)  ssTotalWagesNode.position.y   = firstSsWagesNode.position.y;
    if (ss6PctTaxNode && firstSsWagesNode)     ss6PctTaxNode.position.y      = firstSsWagesNode.position.y;
    if (ssTaxTotalNode && firstSsWagesNode)    ssTaxTotalNode.position.y     = firstSsWagesNode.position.y;
    if (firstSsWagesNode) {
      // Stack all SS WHG source nodes below the first SS wages node, NODE_V_GAP/2 apart
      const ssWhgSourceNodes = nodes.filter(n => n.data?.wagesGroup === 'ss-whg');
      let whgY = firstSsWagesNode.position.y + estimateNodeHeight(firstSsWagesNode);
      for (const n of ssWhgSourceNodes) {
        n.position.y = whgY;
        whgY += estimateNodeHeight(n) + NODE_V_GAP;
      }
    }
    const firstWhgY = firstSsWhgNode?.position.y;
    if (ssWhTotalNode && firstWhgY !== undefined) ssWhTotalNode.position.y = firstWhgY;
    if (ssOverpayTotalNode && firstSsWagesNode)   ssOverpayTotalNode.position.y = firstSsWagesNode.position.y;
  }

  // Normalize edge widths: linear scaling against the largest flow in the graph
  normalizeEdgeWidths(edges);

  // Assign per-node vertical offsets so flows don't all meet at a single point
  assignSankeyOffsets(edges);

  // Flows into refund: two stacking groups, each centered independently at the handle.
  // Tax group: totalTax + (if medicare is owed) medTaxNet + (if SS overpay is negative) ss-overpay-total.
  // Credit group: withholding flows + (if medicare is a credit) medTaxNet.
  {
    const medTaxNetOwed = (medTaxNetNode?.data?.amount ?? 0) < 0;
    const ssOverpayOwed = (ssOverpayNode?.data?.amount ?? 0) < 0;
    const stackGroup = (sources) => {
      const grp = edges.filter(e => e.target === refundId && sources.has(e.source) && (e.data?.widthPx > 0));
      const total = grp.reduce((s, e) => s + e.data.widthPx, 0);
      let y = -total / 2;
      for (const edge of grp) { edge.data.targetOffsetY = y + edge.data.widthPx / 2; y += edge.data.widthPx; }
    };
    const taxSources = new Set([
      totalTaxId,
      ...(medTaxNetOwed ? ['med-tax-net'] : []),
      ...(ssOverpayOwed ? ['ss-overpay-total'] : []),
    ]);
    const creditSources = new Set(
      edges.filter(e => e.target === refundId && !taxSources.has(e.source)).map(e => e.source)
    );
    stackGroup(taxSources);
    stackGroup(creditSources);
  }

  // Both flows into the SS overpayment node are centered individually on its input handle
  for (const edge of edges) {
    if (edge.target === 'ss-overpay-total') edge.data.targetOffsetY = 0;
  }

  // Both flows into Medicare tax net are centered individually on its input handle
  for (const edge of edges) {
    if (edge.target === 'med-tax-net') edge.data.targetOffsetY = 0;
  }

  // Taxable income input handle: re-center income flows and QBI deduction flow independently.
  if (taxableIncId) {
    const restack = (grp) => {
      const total = grp.reduce((s, e) => s + e.data.widthPx, 0);
      let y = -total / 2;
      for (const edge of grp) {
        edge.data.targetOffsetY = y + edge.data.widthPx / 2;
        y += edge.data.widthPx;
      }
    };
    const taxableIncomeFlows = edges.filter(e =>
      e.target === taxableIncId && e.source === totalOrdIncId && e.data?.widthPx > 0
    );
    const qbiFlows = edges.filter(e =>
      e.target === taxableIncId && e.source === qbiDeductionId && e.data?.widthPx > 0
    );
    restack(taxableIncomeFlows);
    restack(qbiFlows);
  }

  // AGI input handle: re-center Total income flows and adj/student loan flows independently.
  // assignSankeyOffsets groups all AGI-targeting edges together, which skews both groups.
  {
    const restack = (grp) => {
      const total = grp.reduce((s, e) => s + e.data.widthPx, 0);
      let y = -total / 2;
      for (const edge of grp) {
        edge.data.targetOffsetY = y + edge.data.widthPx / 2;
        y += edge.data.widthPx;
      }
    };
    const incomeFlows = edges.filter(e =>
      e.target === totalOrdIncId && e.source === totalIncomeId && e.data?.widthPx > 0
    );
    const adjSlFlows = edges.filter(e =>
      e.target === totalOrdIncId &&
      (e.data?.color === EDGE_COLORS.adjustment || e.data?.color === EDGE_COLORS.studentLoan) &&
      e.data?.widthPx > 0
    );
    restack(incomeFlows);
    restack(adjSlFlows);
  }

  // Total income input handle: re-center positive flows independently from capital loss flows.
  {
    const positiveFlows = edges.filter(e =>
      e.target === totalIncomeId && e.data?.color !== EDGE_COLORS.capitalLoss && e.data?.widthPx > 0
    );
    const total = positiveFlows.reduce((s, e) => s + e.data.widthPx, 0);
    let y = -total / 2;
    for (const edge of positiveFlows) {
      edge.data.targetOffsetY = y + edge.data.widthPx / 2;
      y += edge.data.widthPx;
    }
  }

  // Capital loss flows into Total income: center at the input handle.
  for (const edge of edges) {
    if (edge.target === totalIncomeId && edge.data?.color === EDGE_COLORS.capitalLoss) {
      edge.data.targetOffsetY = 0;
    }
  }

  // Schedule D nodes: z-stack positive (gains) and negative (losses) input flows.
  // Each sign-group is stacked in y and centered at 0, so both groups converge on the
  // same handle point and overlap in z-order rather than spreading apart vertically.
  function zStackSignGroups(targetId) {
    const incoming = edges.filter(e => e.target === targetId && e.data?.widthPx > 0);
    if (incoming.length === 0) return;
    const pos = incoming.filter(e => (e.data?.amount || 0) >= 0);
    const neg = incoming.filter(e => (e.data?.amount || 0) < 0);
    [pos, neg].forEach(group => {
      const total = group.reduce((s, e) => s + e.data.widthPx, 0);
      let y = -total / 2;
      for (const edge of group) {
        edge.data.targetOffsetY = y + edge.data.widthPx / 2;
        y += edge.data.widthPx;
      }
    });
    // Render positive (gain) flows on top
    neg.forEach(e => { e.zIndex = 0; });
    pos.forEach(e => { e.zIndex = 1; });
  }
  if (schedD7Id) zStackSignGroups(schedD7Id);
  if (schedD17Id) zStackSignGroups(schedD17Id);
  if (stLtNetId) zStackSignGroups(stLtNetId);

  // Itemized deduction flows into the deduction node: re-stack as a group centered at 0.
  // The total ordinary income flow is centered at 0 independently and renders on top.
  const deductItemEdges = edges.filter(
    e => e.target === deductionId && e.source !== totalOrdIncId && (e.data?.widthPx > 0)
  );
  if (deductItemEdges.length > 0) {
    const total = deductItemEdges.reduce((s, e) => s + e.data.widthPx, 0);
    let y = -total / 2;
    for (const edge of deductItemEdges) {
      edge.data.targetOffsetY = y + edge.data.widthPx / 2;
      y += edge.data.widthPx;
    }
  }
  for (const edge of edges) {
    if (edge.source === totalOrdIncId && edge.target === deductionId) {
      edge.data.targetOffsetY = 0;
      edge.zIndex = 10;
    }
  }

  return { nodes, edges };
}

function syncKeepY(nodes, keepId, totalTaxId) {
  const keepNode = nodes.find(n => n.id === keepId);
  const taxNode  = nodes.find(n => n.id === totalTaxId);
  if (keepNode && taxNode) {
    keepNode.position.y = taxNode.position.y + estimateNodeHeight(taxNode) + NODE_V_GAP;
  }
}


// Position withholding source nodes below the refund/owed node.
// Source nodes (taxSource) have no amount section so they render shorter than bracket nodes.
// Use NODE_MIN_HEIGHT as the step to get a similar visual gap to bracket nodes.
// The agg node is pinned to the same y as the first source (to its right).
function syncWithholdingY(nodes, sourceIds, aggId, refundId) {
  const refundNode = nodes.find(n => n.id === refundId);
  if (!refundNode || sourceIds.length === 0) return;
  const startY = refundNode.position.y + estimateNodeHeight(refundNode) * 0.75;
  let y = startY;
  for (const id of sourceIds) {
    const node = nodes.find(n => n.id === id);
    if (node) {
      node.position.y = y;
      y += estimateNodeHeight(node) + NODE_V_GAP;
    }
  }
  // Agg node aligns with the first source (already at subCol 1 to the right)
  if (aggId) {
    const aggNode = nodes.find(n => n.id === aggId);
    if (aggNode) aggNode.position.y = startY;
  }
}

const MAX_SANKEY_WIDTH = 40;

function normalizeEdgeWidths(edges) {
  const maxAmount = Math.max(0, ...edges.map(e => Math.abs(e.data?.amount || 0)));
  if (maxAmount <= 0) return;
  for (const edge of edges) {
    const amount = Math.abs(edge.data?.amount || 0);
    edge.data.widthPx = amount > 0
      ? Math.max(1, (amount / maxAmount) * MAX_SANKEY_WIDTH)
      : 0;
  }
}

// For each node, stack outgoing and incoming flows vertically so they don't
// all converge on the same point. Offsets are relative to the node center (0 = center).
function assignSankeyOffsets(edges) {
  const bySource = {};
  const byTarget = {};

  for (const edge of edges) {
    if (edge.data?.isReference || !(edge.data?.widthPx > 0)) continue;
    if (!bySource[edge.source]) bySource[edge.source] = [];
    if (!byTarget[edge.target]) byTarget[edge.target] = [];
    bySource[edge.source].push(edge);
    byTarget[edge.target].push(edge);
  }

  for (const nodeEdges of Object.values(bySource)) {
    const stackable = nodeEdges.filter(e => !e.sourceHandle);
    const total = stackable.reduce((s, e) => s + e.data.widthPx, 0);
    let y = -total / 2;
    for (const edge of stackable) {
      edge.data.sourceOffsetY = y + edge.data.widthPx / 2;
      y += edge.data.widthPx;
    }
  }

  for (const nodeEdges of Object.values(byTarget)) {
    const total = nodeEdges.reduce((s, e) => s + e.data.widthPx, 0);
    let y = -total / 2;
    for (const edge of nodeEdges) {
      edge.data.targetOffsetY = y + edge.data.widthPx / 2;
      y += edge.data.widthPx;
    }
  }
}

// Estimate each node's rendered height so spine nodes can be centered before DOM measurement.
// Based on CSS: header=30px, amount=40px, subtitle=18px, rows-padding=14px, per-row=21px, border=2px.
function estimateNodeHeight(node) {
  const type = node.type;
  const data = node.data || {};
  const rows = data.rows?.length || 0;
  const subtitle = data.subtitle ? 18 : 0;
  const HEADER = 30;
  const AMOUNT = 40;
  const ROWS_PAD = rows > 0 ? 14 : 0;
  const ROW = 21;
  const BORDER = 2;
  if (type === 'taxSource') return BORDER + HEADER + subtitle + ROWS_PAD + rows * ROW;
  if (type === 'taxBracket') {
    if (data.hideInBracket) return BORDER + HEADER + AMOUNT;
    // Ordinary brackets render Tax + Keep (2 rows).
    // LTCG brackets (ordinaryIncome present) render a subtitle ("LTCG + Qual div") below
    // the amount, then Ordinary inc row, plus Tax and Keep only when income > 0.
    const SUBTITLE = 18;
    const isPref = data.ordinaryIncome !== undefined;
    const prefSubtitle = isPref ? SUBTITLE : 0;
    const prefBaseRows = isPref ? 1 : 0;                   // Ordinary inc
    const taxRows = data.income > 0 ? 2 : 0;               // Tax + Keep (only when income > 0)
    const dataRows = prefBaseRows + (isPref ? taxRows : 2); // ordinary brackets always show Tax+Keep
    const hasRows = dataRows > 0;
    return BORDER + HEADER + AMOUNT + prefSubtitle + (hasRows ? ROWS_PAD + dataRows * ROW : 0);
  }
  return BORDER + HEADER + subtitle + AMOUNT + ROWS_PAD + rows * ROW; // taxComputed, taxDeduction, taxResult
}

// Re-position zone 1 subCol 0 source nodes so that the first node of each doc-type group
// starts at NODE_V_GAP below the maximum of:
//   (a) the bottom of the last node in the previous group, and
//   (b) the bottom of the tallest zone-2 node associated with the previous group
//       (anchored at the previous group's first node y, since zone-2 syncs align to that y).
// Subsequent nodes within a group are stacked with the standard prev+height+gap rule.
function repositionZone1SourceNodes(nodes, docTypeGroups, docTypeZone2NodeIds, groupConstraints = {}) {
  let prevGroupFirstY = null;
  let prevGroupLastNodeBottom = null;
  let prevDocType = null;

  for (const { docType, nodeIds } of docTypeGroups) {
    const groupNodes = nodeIds
      .map(id => nodes.find(n => n.id === id))
      .filter(Boolean);
    if (groupNodes.length === 0) continue;

    let firstY;
    if (prevGroupFirstY === null) {
      // First group: keep whatever assignYPositions set (centered at SPINE_CENTER_Y)
      firstY = groupNodes[0].position.y;
    } else {
      const prevZone2Ids = docTypeZone2NodeIds[prevDocType] || [];
      // Treat the associated zone-2 node list as a vertical stack anchored at prevGroupFirstY
      // (matching how zone-2 y-syncs position them relative to the first zone-1 node).
      // This correctly handles cases like div-qual-agg, which is stacked below sched-b rather
      // than aligned directly with prevGroupFirstY.
      let stackY = prevGroupFirstY;
      let prevZone2MaxBottom = prevGroupFirstY;
      for (const id of prevZone2Ids) {
        const n = nodes.find(node => node.id === id);
        if (n) {
          stackY += estimateNodeHeight(n);
          if (stackY > prevZone2MaxBottom) prevZone2MaxBottom = stackY;
          stackY += NODE_V_GAP;
        }
      }
      const constraint = groupConstraints[docType];
      const gapMultiplier = constraint?.gapMultiplier ?? 1;
      const rawExtra    = constraint?.extraBottom ?? 0;
      const extraBottom = typeof rawExtra === 'function' ? rawExtra() : rawExtra;
      firstY = gapMultiplier * NODE_V_GAP + Math.max(prevGroupLastNodeBottom, prevZone2MaxBottom, extraBottom);
    }

    groupNodes[0].position.y = firstY;
    let y = firstY + estimateNodeHeight(groupNodes[0]) + NODE_V_GAP;
    for (let i = 1; i < groupNodes.length; i++) {
      groupNodes[i].position.y = y;
      y += estimateNodeHeight(groupNodes[i]) + NODE_V_GAP;
    }

    prevGroupFirstY = firstY;
    prevGroupLastNodeBottom = y - NODE_V_GAP;
    prevDocType = docType;
  }
}

// Position nodes in each zone/subCol column.
// The first node of every column is centered at SPINE_CENTER_Y; subsequent nodes stack below it.
// This aligns the "primary" node of each column (the one on the logical flow path) on a shared
// horizontal midline, while extra nodes (additional sources, etc.) extend downward.
function assignYPositions(nodes) {
  const colMap = {};
  for (const node of nodes) {
    if (node.type === 'zoneDivider') continue;
    const key = `${node.data.zone}-${node.data.subCol}`;
    if (!colMap[key]) colMap[key] = [];
    colMap[key].push(node);
  }
  for (const colNodes of Object.values(colMap)) {
    const firstH = estimateNodeHeight(colNodes[0]);
    let y = SPINE_CENTER_Y - firstH / 2;
    colNodes.forEach(node => {
      node.position.y = y;
      y += estimateNodeHeight(node) + NODE_V_GAP;
    });
  }
}
