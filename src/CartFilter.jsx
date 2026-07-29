import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from './firebase';

const STORAGE_KEY = 'cartfilter-state-v2';
const SUPPORTED_CURRENCIES = ['SEK', 'EUR', 'USD'];
const EXCHANGE_RATES = {
  SEK: 1,
  EUR: 11.4,
  USD: 10.5
};

const TRANSLATIONS = {
  en: {
    appName: 'CartFilter',
    tagline: 'Parse receipts, compare grocery categories, and keep spending under control.',
    signIn: 'Sign in with Google',
    signOut: 'Sign out',
    signInError: 'Google sign-in did not complete. Please try again.',
    welcome: 'Smart grocery receipt tracking',
    language: 'Language',
    currency: 'Currency',
    importReceipt: 'Import receipt',
    addManually: 'Add manually',
    hideForm: 'Hide form',
    newReceipt: 'New receipt',
    importTitle: 'OCR receipt import',
    importDescription: 'Paste OCR text from a photo, PDF, scanner, or notes app and CartFilter will try to extract items, totals, date, and currency.',
    ocrText: 'OCR text',
    parseReceipt: 'Parse receipt text',
    parsing: 'Parsing...',
    merchant: 'Merchant',
    date: 'Date',
    category: 'Category',
    amount: 'Amount',
    total: 'Total',
    saveReceipt: 'Save receipt',
    cancel: 'Cancel',
    source: 'Source',
    parsedFromOcr: 'Parsed from OCR text',
    manualEntry: 'Manual entry',
    totalSpent: 'Total spent',
    receipts: 'Receipts',
    items: 'items',
    spendingByCategory: 'Spending by category',
    recentReceipts: 'Recent receipts',
    noReceipts: 'No receipts yet',
    noReceiptsHint: 'Import your first receipt or add one manually to start tracking grocery costs.',
    ocrReady: 'OCR-ready flow',
    ocrReadyHint: 'This version parses pasted OCR text and normalizes currencies. Image OCR can plug into the same parser next.',
    exchangeRateNote: 'Using built-in fallback rates: 1 EUR = 11.4 SEK, 1 USD = 10.5 SEK.',
    parseSuccess: 'Receipt parsed. Review the extracted fields before saving.',
    parseError: 'No useful receipt data was found. Try cleaner OCR text or enter the details manually.',
    groceryFocus: 'Grocery categories',
    merchantPlaceholder: 'Store or merchant name',
    ocrPlaceholder: 'Paste OCR text here. Example:\nICA Kvantum\n2026-07-25\nMilk 24.90\nBread 31.50\nTomatoes 19.95\nTotal 76.35 SEK',
    categories: {
      meat: 'Meat',
      vegetables: 'Vegetables',
      dairy: 'Dairy',
      grains: 'Grains',
      pantry: 'Pantry',
      snacks: 'Snacks',
      frozen: 'Frozen',
      beverages: 'Beverages',
      household: 'Household',
      other: 'Other'
    }
  },
  sv: {
    appName: 'CartFilter',
    tagline: 'Tolka kvitton, jamfor matvarukategorier och hall koll pa kostnaderna.',
    signIn: 'Logga in med Google',
    signOut: 'Logga ut',
    signInError: 'Google-inloggningen slutfordes inte. Forsok igen igen.',
    welcome: 'Smart kvittosparning for matinkop',
    language: 'Sprak',
    currency: 'Valuta',
    importReceipt: 'Importera kvitto',
    addManually: 'Lagg till manuellt',
    hideForm: 'Dolj formularet',
    newReceipt: 'Nytt kvitto',
    importTitle: 'OCR-kvittoimport',
    importDescription: 'Klistra in OCR-text fran ett foto, en PDF, en scanner eller anteckningar sa forsoker CartFilter hitta varor, total, datum och valuta.',
    ocrText: 'OCR-text',
    parseReceipt: 'Tolka kvittotext',
    parsing: 'Tolkar...',
    merchant: 'Butik',
    date: 'Datum',
    category: 'Kategori',
    amount: 'Belopp',
    total: 'Totalt',
    saveReceipt: 'Spara kvitto',
    cancel: 'Avbryt',
    source: 'Kalla',
    parsedFromOcr: 'Tolkat fran OCR-text',
    manualEntry: 'Manuell inmatning',
    totalSpent: 'Totalt spenderat',
    receipts: 'Kvitton',
    items: 'varor',
    spendingByCategory: 'Utgifter per kategori',
    recentReceipts: 'Senaste kvitton',
    noReceipts: 'Inga kvitton annu',
    noReceiptsHint: 'Importera ditt forsta kvitto eller lagg till ett manuellt for att borja folja matkostnader.',
    ocrReady: 'OCR-redo flode',
    ocrReadyHint: 'Den har versionen tolkar inklistrad OCR-text och normaliserar valutor. Bild-OCR kan anslutas till samma parser senare.',
    exchangeRateNote: 'Inbyggda reservkurser anvands: 1 EUR = 11.4 SEK, 1 USD = 10.5 SEK.',
    parseSuccess: 'Kvitto tolkat. Granska de extraherade falten innan du sparar.',
    parseError: 'Ingen anvandbar kvittodata hittades. Prova renare OCR-text eller fyll i uppgifterna manuellt.',
    groceryFocus: 'Matvarukategorier',
    merchantPlaceholder: 'Butik eller handlare',
    ocrPlaceholder: 'Klistra in OCR-text har. Exempel:\nICA Kvantum\n2026-07-25\nMjolk 24,90\nBrod 31,50\nTomater 19,95\nTotalt 76,35 SEK',
    categories: {
      meat: 'Kott',
      vegetables: 'Gronsaker',
      dairy: 'Mejeri',
      grains: 'Skafferi och spannmal',
      pantry: 'Basvaror',
      snacks: 'Snacks',
      frozen: 'Fryst',
      beverages: 'Drycker',
      household: 'Hushall',
      other: 'Ovrigt'
    }
  }
};

const CATEGORY_PATTERNS = [
  { key: 'meat', patterns: /beef|chicken|pork|meat|sausage|bacon|lamb|kott|korv|kyckling|flask/i },
  { key: 'vegetables', patterns: /tomato|potato|onion|salad|carrot|pepper|broccoli|fruit|apple|banana|gronsak|frukt|tomat|potatis|lok/i },
  { key: 'dairy', patterns: /milk|cheese|yogurt|butter|cream|egg|mejeri|mjolk|ost|smor|yoghurt|agg/i },
  { key: 'grains', patterns: /bread|rice|pasta|flour|oat|cereal|brod|ris|pasta|havre|mjol/i },
  { key: 'pantry', patterns: /oil|salt|sugar|spice|sauce|beans|coffee|tea|krydda|salt|socker|kaffe|te/i },
  { key: 'snacks', patterns: /chips|candy|chocolate|snack|cookies|godis|kex|choklad/i },
  { key: 'frozen', patterns: /frozen|ice cream|glass|fryst/i },
  { key: 'beverages', patterns: /juice|soda|cola|water|beer|wine|drink|lask|dryck|vatten/i },
  { key: 'household', patterns: /soap|detergent|paper|napkin|clean|disk|tvatt|hushall|toalett/i }
];

const DEFAULT_CATEGORY_KEYS = ['meat', 'vegetables', 'dairy', 'grains', 'pantry', 'snacks'];

const createEmptyItems = () =>
  DEFAULT_CATEGORY_KEYS.map((key) => ({
    key,
    label: key,
    amount: 0
  }));

const formatDateForInput = (value = new Date()) => {
  return new Date(value).toISOString().split('T')[0];
};

const sanitizeNumber = (rawValue) => {
  const value = String(rawValue || '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const inferCurrency = (text) => {
  if (/sek|kr\b/i.test(text)) return 'SEK';
  if (/eur|€/.test(text)) return 'EUR';
  if (/usd|\$/.test(text)) return 'USD';
  return 'SEK';
};

const normalizeToSek = (amount, currency) => {
  const rate = EXCHANGE_RATES[currency] || 1;
  return amount * rate;
};

const convertFromSek = (amountSek, currency) => {
  const rate = EXCHANGE_RATES[currency] || 1;
  return amountSek / rate;
};

const pickCategoryKey = (label) => {
  const match = CATEGORY_PATTERNS.find(({ patterns }) => patterns.test(label));
  return match ? match.key : 'other';
};

const buildTranslator = (language) => {
  const dict = TRANSLATIONS[language] || TRANSLATIONS.en;
  return (key) => {
    const path = key.split('.');
    let result = dict;
    for (const part of path) {
      result = result?.[part];
    }
    return result ?? key;
  };
};

const formatMoney = (amountSek, currency, locale) => {
  const converted = convertFromSek(amountSek, currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(converted);
};

const formatReceiptDate = (date, locale) => {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
};

const parseReceiptText = (text, fallbackDate) => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const currency = inferCurrency(trimmed);
  const merchant = lines[0] || 'Unknown Merchant';
  const dateMatch = trimmed.match(/\b(20\d{2}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01]))\b|\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  const parsedDate = dateMatch ? dateMatch[0].replace(/\./g, '-').replace(/\//g, '-') : fallbackDate;

  const itemLines = [];
  let detectedTotal = 0;

  for (const line of lines) {
    const amountMatch = line.match(/(-?\d+[.,]\d{2})\s*(sek|kr|eur|usd|€|\$)?$/i);
    if (!amountMatch) continue;

    const amount = sanitizeNumber(amountMatch[1]);
    if (/(total|sum|att betala|totalt|subtotal|amount due)/i.test(line)) {
      detectedTotal = amount;
      continue;
    }

    const label = line.replace(amountMatch[0], '').replace(/[xX]\d+/g, '').trim();
    if (!label || label.length < 2) continue;

    itemLines.push({
      name: label,
      amount,
      categoryKey: pickCategoryKey(label)
    });
  }

  if (itemLines.length === 0 && !detectedTotal) return null;

  const grouped = itemLines.reduce((acc, item) => {
    acc[item.categoryKey] = (acc[item.categoryKey] || 0) + item.amount;
    return acc;
  }, {});

  const items = Object.entries(grouped).map(([key, amount]) => ({
    key,
    label: key,
    amount
  }));

  const total = detectedTotal || itemLines.reduce((sum, item) => sum + item.amount, 0);

  return {
    merchant,
    date: parsedDate,
    currency,
    items: items.length > 0 ? items : createEmptyItems(),
    total,
    source: 'ocr',
    rawText: text
  };
};

const CartFilter = () => {
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [language, setLanguage] = useState('en');
  const [displayCurrency, setDisplayCurrency] = useState('SEK');
  const [ocrText, setOcrText] = useState('');
  const [parseMessage, setParseMessage] = useState('');
  const [parseStatus, setParseStatus] = useState('idle');
  const [authError, setAuthError] = useState('');

  const [formData, setFormData] = useState({
    merchant: '',
    date: formatDateForInput(),
    currency: 'SEK',
    source: 'manual',
    items: createEmptyItems()
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      setReceipts(parsed.receipts || []);
      setLanguage(parsed.language || 'en');
      setDisplayCurrency(parsed.displayCurrency || 'SEK');
    } catch (error) {
      console.error('Failed to restore CartFilter state', error);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ receipts, language, displayCurrency })
    );
  }, [receipts, language, displayCurrency]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });

    return unsubscribe;
  }, []);

  const t = useMemo(() => buildTranslator(language), [language]);
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';

  const translatedCategoryLabel = useCallback((key) => t(`categories.${key}`) || key, [t]);

  const normalizedItems = useMemo(
    () =>
      formData.items.map((item) => ({
        ...item,
        amount: Number(item.amount) || 0
      })),
    [formData.items]
  );

  const totalSpentSek = normalizedItems.reduce(
    (sum, item) => sum + normalizeToSek(item.amount, formData.currency),
    0
  );

  const receiptsWithDisplay = useMemo(
    () =>
      receipts.map((receipt) => ({
        ...receipt,
        displayTotal: formatMoney(receipt.totalSek, displayCurrency, locale)
      })),
    [displayCurrency, locale, receipts]
  );

  const categoryData = useMemo(() => {
    const totals = {};

    receipts.forEach((receipt) => {
      receipt.items.forEach((item) => {
        const amountSek = normalizeToSek(item.amount, receipt.currency);
        totals[item.key] = (totals[item.key] || 0) + amountSek;
      });
    });

    return Object.entries(totals)
      .map(([key, value]) => ({
        key,
        name: translatedCategoryLabel(key),
        value
      }))
      .sort((a, b) => b.value - a.value);
  }, [receipts, translatedCategoryLabel]);

  const totalAcrossReceiptsSek = receipts.reduce((sum, receipt) => sum + receipt.totalSek, 0);

  const handleItemChange = (index, field, value) => {
    const nextItems = [...formData.items];
    nextItems[index] = {
      ...nextItems[index],
      [field]: field === 'amount' ? sanitizeNumber(value) : value
    };
    setFormData((current) => ({ ...current, items: nextItems }));
  };

  const resetForm = () => {
    setFormData({
      merchant: '',
      date: formatDateForInput(),
      currency: displayCurrency,
      source: 'manual',
      items: createEmptyItems()
    });
    setOcrText('');
    setParseMessage('');
    setParseStatus('idle');
  };

  const handleAddReceipt = () => {
    if (totalSpentSek <= 0) return;

    const cleanedItems = normalizedItems.filter((item) => item.amount > 0);
    setReceipts((current) => [
      ...current,
      {
        id: Date.now(),
        merchant: formData.merchant || 'Unknown Merchant',
        date: formData.date,
        currency: formData.currency,
        source: formData.source,
        items: cleanedItems,
        totalSek: totalSpentSek
      }
    ]);

    resetForm();
    setShowForm(false);
  };

  const handleParseReceipt = () => {
    setParseStatus('working');
    const parsed = parseReceiptText(ocrText, formData.date);

    if (!parsed) {
      setParseStatus('error');
      setParseMessage(t('parseError'));
      return;
    }

    setFormData({
      merchant: parsed.merchant,
      date: parsed.date,
      currency: parsed.currency,
      source: parsed.source,
      items: parsed.items
    });
    setParseStatus('success');
    setParseMessage(t('parseSuccess'));
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google sign-in failed', error);
      setAuthError(t('signInError'));
    }
  };

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign-out failed', error);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="max-w-lg text-center rounded-3xl bg-white/85 shadow-xl border border-amber-100 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700 mb-3">{t('appName')}</p>
          <h1 className="text-4xl font-bold text-stone-900 mb-3">{t('welcome')}</h1>
          <p className="text-stone-600 mb-8">{t('tagline')}</p>
          <button
            onClick={handleGoogleSignIn}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-8 rounded-full transition"
          >
            {t('signIn')}
          </button>
          {authError && <p className="mt-4 text-sm text-red-600">{authError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.16),_transparent_30%),linear-gradient(180deg,_#fffdf8_0%,_#fff7ed_45%,_#fffbeb_100%)]">
      <header className="bg-white/90 backdrop-blur border-b border-amber-100 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{t('appName')}</h1>
            <p className="text-sm text-stone-600">{user.email}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-stone-700">
              {t('language')}
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="ml-2 rounded-full border border-amber-200 bg-white px-3 py-2"
              >
                <option value="en">English</option>
                <option value="sv">Svenska</option>
              </select>
            </label>

            <label className="text-sm text-stone-700">
              {t('currency')}
              <select
                value={displayCurrency}
                onChange={(event) => setDisplayCurrency(event.target.value)}
                className="ml-2 rounded-full border border-amber-200 bg-white px-3 py-2"
              >
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={handleSignOut}
              className="text-sm bg-stone-200 hover:bg-stone-300 text-stone-800 px-4 py-2 rounded-full transition"
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 pb-20">
        <section className="grid gap-4 md:grid-cols-[1.3fr_0.7fr] mb-6">
          <div className="rounded-3xl bg-stone-900 text-white p-6 shadow-xl">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300 mb-3">{t('ocrReady')}</p>
            <h2 className="text-3xl font-bold mb-3">{t('welcome')}</h2>
            <p className="text-stone-200 max-w-xl">{t('ocrReadyHint')}</p>
          </div>

          <div className="rounded-3xl bg-white border border-amber-100 p-6 shadow-md">
            <p className="text-sm text-stone-500 mb-2">{t('exchangeRateNote')}</p>
            <button
              onClick={() => setShowForm((current) => !current)}
              className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-full transition"
            >
              {showForm ? t('hideForm') : t('importReceipt')}
            </button>
          </div>
        </section>

        {showForm && (
          <section className="grid gap-6 lg:grid-cols-2 mb-8">
            <div className="bg-white rounded-3xl shadow-md p-6 border border-amber-100">
              <h2 className="text-xl font-bold text-stone-900 mb-2">{t('importTitle')}</h2>
              <p className="text-stone-600 mb-4">{t('importDescription')}</p>
              <label className="block text-sm font-medium text-stone-700 mb-2">{t('ocrText')}</label>
              <textarea
                value={ocrText}
                onChange={(event) => setOcrText(event.target.value)}
                placeholder={t('ocrPlaceholder')}
                rows={13}
                className="w-full rounded-2xl border border-stone-300 px-4 py-3 resize-y"
              />
              <button
                onClick={handleParseReceipt}
                className="mt-4 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-3 px-5 rounded-full transition"
              >
                {parseStatus === 'working' ? t('parsing') : t('parseReceipt')}
              </button>
              {parseMessage && (
                <p className={`mt-3 text-sm ${parseStatus === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
                  {parseMessage}
                </p>
              )}
            </div>

            <div className="bg-white rounded-3xl shadow-md p-6 border border-amber-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-stone-900">{t('newReceipt')}</h2>
                <span className="text-xs uppercase tracking-[0.25em] text-amber-700">
                  {formData.source === 'ocr' ? t('parsedFromOcr') : t('manualEntry')}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">{t('merchant')}</label>
                  <input
                    type="text"
                    value={formData.merchant}
                    placeholder={t('merchantPlaceholder')}
                    onChange={(event) => setFormData((current) => ({ ...current, merchant: event.target.value }))}
                    className="w-full border border-stone-300 rounded-2xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">{t('date')}</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(event) => setFormData((current) => ({ ...current, date: event.target.value }))}
                    className="w-full border border-stone-300 rounded-2xl px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">{t('currency')}</label>
                  <select
                    value={formData.currency}
                    onChange={(event) => setFormData((current) => ({ ...current, currency: event.target.value }))}
                    className="w-full border border-stone-300 rounded-2xl px-3 py-2"
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">{t('source')}</label>
                  <input
                    type="text"
                    value={formData.source === 'ocr' ? t('parsedFromOcr') : t('manualEntry')}
                    readOnly
                    className="w-full border border-stone-200 bg-stone-50 rounded-2xl px-3 py-2 text-stone-500"
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-sm font-semibold text-stone-800 mb-3">{t('groceryFocus')}</p>
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={`${item.key}-${index}`} className="grid grid-cols-[1fr_110px] gap-2">
                      <input
                        type="text"
                        value={translatedCategoryLabel(item.key)}
                        readOnly
                        className="border border-stone-200 bg-stone-50 rounded-2xl px-3 py-2 text-sm text-stone-600"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={item.amount || ''}
                        onChange={(event) => handleItemChange(index, 'amount', event.target.value)}
                        placeholder="0.00"
                        className="border border-stone-300 rounded-2xl px-3 py-2 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4">
                <p className="text-sm text-stone-600">
                  {t('total')}: <span className="font-bold text-lg text-amber-700">{formatMoney(totalSpentSek, formData.currency, locale)}</span>
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  {t('currency')}: {displayCurrency} view, {formData.currency} receipt
                </p>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleAddReceipt}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-full transition"
                >
                  {t('saveReceipt')}
                </button>
                <button
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                  className="flex-1 bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold py-3 rounded-full transition"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </section>
        )}

        {receipts.length > 0 && (
          <>
            <section className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-3xl shadow-md p-5 border-l-4 border-amber-600">
                <p className="text-stone-500 text-sm font-medium">{t('totalSpent')}</p>
                <p className="text-3xl font-bold text-amber-700">{formatMoney(totalAcrossReceiptsSek, displayCurrency, locale)}</p>
              </div>
              <div className="bg-white rounded-3xl shadow-md p-5 border-l-4 border-stone-700">
                <p className="text-stone-500 text-sm font-medium">{t('receipts')}</p>
                <p className="text-3xl font-bold text-stone-900">{receipts.length}</p>
              </div>
            </section>

            <section className="bg-white rounded-3xl shadow-md p-6 mb-6 border border-amber-100">
              <h2 className="text-lg font-bold text-stone-900 mb-4">{t('spendingByCategory')}</h2>
              <div className="space-y-3">
                {categoryData.map((category) => {
                  const percentage = totalAcrossReceiptsSek > 0
                    ? ((category.value / totalAcrossReceiptsSek) * 100).toFixed(1)
                    : '0.0';

                  return (
                    <div key={category.key}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-stone-800">{category.name}</span>
                        <span className="text-sm font-bold text-amber-700">
                          {formatMoney(category.value, displayCurrency, locale)} ({percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-amber-600 h-2 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-stone-900">{t('recentReceipts')}</h2>
              {[...receiptsWithDisplay].reverse().map((receipt) => (
                <div key={receipt.id} className="bg-white rounded-3xl shadow-md p-5 border border-amber-100">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
                    <div>
                      <p className="font-semibold text-stone-900">{receipt.merchant}</p>
                      <p className="text-sm text-stone-600">{formatReceiptDate(receipt.date, locale)}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-400 mt-1">
                        {receipt.source === 'ocr' ? t('parsedFromOcr') : t('manualEntry')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-amber-700 text-lg">{receipt.displayTotal}</p>
                      <p className="text-sm text-stone-500">{receipt.items.length} {t('items')}</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm text-stone-600">
                    {receipt.items.map((item, index) => (
                      <div key={`${receipt.id}-${item.key}-${index}`} className="flex justify-between rounded-2xl bg-stone-50 px-3 py-2">
                        <span>{translatedCategoryLabel(item.key)}</span>
                        <span className="font-semibold">
                          {new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: receipt.currency
                          }).format(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        {receipts.length === 0 && !showForm && (
          <section className="text-center py-16">
            <p className="text-stone-700 text-lg mb-3">{t('noReceipts')}</p>
            <p className="text-stone-500 max-w-lg mx-auto">{t('noReceiptsHint')}</p>
          </section>
        )}
      </main>
    </div>
  );
};

export default CartFilter;
