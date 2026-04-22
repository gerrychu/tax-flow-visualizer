// Hardcoded preset scenarios. Each preset contains the full loadable state:
// { filingStatus, overrides, documents }
// Documents use stable placeholder IDs — they are replaced with nanoid() when loaded.

export const PRESETS = [
  {
    name: 'Single W-2 earner',
    description: 'One job, standard deduction, withholding',
    filingStatus: 'single',
    overrides: {},
    documents: [
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Acme Corp',
          employeeName: 'Alex',
          box1: '85000',
          box2: '12000',
          box3: '85000',
          box4: '5270',
          box5: '85000',
          box6: '1233',
        },
      },
    ],
  },
  {
    name: 'Married, two W-2s + investments',
    description: 'MFJ, two incomes, dividends, cap gains',
    filingStatus: 'mfj',
    overrides: {},
    documents: [
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Globex',
          employeeName: 'Jordan',
          box1: '145000',
          box2: '22000',
          box3: '145000',
          box4: '8990',
          box5: '145000',
          box6: '2103',
        },
      },
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Initech',
          employeeName: 'Riley',
          box1: '120000',
          box2: '18000',
          box3: '120000',
          box4: '7440',
          box5: '120000',
          box6: '1740',
        },
      },
      {
        type: '1099-DIV',
        note: 'Arbor Financial',
        fields: { line1a: '8200', line1b: '6000', line5: '1200' },
      },
      {
        type: '1099-B',
        note: 'Keystone Brokerage',
        fields: { shortTerm: '3500', longTerm: '18000' },
      },
    ],
  },
  {
    name: 'High earner, itemized deductions',
    description: 'Single, high income, mortgage + charitable',
    filingStatus: 'single',
    overrides: {},
    documents: [
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Kennedy&Co',
          employeeName: 'Morgan',
          box1: '320000',
          box2: '72000',
          box3: '160200',
          box4: '9932',
          box5: '320000',
          box6: '4640',
        },
      },
      {
        type: '1098',
        note: 'Lakewood Mortgage',
        fields: {
          mortgageInterest: '28000',
          outstandingPrincipal: '1300000',
          originationDate: '2021-06-01',
          principalBalanceDec31: '1250000',
          realEstateTaxes: '9500',
        },
      },
      {
        type: 'State and local taxes',
        note: '',
        fields: { amount: '4000' },
      },
      {
        type: 'Charitable donation',
        note: 'Red Cross',
        fields: { amount: '15000' },
      },
      {
        type: 'Charitable donation',
        note: 'Nature Conservancy',
        fields: { amount: '8500' },
      },
    ],
  },
  {
    name: 'SS overpayment — two employers',
    description: 'Two W-2s for same person, SS wages exceed the base',
    filingStatus: 'single',
    overrides: {},
    documents: [
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'LautnerGroup',
          employeeName: 'Casey',
          box1: '110000',
          box2: '14000',
          box3: '110000',
          box4: '6820',
          box5: '110000',
          box6: '1595',
        },
      },
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'AmerIces',
          employeeName: 'Casey',
          box1: '95000',
          box2: '12000',
          box3: '95000',
          box4: '5890',
          box5: '95000',
          box6: '1378',
        },
      },
    ],
  },
  {
    name: 'Capital loss carryover',
    description: 'Prior-year losses offset current gains',
    filingStatus: 'single',
    overrides: {},
    documents: [
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Hooli',
          employeeName: 'Sam',
          box1: '95000',
          box2: '14000',
          box3: '95000',
          box4: '5890',
          box5: '95000',
          box6: '1378',
        },
      },
      {
        type: '1099-B',
        note: 'Keystone Brokerage',
        fields: { shortTerm: '4000', longTerm: '12000' },
      },
      {
        type: '1099-B',
        note: 'Harbor Securities',
        fields: { shortTerm: '-200', longTerm: '-3000' },
      },
      {
        type: 'Capital loss carryover',
        note: '',
        fields: { shortTermLoss: '-8000', longTermLoss: '-10000' },
      },
    ],
  },
  {
    name: 'Stress test',
    description: 'MFJ, every cap + phaseout + overpayment + carryover',
    filingStatus: 'mfj',
    overrides: {},
    documents: [
      // Alex: two W-2s from different employers → SS overpayment (combined SS wages > $176,100)
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Pinnacle Tech',
          employeeName: 'Alex',
          box1: '140000',
          box2: '28000',
          box3: '140000',
          box4: '8680',
          box5: '140000',
          box6: '2030',
        },
      },
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Summit Logistics',
          employeeName: 'Alex',
          box1: '85000',
          box2: '11000',
          box3: '85000',
          box4: '5270',
          box5: '85000',
          box6: '1233',
        },
      },
      // Jordan: single W-2
      {
        type: 'W-2',
        note: '',
        fields: {
          company: 'Crestview Capital',
          employeeName: 'Jordan',
          box1: '200000',
          box2: '42000',
          box3: '176100',
          box4: '10918',
          box5: '200000',
          box6: '2900',
        },
      },
      // Interest income (two accounts)
      {
        type: '1099-INT',
        note: 'Arbor Financial',
        fields: { line1: '3800' },
      },
      {
        type: '1099-INT',
        note: 'Meridian Bank',
        fields: { line1: '1600' },
      },
      // Dividends: qualified + Section 199A (two funds) → preferential income + QBI deduction
      {
        type: '1099-DIV',
        note: 'Arbor Financial',
        fields: { line1a: '12000', line1b: '9000', line5: '3000' },
      },
      {
        type: '1099-DIV',
        note: 'Westbrook Investments',
        fields: { line1a: '5000', line1b: '3500', line5: '1200' },
      },
      // Capital gains/losses: net loss to force carryover to next year
      {
        type: '1099-B',
        note: 'Keystone Brokerage',
        fields: { shortTerm: '-15000', longTerm: '-25000' },
      },
      {
        type: '1099-B',
        note: 'Harbor Securities',
        fields: { shortTerm: '4000', longTerm: '9000' },
      },
      // Previous year capital loss carryover (offsets current gains, adds to net loss)
      {
        type: 'Capital loss carryover',
        note: '',
        fields: { shortTermLoss: '-3000', longTermLoss: '-8000' },
      },
      // Student loan interest → fully phased out at this income level
      {
        type: '1098-E',
        note: 'Clarity Loan Services',
        fields: { box1: '2500' },
      },
      // Mortgage: avg principal ~$1.375M >> $750k post-TCJA cap → interest capped
      {
        type: '1098',
        note: 'Evergreen Home Loans',
        fields: {
          mortgageInterest: '42000',
          outstandingPrincipal: '1400000',
          originationDate: '2020-03-01',
          principalBalanceDec31: '1350000',
          realEstateTaxes: '14000',
        },
      },
      // State income tax: combined SALT ($14k RE + $18k state) >> $10k cap
      {
        type: 'State and local taxes',
        note: '',
        fields: { amount: '18000' },
      },
      // Charitable donations: total $300k > 60% of AGI (~$267k) → charitable cap
      {
        type: 'Charitable donation',
        note: 'Red Cross',
        fields: { amount: '18000' },
      },
      {
        type: 'Charitable donation',
        note: 'Hospital Foundation',
        fields: { amount: '22000' },
      },
      {
        type: 'Charitable donation',
        note: 'University endowment',
        fields: { amount: '260000' },
      },
    ],
  },
];
