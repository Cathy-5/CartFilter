import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { createWorker } from 'tesseract.js';
import { auth, db, storage } from './firebase';
import cartFilterLogo from './assets/cartfilter-logo.png';

const STORAGE_KEY = 'cartfilter-state-v2';
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_COMPRESSED_IMAGE_EDGE = 2000;
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
    receiptLoadError: 'Your saved receipts could not be loaded. Check the Firestore rules and try again.',
    receiptSaveError: 'The receipt could not be saved. Please try again.',
    duplicateReceipt: 'Already saved in history.',
    loadingReceipts: 'Loading your receipts...',
    savingReceipt: 'Saving...',
    welcome: 'Smart grocery receipt tracking',
    language: 'Language',
    currency: 'Currency',
    importReceipt: 'Import receipt',
    addManually: 'Add manually',
    hideForm: 'Hide form',
    newReceipt: 'New receipt',
    importTitle: 'OCR receipt import',
    importDescription: 'Paste OCR text from a photo, PDF, scanner, or notes app and CartFilter will try to extract items, totals, date, and currency.',
    chooseImage: 'Choose receipt image',
    imageHint: 'Use a clear JPG, PNG, or WebP image up to 10 MB. On a phone, you can also take a photo.',
    analyzeImage: 'Upload and analyze image',
    analyzingImage: 'Analyzing receipt',
    imageReady: 'Image ready for analysis',
    imageTypeError: 'Please choose a JPG, PNG, or WebP image.',
    imageSizeError: 'The original image must be smaller than 10 MB.',
    imageProcessingError: 'The image could not be analyzed. Try a clearer, well-lit photo.',
    noImageSelected: 'Choose a receipt image first.',
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
    weeklyBudget: 'Weekly budget',
    budgetInSek: 'Budget in SEK',
    spentThisWeek: 'Spent this week',
    remainingThisWeek: 'Remaining',
    overBudget: 'You are over your weekly budget.',
    shoppingFrequency: 'Shopping frequency',
    shoppingDays: 'Shopping days',
    maximumShoppingDays: 'Maximum shopping days per week',
    storesVisited: 'Stores visited',
    shoppingDayLeft: 'You have one shopping day left.',
    shoppingDayLimitReached: 'You have reached your planned shopping days.',
    shoppingDayLimitExceeded: 'You shopped on an extra day this week.',
    receiptDateNotDetected: 'Receipt date was not detected. Please confirm it.',
    confirmDate: 'Confirm date',
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
    detectedLines: 'Detected receipt lines',
    product: 'Product',
    discount: 'Discount',
    deposit: 'Deposit',
    'deposit-return': 'Deposit return credit',
    reconciliation: 'Unmatched receipt amount',
    receiptMismatch: 'could not be matched to a product. Review the detected lines.',
    grossPurchases: 'Gross purchases',
    depositReturnCredit: 'Deposit return credit',
    amountPaid: 'Amount paid',
    needsReview: 'Needs review',
    shoppingList: 'Shopping list',
    shoppingListHint: 'Start with common groceries or reuse products found in your receipts.',
    weeklyBasics: 'Add weekly basics',
    proteinAndProduce: 'Add protein and vegetables',
    learnedSuggestions: 'From your receipts',
    learnedSuggestionsHint: 'Suggestions appear after you save receipts with detected product lines.',
    addItem: 'Add item',
    itemCategory: 'Item category',
    itemPlaceholder: 'Milk, tomatoes, rice...',
    removeItem: 'Remove',
    clearCompleted: 'Clear completed',
    emptyShoppingList: 'Your shopping list is empty.',
    estimatedPrice: 'Estimated price',
    estimatedListTotal: 'Estimated list total',
    addEstimatedPrices: 'Add estimated prices to compare with your budget.',
    withinBudget: 'Within budget',
    overPlannedBudget: 'Over budget by',
    merchantPlaceholder: 'Store or merchant name',
    ocrPlaceholder: 'Paste OCR text here. Example:\nICA Kvantum\n2026-07-25\nMilk 24.90\nBread 31.50\nTomatoes 19.95\nTotal 76.35 SEK',
    categories: {
      meat: 'Protein',
      fruits: 'Fruit',
      vegetables: 'Vegetables',
      dairy: 'Dairy',
      grains: 'Grains',
      pantry: 'Pantry',
      snacks: 'Snacks',
      frozen: 'Frozen',
      beverages: 'Beverages',
      alcohol: 'Alcohol',
      preparedMeals: 'Prepared meals',
      household: 'Household',
      deposit: 'Refundable deposit',
      depositReturn: 'Deposit return',
      other: 'Other'
    },
    commonItems: {
      milk: 'Milk',
      eggs: 'Eggs',
      bread: 'Bread',
      rice: 'Rice',
      pasta: 'Pasta',
      potatoes: 'Potatoes',
      onions: 'Onions',
      carrots: 'Carrots',
      fruit: 'Fruit',
      chicken: 'Chicken',
      tofu: 'Tofu',
      mincedMeat: 'Minced meat',
      cucumber: 'Cucumber',
      tomatoes: 'Tomatoes',
      spinach: 'Spinach'
    }
  },
  sv: {
    appName: 'CartFilter',
    tagline: 'Tolka kvitton, jamfor matvarukategorier och hall koll pa kostnaderna.',
    signIn: 'Logga in med Google',
    signOut: 'Logga ut',
    signInError: 'Google-inloggningen slutfordes inte. Forsok igen igen.',
    receiptLoadError: 'Dina sparade kvitton kunde inte laddas. Kontrollera Firestore-reglerna och forsok igen.',
    receiptSaveError: 'Kvittot kunde inte sparas. Forsok igen.',
    duplicateReceipt: 'Redan sparat i historiken.',
    loadingReceipts: 'Laddar dina kvitton...',
    savingReceipt: 'Sparar...',
    welcome: 'Smart kvittosparning for matinkop',
    language: 'Sprak',
    currency: 'Valuta',
    importReceipt: 'Importera kvitto',
    addManually: 'Lagg till manuellt',
    hideForm: 'Dolj formularet',
    newReceipt: 'Nytt kvitto',
    importTitle: 'OCR-kvittoimport',
    importDescription: 'Klistra in OCR-text fran ett foto, en PDF, en scanner eller anteckningar sa forsoker CartFilter hitta varor, total, datum och valuta.',
    chooseImage: 'Valj kvittobild',
    imageHint: 'Anvand en tydlig JPG-, PNG- eller WebP-bild pa hogst 10 MB. Pa mobilen kan du ocksa ta ett foto.',
    analyzeImage: 'Ladda upp och analysera bild',
    analyzingImage: 'Analyserar kvitto',
    imageReady: 'Bilden ar redo for analys',
    imageTypeError: 'Valj en bild i JPG-, PNG- eller WebP-format.',
    imageSizeError: 'Originalbilden maste vara mindre an 10 MB.',
    imageProcessingError: 'Bilden kunde inte analyseras. Prova ett tydligare foto med bra ljus.',
    noImageSelected: 'Valj en kvittobild forst.',
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
    weeklyBudget: 'Veckobudget',
    budgetInSek: 'Budget i SEK',
    spentThisWeek: 'Spenderat denna vecka',
    remainingThisWeek: 'Kvar',
    overBudget: 'Du har overskridit din veckobudget.',
    shoppingFrequency: 'Inköpsfrekvens',
    shoppingDays: 'Inköpsdagar',
    maximumShoppingDays: 'Maximalt antal inköpsdagar per vecka',
    storesVisited: 'Besökta butiker',
    shoppingDayLeft: 'Du har en inköpsdag kvar.',
    shoppingDayLimitReached: 'Du har nått dina planerade inköpsdagar.',
    shoppingDayLimitExceeded: 'Du handlade en extra dag den här veckan.',
    receiptDateNotDetected: 'Kvittodatum kunde inte hittas. Bekräfta datumet.',
    confirmDate: 'Bekräfta datum',
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
    detectedLines: 'Hittade kvittorader',
    product: 'Vara',
    discount: 'Rabatt',
    deposit: 'Pant',
    'deposit-return': 'Pantretur',
    reconciliation: 'Omatchat kvittobelopp',
    receiptMismatch: 'kunde inte kopplas till en vara. Granska de hittade raderna.',
    grossPurchases: 'Varor före pantretur',
    depositReturnCredit: 'Pantretur',
    amountPaid: 'Betalat',
    needsReview: 'Behover granskas',
    shoppingList: 'Inkopslista',
    shoppingListHint: 'Borja med vanliga matvaror eller ateranvand varor fran dina kvitton.',
    weeklyBasics: 'Lagg till veckans basvaror',
    proteinAndProduce: 'Lagg till protein och gronsaker',
    learnedSuggestions: 'Fran dina kvitton',
    learnedSuggestionsHint: 'Forslag visas nar du har sparat kvitton med identifierade varurader.',
    addItem: 'Lagg till vara',
    itemCategory: 'Varukategori',
    itemPlaceholder: 'Mjolk, tomater, ris...',
    removeItem: 'Ta bort',
    clearCompleted: 'Ta bort avklarade',
    emptyShoppingList: 'Din inkopslista ar tom.',
    estimatedPrice: 'Beräknat pris',
    estimatedListTotal: 'Beräknad totalsumma',
    addEstimatedPrices: 'Lägg till beräknade priser för att jämföra med budgeten.',
    withinBudget: 'Inom budget',
    overPlannedBudget: 'Över budget med',
    merchantPlaceholder: 'Butik eller handlare',
    ocrPlaceholder: 'Klistra in OCR-text har. Exempel:\nICA Kvantum\n2026-07-25\nMjolk 24,90\nBrod 31,50\nTomater 19,95\nTotalt 76,35 SEK',
    categories: {
      meat: 'Protein',
      fruits: 'Frukt',
      vegetables: 'Gronsaker',
      dairy: 'Mejeri',
      grains: 'Skafferi och spannmal',
      pantry: 'Basvaror',
      snacks: 'Snacks',
      frozen: 'Fryst',
      beverages: 'Drycker',
      alcohol: 'Alkohol',
      preparedMeals: 'Tillagade måltider',
      household: 'Hushall',
      deposit: 'Pant',
      depositReturn: 'Pantretur',
      other: 'Ovrigt'
    },
    commonItems: {
      milk: 'Mjolk',
      eggs: 'Agg',
      bread: 'Brod',
      rice: 'Ris',
      pasta: 'Pasta',
      potatoes: 'Potatis',
      onions: 'Lok',
      carrots: 'Morotter',
      fruit: 'Frukt',
      chicken: 'Kyckling',
      tofu: 'Tofu',
      mincedMeat: 'Kottfars',
      cucumber: 'Gurka',
      tomatoes: 'Tomater',
      spinach: 'Spenat'
    }
  }
};

const CATEGORY_RULES = [
  { key: 'alcohol', score: 12, pattern: /\b(beer|wine|cider|ale|lager|ol|öl|vin|brau|bräu)\b/i },
  { key: 'preparedMeals', score: 11, pattern: /\b(burger|burgare|cheeseburger|cheeseburgare|pizza|lasagne|nuggets|falafel|meal|middag)\b/i },
  { key: 'beverages', score: 10, pattern: /\b(cola|pepsi|fanta|sprite|juice|soda|lask|dryck|vatten|water)\b/i },
  { key: 'meat', score: 9, pattern: /\b(beef|chicken|pork|meat|sausage|bacon|lamb|tofu|egg|kott|korv|kyckling|flask|agg|notfars)\b/i },
  { key: 'fruits', score: 9, pattern: /\b(fruit|apple|banana|orange|pear|grape|berries|frukt|apple|banan|apelsin|paron|druvor|bar)\b/i },
  { key: 'vegetables', score: 9, pattern: /\b(tomato|potato|onion|salad|carrot|pepper|broccoli|spinach|parsley|cucumber|gronsak|tomat|potatis|lok|gurka|morot|paprika|spenat|bladpersilja|persilja|sallad|isbergssallad)\b/i },
  { key: 'dairy', score: 8, pattern: /\b(milk|cheese|yogurt|butter|cream|quark|mejeri|mjolk|ost|smor|yoghurt|kvarg)\b/i },
  { key: 'grains', score: 8, pattern: /\b(bread|brioche|brosche|broiche|rice|pasta|flour|oat|cereal|brod|ris|havre|mjol)\b/i },
  { key: 'snacks', score: 8, pattern: /\b(chips|candy|chocolate|snack|cookie|cookies|biscuit|biscoff|muffin|muffins|pastel\s+de\s+nata|godis|kex|choklad|muslibar|popcorn)\b/i },
  { key: 'pantry', score: 5, pattern: /\b(oil|salt|sugar|spice|sauce|beans|coffee|tea|krydda|socker|kaffe)\b/i },
  { key: 'household', score: 8, pattern: /\b(soap|detergent|paper|napkin|clean|disk|tvatt|hushall|toalett)\b/i },
  { key: 'beverages', score: 3, pattern: /\bzero\b/i }
];

const DEFAULT_CATEGORY_KEYS = ['meat', 'fruits', 'vegetables', 'dairy', 'grains', 'pantry', 'snacks', 'beverages', 'alcohol', 'preparedMeals'];
const REVIEW_CATEGORY_KEYS = [
  'meat',
  'fruits',
  'vegetables',
  'dairy',
  'grains',
  'pantry',
  'snacks',
  'beverages',
  'alcohol',
  'preparedMeals',
  'household',
  'deposit',
  'depositReturn',
  'other'
];
const COMMON_LIST_TEMPLATES = {
  weeklyBasics: ['milk', 'eggs', 'bread', 'rice', 'pasta', 'potatoes', 'onions', 'carrots', 'fruit'],
  proteinAndProduce: ['chicken', 'tofu', 'mincedMeat', 'cucumber', 'tomatoes', 'spinach']
};
const SHOPPING_ITEM_ALIASES = {
  milk: 'milk',
  mjolk: 'milk',
  egg: 'eggs',
  eggs: 'eggs',
  agg: 'eggs',
  bread: 'bread',
  brod: 'bread',
  rice: 'rice',
  ris: 'rice',
  potatoes: 'potatoes',
  potato: 'potatoes',
  potatis: 'potatoes',
  onion: 'onions',
  onions: 'onions',
  lok: 'onions',
  carrot: 'carrots',
  carrots: 'carrots',
  morot: 'carrots',
  morotter: 'carrots',
  fruit: 'fruit',
  frukt: 'fruit',
  chicken: 'chicken',
  kyckling: 'chicken',
  'minced meat': 'minced-meat',
  kottfars: 'minced-meat',
  cucumber: 'cucumber',
  gurka: 'cucumber',
  tomato: 'tomatoes',
  tomatoes: 'tomatoes',
  tomat: 'tomatoes',
  tomater: 'tomatoes',
  spinach: 'spinach',
  spenat: 'spinach'
};

// Creates the default empty category rows for a new receipt.
const createEmptyItems = () =>
  DEFAULT_CATEGORY_KEYS.map((key) => ({
    key,
    label: key,
    amount: 0
  }));

// Converts a date into the YYYY-MM-DD format required by date inputs.
const formatDateForInput = (value = new Date()) => {
  return new Date(value).toISOString().split('T')[0];
};

// Returns the local start of the week, using Monday as the first day.
const getStartOfWeek = (value = new Date()) => {
  const date = new Date(value);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Converts user or OCR input into a safe decimal number.
const sanitizeNumber = (rawValue) => {
  const value = String(rawValue || '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Detects the receipt currency from common currency symbols and labels.
const inferCurrency = (text) => {
  if (/sek|kr\b/i.test(text)) return 'SEK';
  if (/eur|€/.test(text)) return 'EUR';
  if (/usd|\$/.test(text)) return 'USD';
  return 'SEK';
};

// Converts a receipt amount into the app's base SEK currency.
const normalizeToSek = (amount, currency) => {
  const rate = EXCHANGE_RATES[currency] || 1;
  return amount * rate;
};

// Converts a SEK amount into the selected display currency.
const convertFromSek = (amountSek, currency) => {
  const rate = EXCHANGE_RATES[currency] || 1;
  return amountSek / rate;
};

// Normalizes text so OCR labels can be compared consistently.
const normalizeForMatching = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

// Builds a reusable lookup key from a product name.
const normalizeProductKey = (value) => normalizeForMatching(value)
  .replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l|st|p)\b/g, ' ')
  .replace(/\b\d+\s*st\b/g, ' ')
  .replace(/\d+[.,]\d{2}/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Maps translated shopping-list names to one shared item identity.
const normalizeShoppingIdentity = (value) => {
  const normalized = normalizeProductKey(value);
  return SHOPPING_ITEM_ALIASES[normalized] || normalized;
};

// Chooses the best grocery category using keyword scores.
const pickCategoryKey = (label) => {
  const normalizedLabel = normalizeForMatching(label);
  const scores = CATEGORY_RULES.reduce((result, rule) => {
    if (rule.pattern.test(normalizedLabel)) {
      result[rule.key] = (result[rule.key] || 0) + rule.score;
    }
    return result;
  }, {});
  const bestMatch = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return bestMatch?.[0] || 'other';
};

// Creates a translation lookup function for the selected language.
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

// Formats a SEK amount in the selected currency and locale.
const formatMoney = (amountSek, currency, locale) => {
  const converted = convertFromSek(amountSek, currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(converted);
};

// Formats a stored receipt date for display.
const formatReceiptDate = (date, locale) => {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(date));
};

// Resizes and compresses a receipt image before upload and OCR.
const compressReceiptImage = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    const scale = Math.min(
      1,
      MAX_COMPRESSED_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(objectUrl);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image compression failed'));
          return;
        }

        const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';
        resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.82
    );
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Image loading failed'));
  };
  image.src = objectUrl;
});

// Rounds monetary values to two decimal places.
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Creates a stable receipt ID used to prevent duplicate saves.
const createReceiptFingerprint = (receipt) => {
  const itemIdentity = (receipt.lineItems?.length ? receipt.lineItems : receipt.items || [])
    .map((item) => [
      normalizeProductKey(item.name || item.key || item.label),
      roundMoney(item.amount),
      item.type || item.categoryKey || item.key
    ].join(':'))
    .join('|');
  const identity = [
    normalizeProductKey(receipt.merchant || 'Unknown Merchant'),
    receipt.date,
    receipt.currency,
    roundMoney(receipt.totalSek),
    itemIdentity
  ].join('::');

  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `receipt-${(hash >>> 0).toString(36)}`;
};

// Totals individual receipt lines by grocery category.
const groupLineItems = (lineItems) => Object.entries(
  lineItems.reduce((totals, item) => {
    totals[item.categoryKey] = (totals[item.categoryKey] || 0) + item.amount;
    return totals;
  }, {})
).map(([key, amount]) => ({
  key,
  label: key,
  amount: roundMoney(amount)
}));

// Refreshes categories for saved receipts while preserving user corrections and discounts.
const refreshReceiptCategories = (receipt, categoryMappings = {}) => {
  if (receipt.rawText) {
    const reparsed = parseReceiptText(receipt.rawText, receipt.date, categoryMappings);
    if (reparsed) {
      return {
        ...receipt,
        ...reparsed,
        id: receipt.id,
        createdAt: receipt.createdAt
      };
    }
  }
  if (!receipt.lineItems?.length) return receipt;

  const categoryForProduct = (item) => categoryMappings[item.productKey || normalizeProductKey(item.name)]
    || pickCategoryKey(item.name);
  const lineItems = receipt.lineItems.map((item) => {
    if (item.confidence === 'user' || item.confidence === 'remembered') return item;
    if (item.type === 'discount' && item.linkedTo) {
      const linkedProduct = receipt.lineItems.find((candidate) => candidate.name === item.linkedTo);
      return linkedProduct
        ? { ...item, categoryKey: categoryForProduct(linkedProduct) }
        : item;
    }
    const categoryKey = categoryForProduct(item);
    return {
      ...item,
      categoryKey,
      confidence: categoryKey === 'other' ? 'needs-review' : 'rule'
    };
  });

  return {
    ...receipt,
    lineItems,
    items: groupLineItems(lineItems)
  };
};

// Removes obvious repeated-character OCR noise from merchant names.
const cleanMerchantName = (name) => name
  .replace(/\b([a-zåäö])\1{2,}\b/gi, '')
  .replace(/\s+/g, ' ')
  .trim();

// Finds and cleans the most likely merchant line in OCR text.
const findMerchant = (lines) => {
  const knownMerchant = lines.find((line) => (
    /willys|ica|coop|lidl|hemkop|city\s*gross|tempo|mathem/i.test(normalizeForMatching(line))
  ));
  if (knownMerchant) {
    const normalized = normalizeForMatching(knownMerchant);
    if (normalized.includes('lidl')) return 'Lidl';
    return cleanMerchantName(knownMerchant);
  }

  if (lines.some((line) => /969667[-\s]?6312/.test(line))) return 'Lidl';

  return lines.find((line) => {
    const normalized = normalizeForMatching(line);
    return line.length >= 3
      && !/^\d{1,2}:\d{2}/.test(line)
      && !/kvitto|receipt|tel\.?|org\.?\s*nr|^\W+$/.test(normalized)
      && !/\d+[.,]\d{2}\s*(sek|kr|eur|usd|€|\$)?$/i.test(line);
  }) || 'Unknown Merchant';
};

// Converts detected date formats into a consistent YYYY-MM-DD value.
const normalizeReceiptDate = (dateText, fallbackDate) => {
  if (!dateText) return fallbackDate;
  const parts = dateText.split(/[-/.]/).map((part) => Number(part));
  if (parts[0] > 1900) {
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
  }
  return `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
};

// Identifies receipt headers and separators that are not products.
const isReceiptMetadata = (line) => {
  const normalized = normalizeForMatching(line);
  return !line
    || /^[-=_*]+$/.test(line)
    || /^(tel|org\.?\s*nr|kvitto|receipt)\b/.test(normalized)
    || /^\d{1,2}:\d{2}/.test(line);
};

// Parses OCR text into merchant, products, categories, discounts, and totals.
const parseReceiptText = (text, fallbackDate, categoryMappings = {}) => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const currency = inferCurrency(trimmed);
  const merchant = findMerchant(lines);
  const dateMatch = trimmed.match(/\b(20\d{2}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01]))\b|\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  const parsedDate = normalizeReceiptDate(dateMatch?.[0], fallbackDate);

  const itemLines = [];
  const totalLine = lines.find((line) => (
    /^(total|totalt|summa|att betala|totalbelopp)\b/i.test(line)
      && /-?\d+[.,]\d{2}(?:\s*(?:sek|kr|eur|usd|€|\$))?(?:\s*[a-c])?$/i.test(line)
  ));
  const totalAmountMatch = totalLine?.match(
    /(-?\d+[.,]\d{2})(?:\s*(?:sek|kr|eur|usd|€|\$))?(?:\s*[a-c])?$/i
  );
  let detectedTotal = totalAmountMatch ? sanitizeNumber(totalAmountMatch[1]) : 0;
  const organizationLineIndex = lines.findIndex((line) => /org\.?\s*nr/i.test(line));
  const itemSectionStart = organizationLineIndex >= 0 ? organizationLineIndex + 1 : 0;
  const relativeItemSectionEnd = lines
    .slice(itemSectionStart)
    .findIndex((line) => (
      /totalt?\s+\d+\s+varor/i.test(line)
      || /^att betala\b/i.test(normalizeForMatching(line))
    ));
  const itemSectionEnd = relativeItemSectionEnd >= 0
    ? itemSectionStart + relativeItemSectionEnd
    : -1;
  const possibleItemLines = itemSectionEnd >= 0
    ? lines.slice(itemSectionStart, itemSectionEnd)
    : lines.slice(itemSectionStart);
  let pendingLabel = '';
  let lastProduct = null;

  for (const line of possibleItemLines) {
    const quantityDetailMatch = line.match(
      /^(\d+(?:[.,]\d+)?)\s*(?:(?:each|st|pcs?)\s*)?[*x×]\s*(?:sek|kr)?\s*(\d+[.,]\d{2})(?:\s*(?:sek|kr))?(?:\s*\/\s*(?:each|st|pcs?))?$/i
    );
    if (quantityDetailMatch && lastProduct) {
      lastProduct.quantity = sanitizeNumber(quantityDetailMatch[1]);
      lastProduct.unitPrice = sanitizeNumber(quantityDetailMatch[2]);
      continue;
    }

    // Lidl appends a VAT code (for example "B") after each product price.
    const amountMatch = line.match(
      /(-?\d+[.,]\d{2})(?:\s*(sek|kr|eur|usd|€|\$))?(?:\s+[a-z]{1,3}|\s*(?:\[[^\]]*\]|[~=_|5]))*$/i
    );
    if (!amountMatch) {
      if (!isReceiptMetadata(line)) pendingLabel = line;
      continue;
    }

    const amount = sanitizeNumber(amountMatch[1]);
    if (/(total|sum|att betala|totalt|subtotal|amount due|kopbelopp|köpbelopp)/i.test(line)) {
      detectedTotal = amount;
      continue;
    }

    const weightDetailMatch = line.match(
      /^(\d+(?:[.,]\d+)?)\s*kg\s*\*\s*(\d+[.,]\d{2})\s*kr\/kg\s*\d+[.,]\d{2}$/i
    );
    const inlineLabel = line.slice(0, amountMatch.index).trim();
    const isOnlyQuantityAndUnitPrice = /^(?:\d+\s*)?(?:st\s*)?[*x+]\s*\d+[.,]\d{2}$/i.test(inlineLabel);
    const label = (
      (weightDetailMatch && pendingLabel
        ? pendingLabel
        : (!inlineLabel || isOnlyQuantityAndUnitPrice)
        ? `${pendingLabel} ${inlineLabel}`.trim()
        : inlineLabel)
    ).replace(/[xX]\d+/g, '').trim();
    pendingLabel = '';
    if (!label || label.length < 2) continue;

    const normalizedLabel = normalizeForMatching(label);
    const isDepositReturn = /\b(pantretur|pant\s*retur|deposit\s*return)\b/i.test(normalizedLabel);
    const isDiscount = !isDepositReturn && (
      amount < 0
      || /\b(rabatt|discount|prisnedsattning|prisnedsatt|nedsattning|prisavdrag)\b|willys\s*plus\s*:/i.test(normalizedLabel)
    );
    const isDeposit = /(?:^|\s|\+)pant(?:\s|$)/i.test(normalizedLabel);
    const inlineQuantityMatch = inlineLabel.match(
      /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:(?:each|st|pcs?)\s*)?[*x+×]\s*(?:sek|kr)?\s*(\d+[.,]\d{2})/i
    );
    const directCategory = pickCategoryKey(label);
    const productKey = normalizeProductKey(label);
    const rememberedCategory = categoryMappings[productKey];
    const discountSubject = isDiscount
      ? normalizeProductKey(
        label.replace(/^.*?(rabatt|discount|prisnedsättning|prisnedsatt|nedsättning|prisavdrag|willys\s*plus)\s*:?\s*/i, '')
      )
      : '';
    const namedDiscountProduct = discountSubject
      ? [...itemLines].reverse().find((item) => (
        item.type === 'product'
          && (
            item.productKey === discountSubject
            || item.productKey.includes(discountSubject)
            || discountSubject.includes(item.productKey)
          )
      ))
      : null;
    const linkedProduct = namedDiscountProduct || lastProduct;
    const categoryKey = isDepositReturn
      ? 'depositReturn'
      : (isDeposit
        ? 'deposit'
      : (isDiscount
        ? linkedProduct?.categoryKey || directCategory
        : (rememberedCategory || directCategory)));

    const parsedLine = {
      name: label,
      amount,
      categoryKey,
      type: isDepositReturn
        ? 'deposit-return'
        : (isDeposit ? 'deposit' : (isDiscount ? 'discount' : 'product')),
      linkedTo: (isDiscount || isDeposit) ? linkedProduct?.name || null : null,
      productKey,
      ...((inlineQuantityMatch || weightDetailMatch) && !isDiscount && !isDeposit
        ? {
          quantity: sanitizeNumber((inlineQuantityMatch || weightDetailMatch)[1]),
          unitPrice: sanitizeNumber((inlineQuantityMatch || weightDetailMatch)[2])
        }
        : {}),
      confidence: rememberedCategory
        ? 'remembered'
        : (categoryKey === 'other' ? 'needs-review' : 'rule')
    };
    itemLines.push(parsedLine);
    if (parsedLine.type === 'product') lastProduct = parsedLine;
  }

  if (itemLines.length === 0 && !detectedTotal) return null;

  const parsedItemsTotal = roundMoney(
    itemLines.reduce((sum, item) => sum + item.amount, 0)
  );
  const unmatchedAmount = detectedTotal
    ? roundMoney(detectedTotal - parsedItemsTotal)
    : 0;
  if (Math.abs(unmatchedAmount) >= 0.01) {
    itemLines.push({
      name: 'Unmatched receipt amount',
      amount: unmatchedAmount,
      categoryKey: 'other',
      type: 'reconciliation',
      linkedTo: null,
      productKey: 'unmatched receipt amount',
      confidence: 'needs-review'
    });
  }

  const items = groupLineItems(itemLines);

  const total = roundMoney(
    detectedTotal || itemLines.reduce((sum, item) => sum + item.amount, 0)
  );

  return {
    merchant,
    date: parsedDate,
    currency,
    items: items.length > 0 ? items : createEmptyItems(),
    lineItems: itemLines,
    total,
    source: 'ocr',
    rawText: text,
    dateDetected: Boolean(dateMatch),
    unmatchedAmount
  };
};

// Renders the CartFilter application and coordinates its data and actions.
const CartFilter = () => {
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [language, setLanguage] = useState('en');
  const [displayCurrency, setDisplayCurrency] = useState('SEK');
  const [ocrText, setOcrText] = useState('');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptImagePreview, setReceiptImagePreview] = useState('');
  const [imageMessage, setImageMessage] = useState('');
  const [imageStatus, setImageStatus] = useState('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [parseMessage, setParseMessage] = useState('');
  const [parseStatus, setParseStatus] = useState('idle');
  const [authError, setAuthError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [receiptNotice, setReceiptNotice] = useState('');
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [shoppingList, setShoppingList] = useState([]);
  const [shoppingInput, setShoppingInput] = useState('');
  const [shoppingCategory, setShoppingCategory] = useState('other');
  const [shoppingListOwner, setShoppingListOwner] = useState('');
  const [categoryMappings, setCategoryMappings] = useState({});
  const [weeklyBudgetSek, setWeeklyBudgetSek] = useState(800);
  const [weeklyBudgetOwner, setWeeklyBudgetOwner] = useState('');
  const [weeklyShoppingDayLimit, setWeeklyShoppingDayLimit] = useState(3);
  const [weeklyShoppingDayOwner, setWeeklyShoppingDayOwner] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOwner, setSettingsOwner] = useState('');

  const [formData, setFormData] = useState({
    merchant: '',
    date: formatDateForInput(),
    currency: 'SEK',
    source: 'manual',
    imageUrl: '',
    storagePath: '',
    lineItems: [],
    rawText: '',
    items: createEmptyItems(),
    dateNeedsConfirmation: false,
    receiptTotal: 0,
    unmatchedAmount: 0
  });

  useEffect(() => () => {
    if (receiptImagePreview) URL.revokeObjectURL(receiptImagePreview);
  }, [receiptImagePreview]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      setLanguage(parsed.language || 'en');
      setDisplayCurrency(parsed.displayCurrency || 'SEK');
    } catch (error) {
      console.error('Failed to restore CartFilter state', error);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ language, displayCurrency })
    );
  }, [language, displayCurrency]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setShoppingList([]);
      setShoppingListOwner('');
      setSettingsLoaded(false);
      setSettingsOwner('');
      return;
    }

    const key = `cartfilter-shopping-list-${user.uid}`;
    try {
      const storedList = JSON.parse(window.localStorage.getItem(key) || '[]');
      setShoppingList(Array.isArray(storedList) ? storedList : []);
    } catch (error) {
      console.error('Failed to restore shopping list', error);
      setShoppingList([]);
    }
    setShoppingListOwner(user.uid);
  }, [user]);

  // Loads budget, shopping frequency, and shopping list settings from Firestore.
  useEffect(() => {
    if (!user) return undefined;

    const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences');
    return onSnapshot(settingsRef, (snapshot) => {
      const settings = snapshot?.exists?.() ? snapshot.data() : null;
      if (settings) {
        if (Number.isFinite(Number(settings.weeklyBudgetSek))) {
          setWeeklyBudgetSek(Number(settings.weeklyBudgetSek));
        }
        if (Number.isFinite(Number(settings.weeklyShoppingDayLimit))) {
          setWeeklyShoppingDayLimit(Number(settings.weeklyShoppingDayLimit));
        }
        if (Array.isArray(settings.shoppingList)) {
          setShoppingList(settings.shoppingList);
        }
      }
      setSettingsOwner(user.uid);
      setSettingsLoaded(true);
    });
  }, [user]);

  // Saves synchronized settings so the user can restore them on another device.
  useEffect(() => {
    if (!user || !settingsLoaded || settingsOwner !== user.uid) return;
    Promise.resolve(setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), {
      weeklyBudgetSek: Number(weeklyBudgetSek) || 0,
      weeklyShoppingDayLimit: Number(weeklyShoppingDayLimit) || 1,
      shoppingList,
      updatedAt: serverTimestamp()
    }, { merge: true })).catch((error) => {
      console.error('Failed to save CartFilter settings', error);
    });
  }, [shoppingList, weeklyBudgetSek, weeklyShoppingDayLimit, settingsLoaded, settingsOwner, user]);

  useEffect(() => {
    if (!user || shoppingListOwner !== user.uid) return;
    window.localStorage.setItem(
      `cartfilter-shopping-list-${user.uid}`,
      JSON.stringify(shoppingList)
    );
  }, [shoppingList, shoppingListOwner, user]);

  useEffect(() => {
    if (!user) {
      setWeeklyBudgetSek(800);
      setWeeklyBudgetOwner('');
      return;
    }

    const storedValue = window.localStorage.getItem(`cartfilter-weekly-budget-${user.uid}`);
    const storedBudget = storedValue === null ? Number.NaN : Number(storedValue);
    setWeeklyBudgetSek(Number.isFinite(storedBudget) && storedBudget >= 0 ? storedBudget : 800);
    setWeeklyBudgetOwner(user.uid);
  }, [user]);

  useEffect(() => {
    if (!user || weeklyBudgetOwner !== user.uid || weeklyBudgetSek === '') return;
    window.localStorage.setItem(
      `cartfilter-weekly-budget-${user.uid}`,
      String(weeklyBudgetSek)
    );
  }, [user, weeklyBudgetOwner, weeklyBudgetSek]);

  useEffect(() => {
    if (!user) {
      setWeeklyShoppingDayLimit(3);
      setWeeklyShoppingDayOwner('');
      return;
    }

    const storageKey = `cartfilter-weekly-shopping-days-${user.uid}`;
    const oldStorageKey = `cartfilter-weekly-visits-${user.uid}`;
    const storedValue = window.localStorage.getItem(storageKey)
      ?? window.localStorage.getItem(oldStorageKey);
    const storedLimit = storedValue === null ? Number.NaN : Number(storedValue);
    setWeeklyShoppingDayLimit(
      Number.isFinite(storedLimit) && storedLimit > 0 ? storedLimit : 3
    );
    setWeeklyShoppingDayOwner(user.uid);
  }, [user]);

  useEffect(() => {
    if (!user || weeklyShoppingDayOwner !== user.uid) return;
    window.localStorage.setItem(
      `cartfilter-weekly-shopping-days-${user.uid}`,
      String(weeklyShoppingDayLimit)
    );
  }, [user, weeklyShoppingDayLimit, weeklyShoppingDayOwner]);

  const t = useMemo(() => buildTranslator(language), [language]);
  const locale = language === 'sv' ? 'sv-SE' : 'en-US';

  useEffect(() => {
    if (!user) {
      setReceipts([]);
      setCategoryMappings({});
      setReceiptsLoading(false);
      setReceiptError('');
      return undefined;
    }

    setReceiptsLoading(true);
    setReceiptError('');

    const receiptsQuery = query(
      collection(db, 'users', user.uid, 'receipts'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(
      receiptsQuery,
      (snapshot) => {
        setReceipts(snapshot.docs.map((receiptDoc) => ({
          id: receiptDoc.id,
          ...receiptDoc.data()
        })));
        setReceiptsLoading(false);
      },
      (error) => {
        console.error('Failed to load Firestore receipts', error);
        setReceiptError(t('receiptLoadError'));
        setReceiptsLoading(false);
      }
    );
  }, [t, user]);

  useEffect(() => {
    if (!user) return undefined;

    return onSnapshot(
      collection(db, 'users', user.uid, 'categoryMappings'),
      (snapshot) => {
        setCategoryMappings(Object.fromEntries(
          snapshot.docs.map((mappingDoc) => {
            const mapping = mappingDoc.data();
            return [mapping.normalizedName, mapping.categoryKey];
          })
        ));
      },
      (error) => {
        console.error('Failed to load learned category mappings', error);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setReceipts((current) => {
      const refreshed = current.map((receipt) => refreshReceiptCategories(receipt, categoryMappings));
      return JSON.stringify(refreshed) === JSON.stringify(current) ? current : refreshed;
    });
  }, [categoryMappings, user]);

  const translatedCategoryLabel = useCallback((key) => t(`categories.${key}`) || key, [t]);

  const normalizedItems = useMemo(
    () =>
      formData.items.map((item) => ({
        ...item,
        amount: Number(item.amount) || 0
      })),
    [formData.items]
  );

  const calculatedItemsTotalSek = normalizedItems.reduce(
    (sum, item) => sum + normalizeToSek(item.amount, formData.currency),
    0
  );
  const totalSpentSek = formData.receiptTotal > 0
    ? normalizeToSek(formData.receiptTotal, formData.currency)
    : calculatedItemsTotalSek;
  const depositReturnSek = normalizedItems
    .filter((item) => item.key === 'depositReturn')
    .reduce(
      (sum, item) => sum + normalizeToSek(item.amount, formData.currency),
      0
    );
  const grossPurchasesSek = totalSpentSek - depositReturnSek;

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
        if (item.key === 'depositReturn') return;
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
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [receipts, translatedCategoryLabel]);
  const categoryTotalSek = categoryData.reduce((sum, category) => sum + category.value, 0);

  const learnedShoppingSuggestions = useMemo(() => {
    const learnedProducts = new Map();

    receipts.forEach((receipt) => {
      (receipt.lineItems || [])
        .filter((item) => item.type === 'product' && item.amount > 0)
        .forEach((item) => {
          const normalizedName = normalizeForMatching(item.name)
            .replace(/\b\d+\s*(g|kg|ml|l|st|p)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (!normalizedName) return;

          const current = learnedProducts.get(normalizedName);
          learnedProducts.set(normalizedName, {
            name: current?.name || item.name,
            count: (current?.count || 0) + 1,
            categoryKey: current?.categoryKey || item.categoryKey,
            estimatedPriceSek: current?.estimatedPriceSek || normalizeToSek(
              item.unitPrice || item.amount,
              receipt.currency
            )
          });
        });
    });

    const namesAlreadyAdded = new Set(
      shoppingList.map((item) => normalizeShoppingIdentity(item.name))
    );
    return [...learnedProducts.values()]
      .filter((item) => !namesAlreadyAdded.has(normalizeShoppingIdentity(item.name)))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [receipts, shoppingList]);

  const totalAcrossReceiptsSek = receipts.reduce((sum, receipt) => sum + receipt.totalSek, 0);
  const startOfThisWeek = getStartOfWeek();
  const startOfNextWeek = new Date(startOfThisWeek);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + 7);
  const receiptsThisWeek = receipts.filter((receipt) => {
    const receiptDate = new Date(`${receipt.date}T00:00:00`);
    return !Number.isNaN(receiptDate.getTime())
      && receiptDate >= startOfThisWeek
      && receiptDate < startOfNextWeek;
  });
  const weeklySpentSek = receiptsThisWeek
    .reduce((sum, receipt) => sum + (Number(receipt.totalSek) || 0), 0);
  const weeklyShoppingDayCount = new Set(
    receiptsThisWeek.map((receipt) => receipt.date).filter(Boolean)
  ).size;
  const weeklyStoreStops = new Set(
    receiptsThisWeek
      .filter((receipt) => {
        const merchant = normalizeProductKey(receipt.merchant);
        return merchant && merchant !== 'unknown merchant';
      })
      .map((receipt) => `${receipt.date}:${normalizeProductKey(receipt.merchant)}`)
  ).size;
  const weeklyShoppingDaysRemaining = weeklyShoppingDayLimit - weeklyShoppingDayCount;
  const weeklyBudgetValue = Number(weeklyBudgetSek) || 0;
  const weeklyRemainingSek = weeklyBudgetValue - weeklySpentSek;
  const weeklyBudgetProgress = weeklyBudgetValue > 0
    ? Math.min((weeklySpentSek / weeklyBudgetValue) * 100, 100)
    : 0;
  const shoppingListEstimatedTotalSek = shoppingList.reduce(
    (sum, item) => sum + (Number(item.estimatedPriceSek) || 0),
    0
  );
  const hasShoppingListEstimates = shoppingList.some(
    (item) => Number(item.estimatedPriceSek) > 0
  );
  const shoppingListBudgetDifferenceSek = weeklyRemainingSek - shoppingListEstimatedTotalSek;
  const shoppingListIsWithinBudget = shoppingListEstimatedTotalSek <= weeklyRemainingSek;

  // Updates one editable category row in the receipt form.
  const handleItemChange = (index, field, value) => {
    const nextItems = [...formData.items];
    nextItems[index] = {
      ...nextItems[index],
      [field]: field === 'amount' ? sanitizeNumber(value) : value
    };
    setFormData((current) => ({ ...current, items: nextItems }));
  };

  // Saves a user's product category correction for future receipts.
  const rememberCategory = async (name, categoryKey) => {
    if (!user || categoryKey === 'other') return;
    const normalizedName = normalizeProductKey(name);
    if (!normalizedName) return;

    setCategoryMappings((current) => ({ ...current, [normalizedName]: categoryKey }));
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'categoryMappings', encodeURIComponent(normalizedName)),
        {
          normalizedName,
          originalName: name,
          categoryKey,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Failed to remember category correction', error);
    }
  };

  // Applies a category correction and recalculates receipt totals.
  const handleLineItemCategoryChange = async (index, categoryKey) => {
    const correctedItem = formData.lineItems[index];
    setFormData((current) => {
      const lineItems = current.lineItems.map((item, itemIndex) => (
        itemIndex === index
          ? { ...item, categoryKey, confidence: 'user' }
          : item
      ));
      return {
        ...current,
        lineItems,
        items: groupLineItems(lineItems)
      };
    });

    if (!user || correctedItem?.type !== 'product') return;
    await rememberCategory(correctedItem.name, categoryKey);
  };

  // Adds unique products to the current shopping list.
  const addShoppingItems = (names, categoryKey = null, estimatedPriceSek = 0) => {
    setShoppingList((current) => {
      const existingNames = new Set(current.map((item) => normalizeShoppingIdentity(item.name)));
      const additions = names
        .filter((name) => name.trim() && !existingNames.has(normalizeShoppingIdentity(name)))
        .map((name, index) => ({
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          name: name.trim(),
          categoryKey,
          completed: false,
          estimatedPriceSek
        }));
      return [...current, ...additions];
    });
  };

  // Adds all products from a predefined shopping-list template.
  const addCommonTemplate = (templateKey) => {
    addShoppingItems(
      COMMON_LIST_TEMPLATES[templateKey].map((itemKey) => t(`commonItems.${itemKey}`))
    );
  };

  // Handles adding one manually entered shopping-list item.
  const handleAddShoppingItem = (event) => {
    event.preventDefault();
    if (!shoppingInput.trim()) return;
    addShoppingItems([shoppingInput], shoppingCategory);
    rememberCategory(shoppingInput, shoppingCategory);
    setShoppingInput('');
    setShoppingCategory('other');
  };

  // Toggles whether a shopping-list item is completed.
  const toggleShoppingItem = (itemId) => {
    setShoppingList((current) => current.map((item) => (
      item.id === itemId ? { ...item, completed: !item.completed } : item
    )));
  };

  // Removes one item from the shopping list.
  const removeShoppingItem = (itemId) => {
    setShoppingList((current) => current.filter((item) => item.id !== itemId));
  };

  // Updates an item's estimated price while keeping stored values in SEK.
  const updateShoppingItemPrice = (itemId, displayPrice) => {
    const estimatedPriceSek = normalizeToSek(
      sanitizeNumber(displayPrice),
      displayCurrency
    );
    setShoppingList((current) => current.map((item) => (
      item.id === itemId ? { ...item, estimatedPriceSek } : item
    )));
  };

  // Restores the receipt form and OCR state to their defaults.
  const resetForm = () => {
    setFormData({
      merchant: '',
      date: formatDateForInput(),
      currency: displayCurrency,
      source: 'manual',
      imageUrl: '',
      storagePath: '',
      lineItems: [],
      items: createEmptyItems(),
      dateNeedsConfirmation: false,
      receiptTotal: 0,
      unmatchedAmount: 0
    });
    setReceiptImage(null);
    setReceiptImagePreview('');
    setImageMessage('');
    setImageStatus('idle');
    setOcrProgress(0);
    setOcrText('');
    setParseMessage('');
    setParseStatus('idle');
    setReceiptNotice('');
  };

  // Validates and saves a non-duplicate receipt to Firestore.
  const handleAddReceipt = async () => {
    if (
      totalSpentSek <= 0
      || !user
      || receiptSaving
      || formData.dateNeedsConfirmation
      || !formData.date
    ) return;

    const cleanedItems = normalizedItems.filter((item) => item.amount !== 0);
    const receiptToSave = {
      merchant: formData.merchant || 'Unknown Merchant',
      date: formData.date,
      currency: formData.currency,
      source: formData.source,
      items: cleanedItems,
      lineItems: formData.lineItems,
      rawText: formData.rawText || null,
      totalSek: roundMoney(totalSpentSek),
      imageUrl: formData.imageUrl || null,
      storagePath: formData.storagePath || null,
      unmatchedAmount: formData.unmatchedAmount || 0
    };
    const receiptId = createReceiptFingerprint(receiptToSave);
    const isDuplicate = receipts.some(
      (receipt) => createReceiptFingerprint(receipt) === receiptId
    );
    if (isDuplicate) {
      setReceiptNotice(t('duplicateReceipt'));
      return;
    }

    setReceiptSaving(true);
    setReceiptError('');
    setReceiptNotice('');

    try {
      await setDoc(doc(db, 'users', user.uid, 'receipts', receiptId), {
        ...receiptToSave,
        fingerprint: receiptId,
        createdAt: serverTimestamp()
      });
      resetForm();
      setShowForm(false);
    } catch (error) {
      console.error('Failed to save Firestore receipt', error);
      setReceiptError(t('receiptSaveError'));
    } finally {
      setReceiptSaving(false);
    }
  };

  // Parses OCR text and fills the editable receipt form.
  const applyOcrText = (text) => {
    setParseStatus('working');
    const parsed = parseReceiptText(text, formData.date, categoryMappings);

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
      imageUrl: formData.imageUrl,
      storagePath: formData.storagePath,
      lineItems: parsed.lineItems,
      rawText: text,
      items: parsed.items,
      dateNeedsConfirmation: !parsed.dateDetected,
      receiptTotal: parsed.total,
      unmatchedAmount: parsed.unmatchedAmount
    });
    setParseStatus('success');
    setParseMessage(t('parseSuccess'));
  };

  // Starts parsing the OCR text currently shown in the text area.
  const handleParseReceipt = () => {
    applyOcrText(ocrText);
  };

  // Validates and prepares a locally selected receipt image.
  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setImageMessage('');

    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImageStatus('error');
      setImageMessage(t('imageTypeError'));
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setImageStatus('error');
      setImageMessage(t('imageSizeError'));
      return;
    }

    try {
      setImageStatus('compressing');
      const compressedImage = await compressReceiptImage(file);
      setReceiptImage(compressedImage);
      setReceiptImagePreview(URL.createObjectURL(compressedImage));
      setImageStatus('ready');
      setImageMessage(t('imageReady'));
    } catch (error) {
      console.error('Receipt image preparation failed', error);
      setImageStatus('error');
      setImageMessage(t('imageProcessingError'));
    }
  };

  // Uploads an image, runs OCR, and parses the extracted receipt text.
  const handleAnalyzeImage = async () => {
    if (!receiptImage) {
      setImageStatus('error');
      setImageMessage(t('noImageSelected'));
      return;
    }

    setImageStatus('working');
    setImageMessage('');
    setOcrProgress(0);
    let worker;

    try {
      const safeFileName = receiptImage.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `users/${user.uid}/receipts/${Date.now()}-${safeFileName}`;
      const imageReference = ref(storage, storagePath);
      await uploadBytes(imageReference, receiptImage, {
        contentType: receiptImage.type
      });
      const imageUrl = await getDownloadURL(imageReference);

      worker = await createWorker(['swe', 'eng'], 1, {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            setOcrProgress(Math.round((message.progress || 0) * 100));
          }
        }
      });
      const result = await worker.recognize(receiptImage);
      const extractedText = result.data.text.trim();

      setOcrText(extractedText);
      setFormData((current) => ({
        ...current,
        imageUrl,
        storagePath
      }));

      const parsed = parseReceiptText(extractedText, formData.date, categoryMappings);
      if (!parsed) {
        setParseStatus('error');
        setParseMessage(t('parseError'));
      } else {
        setFormData({
          merchant: parsed.merchant,
          date: parsed.date,
          currency: parsed.currency,
          source: parsed.source,
          imageUrl,
          storagePath,
          lineItems: parsed.lineItems,
          rawText: extractedText,
          items: parsed.items,
          dateNeedsConfirmation: !parsed.dateDetected,
          receiptTotal: parsed.total,
          unmatchedAmount: parsed.unmatchedAmount
        });
        setParseStatus('success');
        setParseMessage(t('parseSuccess'));
      }
      setImageStatus('success');
      setOcrProgress(100);
    } catch (error) {
      console.error('Receipt image OCR failed', error);
      setImageStatus('error');
      setImageMessage(t('imageProcessingError'));
    } finally {
      if (worker) await worker.terminate();
    }
  };

  // Opens Google authentication and signs the user into Firebase.
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

  // Signs the current user out of Firebase.
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
          <img
            src={cartFilterLogo}
            alt=""
            aria-hidden="true"
            style={{ display: 'block', width: 112, height: 112, objectFit: 'contain', margin: '0 auto 16px' }}
          />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={cartFilterLogo}
              alt=""
              aria-hidden="true"
              style={{ width: 48, height: 48, objectFit: 'contain', flex: '0 0 auto' }}
            />
            <div>
              <h1 className="text-2xl font-bold text-stone-900">{t('appName')}</h1>
              <p className="text-sm text-stone-600">{user.email}</p>
            </div>
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
        {receiptError && (
          <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {receiptError}
          </p>
        )}
        {receiptsLoading && (
          <p className="mb-4 text-sm text-stone-500">{t('loadingReceipts')}</p>
        )}
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

        <section className="mb-6 rounded-3xl border border-amber-100 bg-white p-6 shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-900">{t('shoppingFrequency')}</h2>
              <p className="mt-1 text-sm text-stone-600">
                {t('shoppingDays')}: {weeklyShoppingDayCount} / {weeklyShoppingDayLimit}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {t('storesVisited')}: {weeklyStoreStops}
              </p>
            </div>

            <label className="text-sm font-medium text-stone-700">
              {t('maximumShoppingDays')}
              <select
                value={weeklyShoppingDayLimit}
                onChange={(event) => setWeeklyShoppingDayLimit(Number(event.target.value))}
                className="ml-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {weeklyShoppingDaysRemaining === 1 && (
            <p className="mt-4 text-sm font-medium text-emerald-700">
              {t('shoppingDayLeft')}
            </p>
          )}

          {weeklyShoppingDaysRemaining === 0 && (
            <p className="mt-4 text-sm font-medium text-amber-700">
              {t('shoppingDayLimitReached')}
            </p>
          )}

          {weeklyShoppingDaysRemaining < 0 && (
            <p className="mt-4 text-sm font-medium text-red-600">
              {t('shoppingDayLimitExceeded')}
            </p>
          )}
        </section>

        <section className="mb-6 rounded-3xl border border-amber-100 bg-white p-6 shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-900">{t('weeklyBudget')}</h2>
              <p className="mt-1 text-sm text-stone-600">
                {t('spentThisWeek')}: {formatMoney(weeklySpentSek, displayCurrency, locale)}
              </p>
            </div>
            <label className="text-sm font-medium text-stone-700">
              {t('budgetInSek')}
              <input
                type="number"
                min="0"
                step="50"
                value={weeklyBudgetSek}
                onChange={(event) => {
                  const { value } = event.target;
                  setWeeklyBudgetSek(value === '' ? '' : Math.max(0, sanitizeNumber(value)));
                }}
                onBlur={() => {
                  if (weeklyBudgetSek === '') setWeeklyBudgetSek(0);
                }}
                className="ml-2 w-32 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right font-semibold text-stone-900"
              />
            </label>
          </div>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-amber-100">
            <div
              className={`h-full rounded-full ${
                weeklyRemainingSek < 0 ? 'bg-red-500' : 'bg-amber-500'
              }`}
              style={{ width: `${weeklyBudgetProgress}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-4">
            <span className="text-sm text-stone-600">{t('remainingThisWeek')}</span>
            <strong className={weeklyRemainingSek < 0 ? 'text-red-600' : 'text-emerald-700'}>
              {formatMoney(weeklyRemainingSek, displayCurrency, locale)}
            </strong>
          </div>
          {weeklyRemainingSek < 0 && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600">
              {t('overBudget')}
            </p>
          )}
        </section>

        <section className="mb-6 rounded-3xl border border-amber-100 bg-white p-6 shadow-md">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-stone-900">{t('shoppingList')}</h2>
              <p className="text-sm text-stone-600">{t('shoppingListHint')}</p>
            </div>
            {shoppingList.some((item) => item.completed) && (
              <button
                type="button"
                onClick={() => setShoppingList((current) => current.filter((item) => !item.completed))}
                className="text-sm font-semibold text-amber-700"
              >
                {t('clearCompleted')}
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addCommonTemplate('weeklyBasics')}
              className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900"
            >
              + {t('weeklyBasics')}
            </button>
            <button
              type="button"
              onClick={() => addCommonTemplate('proteinAndProduce')}
              className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900"
            >
              + {t('proteinAndProduce')}
            </button>
          </div>

          <form onSubmit={handleAddShoppingItem} className="mt-4 grid gap-2 sm:grid-cols-[1fr_170px_auto]">
            <input
              type="text"
              value={shoppingInput}
              onChange={(event) => setShoppingInput(event.target.value)}
              placeholder={t('itemPlaceholder')}
              className="min-w-0 flex-1 rounded-full border border-stone-300 px-4 py-2"
            />
            <select
              value={shoppingCategory}
              onChange={(event) => setShoppingCategory(event.target.value)}
              aria-label={t('itemCategory')}
              className="rounded-full border border-stone-300 bg-white px-3 py-2"
            >
              {REVIEW_CATEGORY_KEYS
                .filter((categoryKey) => categoryKey !== 'deposit')
                .map((categoryKey) => (
                  <option key={categoryKey} value={categoryKey}>
                    {translatedCategoryLabel(categoryKey)}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="rounded-full bg-stone-900 px-5 py-2 font-semibold text-white"
            >
              {t('addItem')}
            </button>
          </form>

          {learnedShoppingSuggestions.length > 0 ? (
            <div className="mt-5">
              <p className="text-sm font-semibold text-stone-800">{t('learnedSuggestions')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {learnedShoppingSuggestions.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => addShoppingItems(
                      [item.name],
                      item.categoryKey,
                      item.estimatedPriceSek
                    )}
                    className="rounded-full border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-700"
                  >
                    + {item.name} {item.count > 1 ? `×${item.count}` : ''}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-stone-500">{t('learnedSuggestionsHint')}</p>
          )}

          {shoppingList.length > 0 ? (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {shoppingList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => toggleShoppingItem(item.id)}
                    aria-label={item.name}
                  />
                  <div className="min-w-0 flex-1">
                    <span className={`block text-sm ${item.completed ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                      {item.name}
                    </span>
                    {item.categoryKey && item.categoryKey !== 'other' && (
                      <span className="block text-xs text-stone-500">
                        {translatedCategoryLabel(item.categoryKey)}
                      </span>
                    )}
                  </div>
                  <label className="text-xs text-stone-500">
                    <span className="sr-only">
                      {t('estimatedPrice')}: {item.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          item.estimatedPriceSek
                            ? roundMoney(convertFromSek(
                              item.estimatedPriceSek,
                              displayCurrency
                            ))
                            : ''
                        }
                        onChange={(event) => updateShoppingItemPrice(
                          item.id,
                          event.target.value
                        )}
                        aria-label={`${t('estimatedPrice')}: ${item.name}`}
                        placeholder="0.00"
                        className="w-20 rounded-xl border border-stone-300 bg-white px-2 py-1 text-right text-sm text-stone-800"
                      />
                      <span>{displayCurrency}</span>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeShoppingItem(item.id)}
                    aria-label={`${t('removeItem')}: ${item.name}`}
                    className="text-xs font-semibold text-red-600"
                  >
                    {t('removeItem')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-stone-500">{t('emptyShoppingList')}</p>
          )}

          {shoppingList.length > 0 && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-stone-600">{t('estimatedListTotal')}</span>
                <strong className="text-lg text-stone-900">
                  {formatMoney(
                    shoppingListEstimatedTotalSek,
                    displayCurrency,
                    locale
                  )}
                </strong>
              </div>

              {!hasShoppingListEstimates && (
                <p className="mt-2 text-sm text-stone-600">{t('addEstimatedPrices')}</p>
              )}

              {hasShoppingListEstimates && shoppingListIsWithinBudget && (
                <p className="mt-2 text-sm font-semibold text-emerald-700">
                  {t('withinBudget')}
                </p>
              )}

              {hasShoppingListEstimates && !shoppingListIsWithinBudget && (
                <p className="mt-2 text-sm font-semibold text-red-600">
                  {t('overPlannedBudget')}{' '}
                  {formatMoney(
                    Math.abs(shoppingListBudgetDifferenceSek),
                    displayCurrency,
                    locale
                  )}
                </p>
              )}
            </div>
          )}
        </section>

        {showForm && (
          <section className="grid gap-6 lg:grid-cols-2 mb-8">
            <div className="bg-white rounded-3xl shadow-md p-6 border border-amber-100">
              <h2 className="text-xl font-bold text-stone-900 mb-2">{t('importTitle')}</h2>
              <p className="text-stone-600 mb-4">{t('importDescription')}</p>

              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <label
                  htmlFor="receipt-image"
                  className="inline-block cursor-pointer rounded-full bg-amber-600 px-5 py-3 font-semibold text-white"
                >
                  {t('chooseImage')}
                </label>
                <input
                  id="receipt-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleImageSelected}
                  disabled={imageStatus === 'working'}
                  className="sr-only"
                />
                <p className="mt-3 text-xs text-stone-600">{t('imageHint')}</p>

                {receiptImagePreview && (
                  <img
                    src={receiptImagePreview}
                    alt={t('chooseImage')}
                    className="mt-4 max-h-72 w-full rounded-2xl bg-white object-contain"
                  />
                )}

                {receiptImage && (
                  <button
                    type="button"
                    onClick={handleAnalyzeImage}
                    disabled={imageStatus === 'working'}
                    className="mt-4 w-full rounded-full bg-stone-900 px-5 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {imageStatus === 'working'
                      ? `${t('analyzingImage')} ${ocrProgress}%`
                      : t('analyzeImage')}
                  </button>
                )}

                {imageMessage && (
                  <p
                    role={imageStatus === 'error' ? 'alert' : undefined}
                    className={`mt-3 text-sm ${imageStatus === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
                  >
                    {imageMessage}
                  </p>
                )}
              </div>

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
                    onChange={(event) => setFormData((current) => ({
                      ...current,
                      date: event.target.value
                    }))}
                    className="w-full border border-stone-300 rounded-2xl px-3 py-2"
                  />
                  {formData.dateNeedsConfirmation && (
                    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                      <p className="text-xs text-amber-900">{t('receiptDateNotDetected')}</p>
                      <button
                        type="button"
                        onClick={() => setFormData((current) => ({
                          ...current,
                          dateNeedsConfirmation: false
                        }))}
                        className="mt-2 text-xs font-semibold text-amber-800 underline"
                      >
                        {t('confirmDate')}
                      </button>
                    </div>
                  )}
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

              {formData.lineItems.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-stone-800 mb-3">{t('detectedLines')}</p>
                  <div className="space-y-2">
                    {formData.lineItems.map((item, index) => (
                      <div
                        key={`${item.name}-${index}`}
                        className="grid gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-3 sm:grid-cols-[1fr_150px_90px]"
                      >
                        <div>
                          <p className="text-sm font-medium text-stone-800">{item.name}</p>
                          {item.quantity && item.unitPrice && (
                            <p className="text-xs text-stone-500">
                              {item.quantity} ×{' '}
                              {new Intl.NumberFormat(locale, {
                                style: 'currency',
                                currency: formData.currency
                              }).format(item.unitPrice)}
                            </p>
                          )}
                          <p className="text-xs text-stone-500">
                            {t(item.type)}
                            {item.linkedTo ? ` · ${item.linkedTo}` : ''}
                            {item.confidence === 'needs-review' ? ` · ${t('needsReview')}` : ''}
                          </p>
                        </div>
                        <select
                          aria-label={`${t('category')}: ${item.name}`}
                          value={item.categoryKey}
                          onChange={(event) => handleLineItemCategoryChange(index, event.target.value)}
                          className="rounded-xl border border-stone-300 bg-white px-2 py-2 text-sm"
                        >
                          {REVIEW_CATEGORY_KEYS.map((categoryKey) => (
                            <option key={categoryKey} value={categoryKey}>
                              {translatedCategoryLabel(categoryKey)}
                            </option>
                          ))}
                        </select>
                        <span className={`text-right text-sm font-semibold ${item.amount < 0 ? 'text-emerald-700' : 'text-stone-800'}`}>
                          {new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: formData.currency
                          }).format(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                {depositReturnSek < 0 && (
                  <>
                    <p className="flex justify-between gap-4 text-sm text-stone-600">
                      <span>{t('grossPurchases')}</span>
                      <span>{formatMoney(grossPurchasesSek, formData.currency, locale)}</span>
                    </p>
                    <p className="mt-1 flex justify-between gap-4 text-sm text-emerald-700">
                      <span>{t('depositReturnCredit')}</span>
                      <span>{formatMoney(depositReturnSek, formData.currency, locale)}</span>
                    </p>
                  </>
                )}
                <p className="mt-1 flex justify-between gap-4 text-sm text-stone-600">
                  <span>{depositReturnSek < 0 ? t('amountPaid') : t('total')}</span>
                  <span className="font-bold text-lg text-amber-700">
                    {formatMoney(totalSpentSek, formData.currency, locale)}
                  </span>
                </p>
                <p className="text-xs text-stone-500 mt-1">
                  {t('currency')}: {displayCurrency} view, {formData.currency} receipt
                </p>
              </div>

              {Math.abs(formData.unmatchedAmount || 0) >= 0.01 && (
                <p
                  role="alert"
                  className="mt-4 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900"
                >
                  {formatMoney(
                    normalizeToSek(
                      Math.abs(formData.unmatchedAmount),
                      formData.currency
                    ),
                    formData.currency,
                    locale
                  )}{' '}
                  {t('receiptMismatch')}
                </p>
              )}

              {receiptNotice && (
                <p
                  role="status"
                  className="mt-4 rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900"
                >
                  {receiptNotice}
                </p>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleAddReceipt}
                  disabled={
                    receiptSaving
                    || totalSpentSek <= 0
                    || formData.dateNeedsConfirmation
                    || !formData.date
                  }
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-full transition"
                >
                  {receiptSaving ? t('savingReceipt') : t('saveReceipt')}
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
                  const percentage = categoryTotalSek > 0
                    ? ((category.value / categoryTotalSek) * 100).toFixed(1)
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
              {receiptsWithDisplay.map((receipt) => (
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

        {receipts.length === 0 && !showForm && !receiptsLoading && (
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
export { parseReceiptText };
