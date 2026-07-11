const SHEETS = {
  '1_81VM_63ZT_p5LEGkvEU2MBxbc4RBWzmd_RKgXL_icA': 'Russell',
  '1M_YHSLrdQ-XK3TitCU5Sv5OKwE-jBXR6JnvNQ1kmtMI': 'Russ LLC',
  '1BgTn3p1GPpbfV78vXZlz3tJAUrT8_iJ17tcVrUSlgig': 'BANOS',
  '1k-GFkk-jFhnrD2v-qIEdV0zyy0kOpvbIZZ7NbppZTgQ': 'Johna',
  '1nuJojKqj9b_a2RSKn7huV6vTr_62E7707uw1wBh0XDA': 'Dolo LLC',
  '1xsMWqwL381VcGxH5_yhWx_SKixLd_ojievrfqamBB5M': 'John Slop',
  '1wH5s8qdr0-imdK623Tdtu-UgKvRMELD_3Gd7OS2tNmQ': 'Jacob',
  '1GpUdOGG-w2QdnTRMeYT-UTaLAMgdx8LRVmURfUJ_frQ': 'Armando',
  '159BFifTYnDNoyaXNuZ4vIzUo0gJSTCeKW0L40swiyLo': 'Austin',
  '1rrATZ5UBihrfmt0fQF55hVaaq-Ku-C6fYFm6C8kymHA': 'Jack R',
  '1ZoNmwDq6FK-R209uTsra2sPv33vAuc1pFD3NQPAGK2c': 'Delmor',
  '1UHUjPqORhDMX9McbJueVhpRkP7fc3FeOXOiaOWZwhuQ': 'Mariel',
  '14yqVyVqwAfHdSN2KGI6piacNaK5EhwtS8xPvCI_EVVE': 'Elle',
  '1Izvdk9QA4zADd3j1IzMzGWzSqAUefBg1CuLUwaK6Ego': 'Kevin',
  '1vErWSypjyWms11NL3SfOm24lr52Lp_XS1KfJxchrwik': 'Rachel',
};

const TIKTOK_SOURCES = [
  {
    id: '1IVGp49ly5EAiyEv0_qFLqcE_giK8Lz1pt5znq-6xzzY',
    person: 'Johna',
    channel: 'tiktok',
  },
];

const AMAZON_FBM_SOURCES = [
  {
    id: '1cbwmBhLOOHygZ5dfCN1i_JHOLRLtbgaDvaOKtAp1580',
    tab: '2 Step Amazon Proda Products.',
    person: 'Paul',
    channel: 'amazon_fbm',
    activityLabel: 'Amazon Paul',
  },
];

const WALMART_SOURCES = [
  {
    id: '1IKET6AiIc5sWHEQG8yAuDOxVGxldC9uqzNm0hX_3LhQ',
    tab: '2 Step Walmart DT Seller ',
    person: 'Johna',
    channel: 'walmart',
    parser: 'order_sheet',
    activityLabel: 'Walmart Johna',
  },
];

// Store sheets can be maintained in local marketplace currency, but Seller OS
// rolls the operating dashboard up in USD.
const STORE_CURRENCY = {
  Elle: 'AUD',
};

// AUD monthly rates are 1 AUD -> USD. Update this table as new AUS months are added.
const FX_RATES_TO_USD = {
  USD: { default: 1 },
  AUD: {
    '2026-02': 0.705615,
    '2026-03': 0.701377,
    '2026-04': 0.708577,
    '2026-05': 0.718668,
    '2026-06': 0.701726,
    '2026-07': 0.690015,
    default: 0.690015,
  },
};

function currencyOptionsFor(person) {
  const sourceCurrency = STORE_CURRENCY[person] || 'USD';
  return {
    sourceCurrency,
    fxRatesToUsd: FX_RATES_TO_USD[sourceCurrency] || FX_RATES_TO_USD.USD,
  };
}

module.exports = {
  AMAZON_FBM_SOURCES,
  FX_RATES_TO_USD,
  SHEETS,
  STORE_CURRENCY,
  TIKTOK_SOURCES,
  WALMART_SOURCES,
  currencyOptionsFor,
};
