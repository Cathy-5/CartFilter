import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut
} from 'firebase/auth';
import {
  addDoc,
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
      household: 'Household',
      deposit: 'Refundable deposit',
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
      household: 'Hushall',
      deposit: 'Pant',
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
  { key: 'beverages', score: 10, pattern: /\b(cola|pepsi|fanta|sprite|juice|soda|lask|dryck|vatten|water|beer|wine)\b/i },
  { key: 'meat', score: 9, pattern: /\b(beef|chicken|pork|meat|sausage|bacon|lamb|tofu|egg|kott|korv|kyckling|flask|agg|notfars)\b/i },
  { key: 'fruits', score: 9, pattern: /\b(fruit|apple|banana|orange|pear|grape|berries|frukt|apple|banan|apelsin|paron|druvor|bar)\b/i },
  { key: 'vegetables', score: 9, pattern: /\b(tomato|potato|onion|salad|carrot|pepper|broccoli|spinach|parsley|cucumber|gronsak|tomat|potatis|lok|gurka|morot|paprika|spenat|bladpersilja|persilja|sallad)\b/i },
  { key: 'dairy', score: 8, pattern: /\b(milk|cheese|yogurt|butter|cream|mejeri|mjolk|ost|smor|yoghurt)\b/i },
  { key: 'grains', score: 8, pattern: /\b(bread|brioche|brosche|broiche|rice|pasta|flour|oat|cereal|brod|ris|havre|mjol)\b/i },
  { key: 'snacks', score: 8, pattern: /\b(chips|candy|chocolate|snack|cookie|cookies|biscuit|biscoff|muffin|muffins|pastel\s+de\s+nata|godis|kex|choklad|muslibar|popcorn)\b/i },
  { key: 'frozen', score: 7, pattern: /\b(frozen|ice cream|glass|fryst)\b/i },
  { key: 'pantry', score: 5, pattern: /\b(oil|salt|sugar|spice|sauce|beans|coffee|tea|krydda|socker|kaffe)\b/i },
  { key: 'household', score: 8, pattern: /\b(soap|detergent|paper|napkin|clean|disk|tvatt|hushall|toalett)\b/i },
  { key: 'beverages', score: 3, pattern: /\bzero\b/i }
];

const DEFAULT_CATEGORY_KEYS = ['meat', 'fruits', 'vegetables', 'dairy', 'grains', 'pantry', 'snacks'];
const REVIEW_CATEGORY_KEYS = [
  'meat',
  'fruits',
  'vegetables',
  'dairy',
  'grains',
  'pantry',
  'snacks',
  'frozen',
  'beverages',
  'household',
  'deposit',
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

const normalizeForMatching = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const normalizeProductKey = (value) => normalizeForMatching(value)
  .replace(/\b\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l|st|p)\b/g, ' ')
  .replace(/\b\d+\s*st\b/g, ' ')
  .replace(/\d+[.,]\d{2}/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeShoppingIdentity = (value) => {
  const normalized = normalizeProductKey(value);
  return SHOPPING_ITEM_ALIASES[normalized] || normalized;
};

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

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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

const findMerchant = (lines) => {
  const knownMerchant = lines.find((line) => (
    /willys|ica|coop|lidl|hemkop|city\s*gross|tempo|mathem/i.test(normalizeForMatching(line))
  ));
  if (knownMerchant) {
    const normalized = normalizeForMatching(knownMerchant);
    if (normalized.includes('lidl')) return 'Lidl';
    return knownMerchant;
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

const normalizeReceiptDate = (dateText, fallbackDate) => {
  if (!dateText) return fallbackDate;
  const parts = dateText.split(/[-/.]/).map((part) => Number(part));
  if (parts[0] > 1900) {
    return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
  }
  return `${parts[2]}-${String(parts[1]).padStart(2, '0')}-${String(parts[0]).padStart(2, '0')}`;
};

const isReceiptMetadata = (line) => {
  const normalized = normalizeForMatching(line);
  return !line
    || /^[-=_*]+$/.test(line)
    || /^(tel|org\.?\s*nr|kvitto|receipt)\b/.test(normalized)
    || /^\d{1,2}:\d{2}/.test(line);
};

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
      && /-?\d+[.,]\d{2}(?:\s*[a-c])?$/i.test(line)
  ));
  const totalAmountMatch = totalLine?.match(/(-?\d+[.,]\d{2})(?:\s*[a-c])?$/i);
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
    // Lidl appends a VAT code (for example "B") after each product price.
    const amountMatch = line.match(/(-?\d+[.,]\d{2})(?:\s*(sek|kr|eur|usd|€|\$))?(?:\s+[a-c])?$/i);
    if (!amountMatch) {
      if (!isReceiptMetadata(line)) pendingLabel = line;
      continue;
    }

    const amount = sanitizeNumber(amountMatch[1]);
    if (/(total|sum|att betala|totalt|subtotal|amount due|kopbelopp|köpbelopp)/i.test(line)) {
      detectedTotal = amount;
      continue;
    }

    const inlineLabel = line.slice(0, amountMatch.index).trim();
    const isOnlyQuantityAndUnitPrice = /^(?:\d+\s*)?(?:st\s*)?[*x+]\s*\d+[.,]\d{2}$/i.test(inlineLabel);
    const label = (
      (!inlineLabel || isOnlyQuantityAndUnitPrice)
        ? `${pendingLabel} ${inlineLabel}`.trim()
        : inlineLabel
    ).replace(/[xX]\d+/g, '').trim();
    pendingLabel = '';
    if (!label || label.length < 2) continue;

    const normalizedLabel = normalizeForMatching(label);
    const isDiscount = /\b(rabatt|discount|prisnedsattning|prisnedsatt|nedsattning|prisavdrag)\b|willys\s*plus\s*:/i.test(normalizedLabel);
    const isDeposit = /(?:^|\s|\+)pant(?:\s|$)/i.test(normalizedLabel);
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
    const categoryKey = isDeposit
      ? 'deposit'
      : (isDiscount
        ? linkedProduct?.categoryKey || directCategory
        : (rememberedCategory || directCategory));

    const parsedLine = {
      name: label,
      amount,
      categoryKey,
      type: isDeposit ? 'deposit' : (isDiscount ? 'discount' : 'product'),
      linkedTo: (isDiscount || isDeposit) ? linkedProduct?.name || null : null,
      productKey,
      confidence: rememberedCategory
        ? 'remembered'
        : (categoryKey === 'other' ? 'needs-review' : 'rule')
    };
    itemLines.push(parsedLine);
    if (parsedLine.type === 'product') lastProduct = parsedLine;
  }

  if (itemLines.length === 0 && !detectedTotal) return null;

  const items = groupLineItems(itemLines);

  const total = detectedTotal || itemLines.reduce((sum, item) => sum + item.amount, 0);

  return {
    merchant,
    date: parsedDate,
    currency,
    items: items.length > 0 ? items : createEmptyItems(),
    lineItems: itemLines,
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
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptImagePreview, setReceiptImagePreview] = useState('');
  const [imageMessage, setImageMessage] = useState('');
  const [imageStatus, setImageStatus] = useState('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [parseMessage, setParseMessage] = useState('');
  const [parseStatus, setParseStatus] = useState('idle');
  const [authError, setAuthError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [shoppingList, setShoppingList] = useState([]);
  const [shoppingInput, setShoppingInput] = useState('');
  const [shoppingCategory, setShoppingCategory] = useState('other');
  const [shoppingListOwner, setShoppingListOwner] = useState('');
  const [categoryMappings, setCategoryMappings] = useState({});

  const [formData, setFormData] = useState({
    merchant: '',
    date: formatDateForInput(),
    currency: 'SEK',
    source: 'manual',
    imageUrl: '',
    storagePath: '',
    lineItems: [],
    items: createEmptyItems()
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

  useEffect(() => {
    if (!user || shoppingListOwner !== user.uid) return;
    window.localStorage.setItem(
      `cartfilter-shopping-list-${user.uid}`,
      JSON.stringify(shoppingList)
    );
  }, [shoppingList, shoppingListOwner, user]);

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
            categoryKey: current?.categoryKey || item.categoryKey
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

  const handleItemChange = (index, field, value) => {
    const nextItems = [...formData.items];
    nextItems[index] = {
      ...nextItems[index],
      [field]: field === 'amount' ? sanitizeNumber(value) : value
    };
    setFormData((current) => ({ ...current, items: nextItems }));
  };

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

  const addShoppingItems = (names, categoryKey = null) => {
    setShoppingList((current) => {
      const existingNames = new Set(current.map((item) => normalizeShoppingIdentity(item.name)));
      const additions = names
        .filter((name) => name.trim() && !existingNames.has(normalizeShoppingIdentity(name)))
        .map((name, index) => ({
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          name: name.trim(),
          categoryKey,
          completed: false
        }));
      return [...current, ...additions];
    });
  };

  const addCommonTemplate = (templateKey) => {
    addShoppingItems(
      COMMON_LIST_TEMPLATES[templateKey].map((itemKey) => t(`commonItems.${itemKey}`))
    );
  };

  const handleAddShoppingItem = (event) => {
    event.preventDefault();
    if (!shoppingInput.trim()) return;
    addShoppingItems([shoppingInput], shoppingCategory);
    rememberCategory(shoppingInput, shoppingCategory);
    setShoppingInput('');
    setShoppingCategory('other');
  };

  const toggleShoppingItem = (itemId) => {
    setShoppingList((current) => current.map((item) => (
      item.id === itemId ? { ...item, completed: !item.completed } : item
    )));
  };

  const removeShoppingItem = (itemId) => {
    setShoppingList((current) => current.filter((item) => item.id !== itemId));
  };

  const resetForm = () => {
    setFormData({
      merchant: '',
      date: formatDateForInput(),
      currency: displayCurrency,
      source: 'manual',
      imageUrl: '',
      storagePath: '',
      lineItems: [],
      items: createEmptyItems()
    });
    setReceiptImage(null);
    setReceiptImagePreview('');
    setImageMessage('');
    setImageStatus('idle');
    setOcrProgress(0);
    setOcrText('');
    setParseMessage('');
    setParseStatus('idle');
  };

  const handleAddReceipt = async () => {
    if (totalSpentSek <= 0 || !user || receiptSaving) return;

    const cleanedItems = normalizedItems.filter((item) => item.amount > 0);
    setReceiptSaving(true);
    setReceiptError('');

    try {
      await addDoc(collection(db, 'users', user.uid, 'receipts'), {
        merchant: formData.merchant || 'Unknown Merchant',
        date: formData.date,
        currency: formData.currency,
        source: formData.source,
        items: cleanedItems,
        lineItems: formData.lineItems,
        totalSek: roundMoney(totalSpentSek),
        imageUrl: formData.imageUrl || null,
        storagePath: formData.storagePath || null,
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
      items: parsed.items
    });
    setParseStatus('success');
    setParseMessage(t('parseSuccess'));
  };

  const handleParseReceipt = () => {
    applyOcrText(ocrText);
  };

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
          items: parsed.items
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
                    onClick={() => addShoppingItems([item.name], item.categoryKey)}
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
                  disabled={receiptSaving || totalSpentSek <= 0}
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
