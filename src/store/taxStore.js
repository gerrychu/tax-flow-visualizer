import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { decodeStateFromHash } from '../utils/urlState';
import { PRESETS } from '../utils/presets';

// ─── Tax brackets 2025 ───────────────────────────────────────────────────────
const BRACKETS = {
  single: [
    { rate: 0.10, upTo: 11925 },
    { rate: 0.12, upTo: 48475 },
    { rate: 0.22, upTo: 103350 },
    { rate: 0.24, upTo: 197300 },
    { rate: 0.32, upTo: 250525 },
    { rate: 0.35, upTo: 626350 },
    { rate: 0.37, upTo: Infinity },
  ],
  mfj: [
    { rate: 0.10, upTo: 23850 },
    { rate: 0.12, upTo: 96950 },
    { rate: 0.22, upTo: 206700 },
    { rate: 0.24, upTo: 394600 },
    { rate: 0.32, upTo: 501050 },
    { rate: 0.35, upTo: 751600 },
    { rate: 0.37, upTo: Infinity },
  ],
};

const STANDARD_DEDUCTION = { single: 15000, mfj: 30000 };

const LTCG_THRESHOLDS = {
  single: { rate0: 48350, rate15: 533400 },
  mfj: { rate0: 96700, rate15: 600050 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clampPositive(v) { return Math.max(0, v || 0); }
function num(v) { return parseFloat(v) || 0; }

function calcBracketTax(taxableIncome, filingStatus) {
  const brackets = BRACKETS[filingStatus];
  const results = [];
  let remaining = Math.max(0, taxableIncome);
  let prev = 0;

  for (const bracket of brackets) {
    const cap = bracket.upTo === Infinity ? Infinity : bracket.upTo;
    const width = cap === Infinity ? remaining : Math.max(0, Math.min(remaining, cap - prev));
    const inBracket = Math.min(remaining, width);
    results.push({
      rate: bracket.rate,
      income: inBracket,
      tax: inBracket * bracket.rate,
      rangeFrom: prev,
      rangeTo: bracket.upTo,
    });
    remaining -= inBracket;
    prev = cap === Infinity ? cap : bracket.upTo;
    if (remaining <= 0) break;
  }

  // Fill remaining brackets with $0
  const maxIdx = results.length;
  for (let i = maxIdx; i < brackets.length; i++) {
    results.push({
      rate: brackets[i].rate,
      income: 0,
      tax: 0,
      rangeFrom: i > 0 ? brackets[i - 1].upTo : 0,
      rangeTo: brackets[i].upTo,
    });
  }

  return results;
}

// Returns 3 bracket entries (highest rate first) for LTCG income stacked on top of
// ordinary taxable income. Brackets where ordinary income already fills the range have
// income=0 (node shown, no edges).
function calcPrefBrackets(ltcgIncome, ordinaryTaxableIncome, filingStatus) {
  const { rate0, rate15 } = LTCG_THRESHOLDS[filingStatus];
  // Process lowest → highest so LTCG fills cheaper brackets first
  const tiers = [
    { rate: 0.00, from: 0,      to: rate0    },
    { rate: 0.15, from: rate0,  to: rate15   },
    { rate: 0.20, from: rate15, to: Infinity },
  ];
  let remaining = Math.max(0, ltcgIncome);
  const results = tiers.map(t => {
    const preFilled = Math.max(0, Math.min(ordinaryTaxableIncome, t.to === Infinity ? ordinaryTaxableIncome : t.to) - t.from);
    const available = t.to === Infinity ? remaining : Math.max(0, (t.to - t.from) - preFilled);
    const income    = Math.min(remaining, available);
    remaining -= income;
    return { rate: t.rate, income, tax: income * t.rate, rangeFrom: t.from, rangeTo: t.to, ordinaryIncome: preFilled };
  });
  // Reverse so array is highest-rate-first (20% → 15% → 0%) for display
  return results.reverse();
}

// ─── recalculate ─────────────────────────────────────────────────────────────
function recalculate(documents, filingStatus, overrides) {
  // Group documents by type
  const byType = {};
  for (const doc of documents) {
    if (!byType[doc.type]) byType[doc.type] = [];
    byType[doc.type].push(doc);
  }

  const w2s = byType['W-2'] || [];
  const int1099s = byType['1099-INT'] || [];
  const div1099s = byType['1099-DIV'] || [];
  const b1099s = byType['1099-B'] || [];
  const mortgages = byType['1098'] || [];
  const charities = byType['Charitable donation'] || [];

  // ── W-2 ──
  const w2Wages = w2s.reduce((s, d) => s + num(d.fields.box1), 0);
  const w2Withheld = w2s.reduce((s, d) => s + num(d.fields.box2), 0);
  const w2SsWithheld = w2s.reduce((s, d) => s + num(d.fields.box4), 0);
  const w2MedWithheld = w2s.reduce((s, d) => s + num(d.fields.box6), 0);
  const totalWithheld = w2Withheld + w2SsWithheld + w2MedWithheld;

  // ── Schedule B ──
  const totalInterest = int1099s.reduce((s, d) => s + num(d.fields.line1), 0);
  const totalOrdinaryDividends = div1099s.reduce((s, d) => s + num(d.fields.line1a), 0);
  const totalQualifiedDividends = div1099s.reduce((s, d) => s + Math.min(num(d.fields.line1b), num(d.fields.line1a)), 0);
  const totalSection199A = div1099s.reduce((s, d) => s + num(d.fields.line5), 0);
  // Schedule B = interest + (ordinary dividends - qualified dividends)
  // Section 199A dividends (Box 5) are already included in ordinary dividends (Box 1a) — not added again
  const scheduleB = totalInterest + (totalOrdinaryDividends - totalQualifiedDividends);

  // ── Schedule D ──
  const stGainRaw = b1099s.reduce((s, d) => s + num(d.fields.shortTerm), 0);
  const ltGainRaw = b1099s.reduce((s, d) => s + num(d.fields.longTerm), 0);

  const carryoverDoc = documents.find(d => d.type === 'Capital loss carryover');
  // Carryover fields stored as negative numbers; cap at ≤ 0 (losses only)
  const stCarryoverRaw = carryoverDoc ? Math.min(0, num(carryoverDoc.fields.shortTermLoss)) : 0;
  const ltCarryoverRaw = carryoverDoc ? Math.min(0, num(carryoverDoc.fields.longTermLoss)) : 0;
  const stCarryover = Math.abs(stCarryoverRaw); // positive magnitude for display/edges
  const ltCarryover = Math.abs(ltCarryoverRaw);

  // ST/LT netting (Schedule D Part III)
  const stCapLossLimit = overrides['schedD.stCapLoss'] === 'ignore' ? Infinity : 3000;
  const stNet = stGainRaw + stCarryoverRaw; // stCarryoverRaw is ≤ 0
  const ltNet = ltGainRaw + ltCarryoverRaw;

  // Cross-netting rules:
  //   ST gain + LT gain  → no netting; ST → ordinary, LT → preferential
  //   ST loss + LT gain  → LT absorbs ST loss; remaining LT → preferential; leftover ST loss (≤$3k) → reduces ordinary
  //   ST gain + LT loss  → LT loss absorbs ST gain; remaining net → ordinary (ST character); net loss (≤$3k) → reduces ordinary
  //   Both losses        → combined net loss, ≤$3k reduces ordinary; rest is carryforward
  let stForOrdinary;
  let ltAfterNetting;
  const netTotal = stNet + ltNet;

  if (stNet >= 0 && ltNet >= 0) {
    stForOrdinary = stNet;
    ltAfterNetting = ltNet;
  } else if (stNet < 0 && ltNet >= 0) {
    // ST loss offsets LT gain; surviving gain keeps LT (preferential) character
    ltAfterNetting = Math.max(0, netTotal);
    stForOrdinary = netTotal < 0 ? Math.max(-stCapLossLimit, netTotal) : 0;
  } else if (stNet >= 0 && ltNet < 0) {
    // LT loss offsets ST gain; surviving gain keeps ST (ordinary) character
    ltAfterNetting = 0;
    stForOrdinary = netTotal >= 0 ? netTotal : Math.max(-stCapLossLimit, netTotal);
  } else {
    // Both losses
    ltAfterNetting = 0;
    stForOrdinary = Math.max(-stCapLossLimit, netTotal);
  }

  const schedDLine7 = stNet;   // Net short-term capital gain or (loss)
  const schedDLine15 = ltNet;  // Net long-term capital gain or (loss)

  // Capital loss carryovers to next year — excess loss beyond the $3k deduction
  // IRS rule: ST losses used first for the deduction, then LT
  const netTotal2 = stNet + ltNet;
  const netLoss = Math.max(0, -netTotal2);
  const deductionApplied = Math.min(netLoss, stCapLossLimit);
  let stNextYearCarryover = 0;
  let ltNextYearCarryover = 0;
  if (netLoss > deductionApplied) {
    if (stNet < 0 && ltNet >= 0) {
      stNextYearCarryover = netLoss - deductionApplied;
    } else if (stNet >= 0 && ltNet < 0) {
      ltNextYearCarryover = netLoss - deductionApplied;
    } else {
      // Both losses — split carryover proportionally by ST/LT share of total loss
      const stLossAbs = Math.abs(stNet);
      const ltLossAbs = Math.abs(ltNet);
      const totalLossAbs = stLossAbs + ltLossAbs;
      const remaining = netLoss - deductionApplied;
      stNextYearCarryover = totalLossAbs > 0 ? remaining * (stLossAbs / totalLossAbs) : 0;
      ltNextYearCarryover = remaining - stNextYearCarryover;
    }
  }

  // ST/LT netting result
  const ltcgForPreferential = ltAfterNetting + totalQualifiedDividends;

  // ── Other taxable income ──
  const otherIncomeDocs = byType['Other taxable income'] || [];
  const totalOtherIncome = otherIncomeDocs.reduce((s, d) => s + Math.max(0, num(d.fields.amount)), 0);

  // ── Total ordinary income ──
  // stForOrdinary can be negative (capital loss deduction up to $3k) — this correctly reduces ordinary income
  const totalOrdinaryIncome = w2Wages + scheduleB + stForOrdinary + totalOtherIncome;

  // ── Above-the-line adjustments ──
  const adjDocs = byType['Adjustments to income'] || [];
  const totalAdjustmentsToIncome = adjDocs.reduce((s, d) => s + Math.max(0, num(d.fields.amount)), 0);

  // ── Student loan interest deduction (1098-E, Schedule 1 Part II) ──
  const STUDENT_LOAN_CAP = 2500;
  const STUDENT_LOAN_PHASEOUT = {
    single: { start: 80000, end: 95000 },
    mfj:    { start: 165000, end: 195000 },
  };
  const stdLoanDocs = byType['1098-E'] || [];
  const totalStudentLoanInterestRaw = stdLoanDocs.reduce((s, d) => s + Math.max(0, num(d.fields.box1)), 0);
  const studentLoanInterestCapped = Math.min(totalStudentLoanInterestRaw, STUDENT_LOAN_CAP);
  const studentLoanIsCapped = totalStudentLoanInterestRaw > STUDENT_LOAN_CAP;
  const magiForStudentLoan = totalOrdinaryIncome - totalAdjustmentsToIncome;
  const slPhaseoutRange = STUDENT_LOAN_PHASEOUT[filingStatus] || STUDENT_LOAN_PHASEOUT.single;
  const studentLoanPhaseoutFraction = totalStudentLoanInterestRaw > 0
    ? Math.min(1, Math.max(0, (magiForStudentLoan - slPhaseoutRange.start) / (slPhaseoutRange.end - slPhaseoutRange.start)))
    : 0;
  const studentLoanDeduction = studentLoanInterestCapped * (1 - studentLoanPhaseoutFraction);
  const hasStudentLoanPhaseout = studentLoanPhaseoutFraction > 0 && totalStudentLoanInterestRaw > 0;

  // ── AGI ──
  const agi = totalOrdinaryIncome + Math.max(0, ltcgForPreferential) - totalAdjustmentsToIncome - studentLoanDeduction;

  // ── Deductions ──
  // Mortgage interest — average balance method with pre/post TCJA origination date limits
  // Pre-Dec 15, 2017: $1,000,000 limit (grandfathered); Post-Dec 15, 2017: $750,000 limit
  const useMortgageCap = overrides['deduction.mortgageCap'] !== 'ignore';
  const PRE_TCJA_CUTOFF = '2017-12-15';
  const PRE_TCJA_LIMIT = 1_000_000;
  const POST_TCJA_LIMIT = 750_000;

  let totalMortgageInterestRaw = 0;
  let totalMortgageInterest = 0;
  let isMortgageCapped = false;
  let mortgageLimitApplied = null;

  if (mortgages.length > 0) {
    const mortData = mortgages.map(doc => {
      const interest = num(doc.fields.mortgageInterest);
      const startBal = num(doc.fields.outstandingPrincipal);
      const endBal = num(doc.fields.principalBalanceDec31);
      // Average of Jan 1 and Dec 31 balances; fall back to Jan 1 alone if Dec 31 not provided
      const avgBal = endBal > 0 ? (startBal + endBal) / 2 : startBal;
      // Originated on or before Dec 15, 2017 → $1M limit; after → $750k
      const isPreTcja = doc.fields.originationDate
        ? doc.fields.originationDate <= PRE_TCJA_CUTOFF
        : false;
      return { interest, avgBal, isPreTcja };
    });

    totalMortgageInterestRaw = mortData.reduce((s, m) => s + m.interest, 0);

    if (useMortgageCap) {
      const preTcja = mortData.filter(m => m.isPreTcja);
      const postTcja = mortData.filter(m => !m.isPreTcja);
      const totalAvgPre = preTcja.reduce((s, m) => s + m.avgBal, 0);
      const totalAvgPost = postTcja.reduce((s, m) => s + m.avgBal, 0);
      const ratioPre = totalAvgPre > PRE_TCJA_LIMIT ? PRE_TCJA_LIMIT / totalAvgPre : 1;
      const ratioPost = totalAvgPost > POST_TCJA_LIMIT ? POST_TCJA_LIMIT / totalAvgPost : 1;

      for (const m of mortData) {
        totalMortgageInterest += m.interest * (m.isPreTcja ? ratioPre : ratioPost);
      }

      isMortgageCapped = totalMortgageInterest < totalMortgageInterestRaw - 0.01;
      if (isMortgageCapped) {
        if (preTcja.length > 0 && postTcja.length === 0) mortgageLimitApplied = PRE_TCJA_LIMIT;
        else if (postTcja.length > 0 && preTcja.length === 0) mortgageLimitApplied = POST_TCJA_LIMIT;
        else mortgageLimitApplied = ratioPre < 1 ? PRE_TCJA_LIMIT : POST_TCJA_LIMIT;
      }
    } else {
      totalMortgageInterest = totalMortgageInterestRaw;
    }
  }

  // SALT (state and local taxes) — $10k cap applies to real estate taxes + state/local taxes combined
  const useSaltCap = overrides['deduction.saltCap'] !== 'ignore';
  const saltDocs = byType['State and local taxes'] || [];
  const totalRealEstateTaxesRaw = mortgages.reduce((s, d) => s + num(d.fields.realEstateTaxes), 0);
  const totalRealEstateTaxes = totalRealEstateTaxesRaw; // kept for display; cap applied at combined SALT level
  const totalStateLocalTaxesRaw = saltDocs.reduce((s, d) => s + num(d.fields.amount), 0);
  const totalSaltRaw = totalRealEstateTaxesRaw + totalStateLocalTaxesRaw;
  const totalSalt = useSaltCap ? Math.min(totalSaltRaw, 10000) : totalSaltRaw;
  const isSaltCapped = useSaltCap && totalSaltRaw > 10000;

  // Charitable donations with 60% AGI cap
  const useCharitableCap = overrides['deduction.charitableCap'] !== 'ignore';
  const totalCharitableRaw = charities.reduce((s, d) => s + num(d.fields.amount), 0);
  const charitableCap = agi * 0.60;
  const totalCharitable = useCharitableCap
    ? Math.min(totalCharitableRaw, charitableCap)
    : totalCharitableRaw;

  const itemizedTotal = totalMortgageInterest + totalSalt + totalCharitable;
  const standardDeduction = STANDARD_DEDUCTION[filingStatus];

  let deductionUsed, deductionType;
  const deductionOverride = overrides['deduction.choice'];
  if (deductionOverride === 'standard') {
    deductionUsed = standardDeduction;
    deductionType = 'standard';
  } else if (deductionOverride === 'itemized') {
    deductionUsed = itemizedTotal;
    deductionType = 'itemized';
  } else {
    // auto: take larger
    if (itemizedTotal >= standardDeduction) {
      deductionUsed = itemizedTotal;
      deductionType = 'itemized';
    } else {
      deductionUsed = standardDeduction;
      deductionType = 'standard';
    }
  }

  // ── Taxable income ──
  const taxableIncome = Math.max(0, agi - deductionUsed);

  // ── Bracket tax ──
  const bracketResults = calcBracketTax(taxableIncome, filingStatus);
  const ordinaryTax = bracketResults.reduce((s, b) => s + b.tax, 0);

  // ── LTCG tax ──
  // Ordinary income for LTCG bracket stacking = total income minus long-term capital gains.
  // totalOrdinaryIncome already excludes ltAfterNetting (LTCG is tracked separately).
  const ordinaryTaxableIncome = totalOrdinaryIncome;
  const prefBracketResults = calcPrefBrackets(ltcgForPreferential, ordinaryTaxableIncome, filingStatus);
  const prefTax = prefBracketResults.reduce((s, b) => s + b.tax, 0);

  // ── Social Security overpayment ──
  // Each employer withholds SS independently. If one employee holds multiple jobs
  // and total SS wages exceed the 2025 wage base ($176,100), they overpaid SS —
  // the excess is a credit on Form 1040.
  const SS_WAGE_BASE = 176100;
  const SS_RATE = 0.062;

  const w2ByEmployee = {};
  for (const doc of w2s) {
    const empKey = (doc.fields.employeeName || '').trim() || `__id_${doc.id}`;
    if (!w2ByEmployee[empKey]) w2ByEmployee[empKey] = [];
    w2ByEmployee[empKey].push(doc);
  }

  const ssOverpaymentByEmployee = [];
  let totalSsOverpayment = 0;
  for (const docs of Object.values(w2ByEmployee)) {
    if (docs.length < 2) continue;
    if (!docs.every(d => num(d.fields.box3) > 0)) continue;
    const totalSsWages = docs.reduce((s, d) => s + num(d.fields.box3), 0);
    const totalSsWithheld = docs.reduce((s, d) => s + Math.max(0, num(d.fields.box4)), 0);
    const cappedSsWages = Math.min(totalSsWages, SS_WAGE_BASE);
    const calculatedSsTax = cappedSsWages * SS_RATE;
    const overpayment = Math.max(0, totalSsWithheld - calculatedSsTax);
    if (overpayment > 0) {
      ssOverpaymentByEmployee.push({
        employeeName: (docs[0].fields.employeeName || '').trim(),
        totalSsWages,
        cappedSsWages,
        calculatedSsTax,
        totalSsWithheld,
        overpayment,
        docIds: docs.map(d => d.id),
      });
      totalSsOverpayment += overpayment;
    }
  }

  // Total SS tax across all employees (per-person wage base cap)
  const totalSsTax = Object.values(w2ByEmployee).reduce((total, docs) => {
    const totalSsWages = docs.reduce((s, d) => s + num(d.fields.box3), 0);
    return total + Math.min(totalSsWages, SS_WAGE_BASE) * SS_RATE;
  }, 0);

  // ── Results ──
  const totalTax = ordinaryTax + prefTax;
  const refundOrOwed = w2Withheld + totalSsOverpayment - totalTax;

  // Medicare tax net (withheld minus owed) — mirrors buildGraph med-tax-net node
  const totalMedWages = w2s.reduce((s, d) => s + num(d.fields.box5), 0);
  const medThreshold = filingStatus === 'mfj' ? 250000 : 200000;
  const medStdWages = Math.min(totalMedWages, medThreshold);
  const medAboveWages = Math.max(0, totalMedWages - medThreshold);
  const totalMedTax = totalMedWages > 0 ? medStdWages * 0.0145 + medAboveWages * 0.009 : 0;
  const medTaxNet = w2MedWithheld - totalMedTax;
  const totalAllTaxes = totalTax + totalSsTax + totalMedTax;
  const adjustedRefundOrOwed = refundOrOwed + medTaxNet;
  const adjustedIsRefund = adjustedRefundOrOwed >= 0;

  const amountYouKeep = totalOrdinaryIncome + Math.max(0, ltcgForPreferential) - totalTax;

  return {
    // Inputs
    w2Wages,
    w2Withheld,
    w2SsWithheld,
    w2MedWithheld,
    totalWithheld,
    totalSsTax,
    totalMedTax,
    totalAllTaxes,
    medTaxNet,
    adjustedRefundOrOwed,
    adjustedIsRefund,
    // Schedule B
    totalInterest,
    totalOrdinaryDividends,
    totalQualifiedDividends,
    totalSection199A,
    scheduleB,
    // Schedule D
    stGainRaw,
    ltGainRaw,
    stCarryover,
    ltCarryover,
    schedDLine7,
    schedDLine15,
    stForOrdinary,
    ltAfterNetting,
    stNextYearCarryover,
    ltNextYearCarryover,
    ltcgForPreferential,
    // Income
    totalOtherIncome,
    totalOrdinaryIncome,
    totalAdjustmentsToIncome,
    totalStudentLoanInterestRaw,
    studentLoanInterestCapped,
    studentLoanIsCapped,
    magiForStudentLoan,
    studentLoanPhaseoutFraction,
    studentLoanDeduction,
    hasStudentLoanPhaseout,
    slPhaseoutRange,
    agi,
    // Deductions
    totalMortgageInterestRaw,
    totalMortgageInterest,
    isMortgageCapped,
    mortgageLimitApplied,
    totalRealEstateTaxesRaw,
    totalRealEstateTaxes,
    totalStateLocalTaxesRaw,
    totalSaltRaw,
    totalSalt,
    isSaltCapped,
    totalCharitableRaw,
    charitableCap,
    totalCharitable,
    itemizedTotal,
    standardDeduction,
    deductionUsed,
    deductionType,
    // Taxable
    taxableIncome,
    // Tax
    bracketResults,
    ordinaryTax,
    prefTax,
    prefBracketResults,
    totalTax,
    // Social Security overpayment
    ssOverpaymentByEmployee,
    totalSsOverpayment,
    // Results
    refundOrOwed,
    amountYouKeep,
    isRefund: refundOrOwed >= 0,
  };
}

// ─── Document field definitions ───────────────────────────────────────────────
export const DOC_FIELDS = {
  'W-2': [
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'employeeName', label: 'Employee name', type: 'text' },
    { key: 'box1', label: 'Box 1 Wages', type: 'currency' },
    { key: 'box2', label: 'Box 2 Federal income tax withheld', type: 'currency' },
    { key: 'box3', label: 'Box 3 Social security wages', type: 'currency' },
    { key: 'box4', label: 'Box 4 Social security tax withheld', type: 'currency' },
    { key: 'box5', label: 'Box 5 Medicare wages and tips', type: 'currency' },
    { key: 'box6', label: 'Box 6 Medicare tax withheld', type: 'currency' },
  ],
  '1099-INT': [
    { key: 'line1', label: 'Box 1 Interest income', type: 'currency' },
  ],
  '1099-DIV': [
    { key: 'line1a', label: 'Box 1a Total ordinary dividends', type: 'currency' },
    { key: 'line1b', label: 'Box 1b Qualified dividends', type: 'currency', maxFromField: 'line1a' },
    { key: 'line5', label: 'Box 5 Section 199A dividends', type: 'currency' },
  ],
  '1099-B': [
    { key: 'shortTerm', label: 'Short-term gain/loss (net)', type: 'currency', allowNegative: true },
    { key: 'longTerm', label: 'Long-term gain/loss (net)', type: 'currency', allowNegative: true },
  ],
  '1098': [
    { key: 'mortgageInterest', label: 'Box 1 Mortgage interest received', type: 'currency' },
    { key: 'outstandingPrincipal', label: 'Box 2 Outstanding mortgage principal', type: 'currency' },
    { key: 'originationDate', label: 'Box 3 Mortgage origination date', type: 'date' },
    { key: 'principalBalanceDec31', label: 'Principal balance as of Dec 31', type: 'currency' },
    { key: 'realEstateTaxes', label: 'Real estate taxes paid', type: 'currency' },
  ],
  'State and local taxes': [
    { key: 'amount', label: 'Amount', type: 'currency' },
  ],
  'Charitable donation': [
    { key: 'amount', label: 'Amount', type: 'currency' },
  ],
  'Capital loss carryover': [
    { key: 'shortTermLoss', label: 'Short-term loss carryover', type: 'currency', allowNegative: true, forceNegative: true },
    { key: 'longTermLoss', label: 'Long-term loss carryover', type: 'currency', allowNegative: true, forceNegative: true },
  ],
  'Other taxable income': [
    { key: 'amount', label: 'Amount', type: 'currency' },
  ],
  'Adjustments to income': [
    { key: 'amount', label: 'Amount', type: 'currency' },
  ],
  '1098-E': [
    { key: 'box1', label: 'Box 1 Student loan interest', type: 'currency' },
  ],
};

export const DOC_TYPE_ORDER = ['W-2', '1099-INT', '1099-DIV', '1099-B', 'Capital loss carryover', 'Other taxable income', 'Adjustments to income', '1098-E', '1098', 'State and local taxes', 'Charitable donation'];

// ─── Store ────────────────────────────────────────────────────────────────────
// Attempt to restore state from URL hash on first load; otherwise use the first preset.
const _fromHash = decodeStateFromHash();
const _defaultPreset = PRESETS[0];
const _initDocs = _fromHash
  ? _fromHash.documents.map(d => ({ ...d, id: nanoid() }))
  : _defaultPreset.documents.map(d => ({ ...d, id: nanoid() }));
const _initStatus = _fromHash?.filingStatus ?? _defaultPreset.filingStatus;
const _initOverrides = _fromHash?.overrides ?? _defaultPreset.overrides;

export const useTaxStore = create((set) => ({
  documents: _initDocs,
  filingStatus: _initStatus,
  overrides: _initOverrides,
  focusedDocId: null,
  expandToDocId: null,
  sankeyMode: true,
  lastAddedDocId: null,
  computed: recalculate(_initDocs, _initStatus, _initOverrides),

  addDocument: (type) => {
    const defaultFields = {};
    (DOC_FIELDS[type] || []).forEach(f => { defaultFields[f.key] = ''; });
    const doc = { id: nanoid(), type, note: '', fields: defaultFields };
    set(state => {
      const docs = [...state.documents, doc];
      return { documents: docs, lastAddedDocId: doc.id, computed: recalculate(docs, state.filingStatus, state.overrides) };
    });
    return doc.id;
  },

  clearLastAddedDoc: () => set({ lastAddedDocId: null }),

  deleteDocument: (id) => {
    set(state => {
      const docs = state.documents.filter(d => d.id !== id);
      return {
        documents: docs,
        focusedDocId: state.focusedDocId === id ? null : state.focusedDocId,
        computed: recalculate(docs, state.filingStatus, state.overrides),
      };
    });
  },

  updateDocument: (id, patch) => {
    set(state => {
      const docs = state.documents.map(d => {
        if (d.id !== id) return d;
        if (patch.fields) return { ...d, fields: { ...d.fields, ...patch.fields } };
        return { ...d, ...patch };
      });
      return { documents: docs, computed: recalculate(docs, state.filingStatus, state.overrides) };
    });
  },

  setFilingStatus: (status) => {
    set(state => ({
      filingStatus: status,
      computed: recalculate(state.documents, status, state.overrides),
    }));
  },

  setOverride: (key, value) => {
    set(state => {
      const overrides = { ...state.overrides, [key]: value };
      return { overrides, computed: recalculate(state.documents, state.filingStatus, overrides) };
    });
  },

  // Load a full scenario (preset or URL-decoded). Documents get fresh IDs.
  loadScenario: ({ documents, filingStatus, overrides = {} }) => {
    const docs = documents.map(d => ({ ...d, id: nanoid() }));
    set({
      documents: docs,
      filingStatus,
      overrides,
      focusedDocId: null,
      expandToDocId: null,
      computed: recalculate(docs, filingStatus, overrides),
    });
  },

  clearDocuments: () => {
    set(state => ({ documents: [], focusedDocId: null, computed: recalculate([], state.filingStatus, state.overrides) }));
  },

  setFocusedDoc: (id) => set({ focusedDocId: id }),
  setExpandToDoc: (id) => set({ expandToDocId: id }),
  clearExpandToDoc: () => set({ expandToDocId: null }),
  setSankeyMode: (v) => set({ sankeyMode: v }),
  showExportMenu: false,
  setShowExportMenu: (v) => set({ showExportMenu: v }),
  showPresetsMenu: false,
  setShowPresetsMenu: (v) => set({ showPresetsMenu: v }),
}));

// Expose nanoid for use in components
export { nanoid };
