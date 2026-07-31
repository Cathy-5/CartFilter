import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Coins,
  FileUp,
  Globe2,
  Home,
  ListChecks,
  LogOut,
  Mail,
  Pencil,
  Plus,
  ReceiptText,
  ShoppingBag,
  Tag,
  Trash2,
  UserRound,
  Wallet,
  X
} from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { auth, db, storage } from './firebase';
import cartFilterLogo from './assets/cartfilter-logo.png';

const STORAGE_KEY = 'cartfilter-state-v2';
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_COMPRESSED_IMAGE_EDGE = 2000;
const MAX_PDF_PAGES = 5;
const MIN_RECEIPT_IMAGE_WIDTH = 650;
const MIN_RECEIPT_IMAGE_HEIGHT = 800;
const MIN_RECEIPT_IMAGE_PIXELS = 600000;
const SUPPORTED_CURRENCIES = ['SEK', 'EUR', 'USD'];
const RECEIPT_FILE_ACCEPT = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.gif',
  '.avif',
  '.heic',
  '.heif',
  '.pdf'
].join(',');
const STANDARD_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/gif',
  'image/avif'
]);
const OCR_LANGUAGE_CODES = {
  auto: ['swe', 'eng'],
  sv: ['swe'],
  en: ['eng']
};
const SUPPORTED_RECEIPT_LANGUAGES = new Set(Object.keys(OCR_LANGUAGE_CODES));
const EXCHANGE_RATES = {
  SEK: 1,
  EUR: 11.4,
  USD: 10.5
};

const CATEGORY_RANK_COLORS = [
  '#c84d3a',
  '#dfa51f',
  '#2f7d61',
  '#3f78a5',
  '#7659a6',
  '#c45d83',
  '#368c89',
  '#b66b3d',
  '#71883c',
  '#5b91c4',
  '#945f86',
  '#766f68',
  '#b079b5',
  '#8d792f'
];

export const getCategoryRankColor = (index) => (
  CATEGORY_RANK_COLORS[Math.min(index, CATEGORY_RANK_COLORS.length - 1)]
);

const TRANSLATIONS = {
  en: {
    appName: 'CartFilter',
    tagline: 'Scan receipts. Plan better. Spend less.',
    signIn: 'Sign in with Google',
    signOut: 'Sign out',
    account: 'Account',
    accountEmail: 'Account email',
    editName: 'Edit name',
    preferredName: 'Preferred name',
    preferredNameHint: 'This is the name CartFilter will use to greet you.',
    nameRequired: 'Enter a name before saving.',
    nameSaved: 'Name saved.',
    save: 'Save',
    signInError: 'Google sign-in did not complete. Please try again.',
    receiptLoadError: 'Your saved receipts could not be loaded. Check the Firestore rules and try again.',
    receiptSaveError: 'The receipt could not be saved. Please try again.',
    duplicateReceipt: 'Already saved in history.',
    loadingReceipts: 'Loading your receipts...',
    savingReceipt: 'Saving...',
    welcome: 'Smart grocery receipt tracking',
    welcomeToCartFilter: 'Welcome to CartFilter',
    welcomeBack: 'Welcome back',
    language: 'Language',
    currency: 'Currency',
    importReceipt: 'Scan or upload receipt',
    addManually: 'Add manually',
    hideForm: 'Hide form',
    newReceipt: 'New receipt',
    importTitle: 'Add a receipt',
    importDescription: 'Choose a clear receipt photo.',
    chooseImage: 'Choose receipt file',
    takePhoto: 'Take photo',
    imageHint: 'Use your camera or choose a photo. Maximum 10 MB.',
    fileHint: 'JPG, PNG, WebP, HEIC, BMP, GIF, AVIF, or PDF. Maximum 10 MB.',
    analyzeImage: 'Check receipt',
    analyzingImage: 'Checking receipt',
    imageReady: 'Photo ready',
    imageTypeError: 'Choose a supported image or PDF file.',
    imageSizeError: 'The original image must be smaller than 10 MB.',
    imageProcessingError: 'The image could not be analyzed. Try a clearer, well-lit photo.',
    noImageSelected: 'Choose a receipt image first.',
    imageQualityWarning: 'This image may be difficult to read. Try a clearer photo or continue and edit the result.',
    chooseAnotherPhoto: 'Choose another photo',
    continueAnyway: 'Continue anyway',
    manualReviewInstead: 'Enter manually',
    manualFallbackMessage: 'We could not read this receipt reliably. Enter or correct the items manually.',
    preparingFile: 'Preparing file...',
    pdfPageLimit: 'Only the first 5 PDF pages will be checked.',
    receiptLanguage: 'Receipt language',
    automaticLanguage: 'Automatic',
    swedishLanguage: 'Swedish',
    englishLanguage: 'English',
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
    parsedFromOcr: 'Read from receipt photo',
    manualEntry: 'Manual entry',
    totalSpent: 'Total spent',
    weeklyBudget: 'Weekly budget',
    budgetInSek: 'Budget in SEK',
    spentThisWeek: 'Spent this week',
    remainingThisWeek: 'Remaining',
    overBudget: 'You are over your weekly budget.',
    budgetNotSet: 'Set a weekly budget to start tracking.',
    budgetOnTrack: 'Your weekly spending is on track.',
    budgetGettingClose: 'You are getting close to your weekly limit.',
    budgetLimitReached: 'You have used your weekly budget.',
    budgetFarOver: 'You are well over your weekly budget.',
    shoppingFrequency: 'Shopping frequency',
    shoppingDays: 'Shopping days',
    shoppingDaysUsed: 'shopping days used',
    maximumShoppingDays: 'Maximum shopping days per week',
    storesVisited: 'Stores visited',
    shoppingDayLeft: 'You have one shopping day left.',
    shoppingDaysOnTrack: 'Your shopping-day plan is on track.',
    shoppingDayLimitReached: 'Plan reached for this week.',
    shoppingDayLimitExceeded: 'One extra shopping day this week.',
    shoppingDayLimitFarExceeded: 'You are two or more days over your plan.',
    receiptDateNotDetected: 'Receipt date was not detected. Please confirm it.',
    confirmDate: 'Confirm date',
    receipts: 'Receipts',
    items: 'items',
    spendingByCategory: 'Spending by category',
    largestShare: 'Largest share',
    recentReceipts: 'Recent receipts',
    homeFeatures: 'Your shopping dashboard',
    home: 'Home',
    budget: 'Budget',
    shoppingDaysNav: 'Shopping days',
    advancedDetails: 'Advanced details',
    back: 'Back',
    next: 'Next',
    step: 'Step',
    uploadStep: 'Add receipt',
    detailsStep: 'Check details',
    categoriesStep: 'Check categories',
    saveStep: 'Save receipt',
    receiptAnalysis: 'Analyze a receipt',
    receiptAnalysisHint: 'Scan a receipt and understand your spending.',
    budgetPlanning: 'Weekly budget',
    budgetPlanningHint: 'Set a limit and track what remains.',
    shoppingDaysFeature: 'Shopping days',
    shoppingDaysFeatureHint: 'Plan fewer supermarket visits.',
    shoppingListFeature: 'Shopping list',
    shoppingListFeatureHint: 'Plan what to buy before going.',
    showMoreReceipts: 'Show more',
    showLessReceipts: 'Show less',
    receiptDetails: 'View receipt details',
    noReceipts: 'No receipts yet',
    noReceiptsHint: 'Scan your first receipt to start tracking grocery costs.',
    receiptHeroHint: 'Scan a receipt and see where your money goes.',
    exchangeRateNote: 'Ready for SEK, EUR, and USD.',
    parseSuccess: 'Receipt ready. Check the details.',
    parseError: 'No useful receipt data was found. Try a clearer photo or enter the details manually.',
    groceryFocus: 'Grocery categories',
    detectedLines: 'Detected receipt lines',
    product: 'Product',
    discount: 'Discount',
    deposit: 'Deposit',
    'deposit-return': 'Deposit return credit',
    reconciliation: 'Unmatched receipt amount',
    receiptMismatch: 'could not be matched to a product. Review the detected lines.',
    itemsDifferFromTotal: 'Items differ from the receipt total by',
    printedTotal: 'Receipt total',
    itemSum: 'Item sum',
    reviewItems: 'Review items',
    useReceiptTotal: 'Use receipt total',
    resolveMismatchBeforeSaving: 'Review the difference before saving.',
    receiptTotalAdjustment: 'Receipt total adjustment',
    grossPurchases: 'Gross purchases',
    depositReturnCredit: 'Deposit return credit',
    amountPaid: 'Amount paid',
    needsReview: 'Needs review',
    checkThisItem: 'Check this item',
    confirmItem: 'Looks right',
    itemName: 'Item name',
    quantity: 'Quantity',
    unitPrice: 'Unit price',
    lineTotal: 'Line total',
    addMissingItem: 'Add missing item',
    removeLine: 'Remove item',
    manualReviewReceipt: 'This receipt may need manual review.',
    shoppingList: 'Shopping list',
    shoppingListHint: 'Add what you plan to buy.',
    weeklyBasics: 'Add weekly basics',
    proteinAndProduce: 'Add protein and vegetables',
    learnedSuggestions: 'Suggestions from your receipts',
    learnedSuggestionsHint: 'Suggestions appear after you save receipts with detected product lines.',
    addItem: 'Add',
    itemCategory: 'Category',
    itemPlaceholder: 'Milk, tomatoes, rice...',
    removeItem: 'Remove',
    clearCompleted: 'Clear completed',
    emptyShoppingList: 'Your shopping list is empty.',
    estimatedPrice: 'Estimated price',
    itemsToBuy: 'to buy',
    scrollForMore: 'Scroll for more',
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
    tagline: 'Skanna kvitton. Planera bättre. Spara mer.',
    signIn: 'Logga in med Google',
    signOut: 'Logga ut',
    account: 'Konto',
    accountEmail: 'E-post för kontot',
    editName: 'Redigera namn',
    preferredName: 'Tilltalsnamn',
    preferredNameHint: 'Det här namnet använder CartFilter när vi hälsar på dig.',
    nameRequired: 'Ange ett namn innan du sparar.',
    nameSaved: 'Namnet har sparats.',
    save: 'Spara',
    signInError: 'Google-inloggningen slutfordes inte. Forsok igen igen.',
    receiptLoadError: 'Dina sparade kvitton kunde inte laddas. Kontrollera Firestore-reglerna och forsok igen.',
    receiptSaveError: 'Kvittot kunde inte sparas. Forsok igen.',
    duplicateReceipt: 'Redan sparat i historiken.',
    loadingReceipts: 'Laddar dina kvitton...',
    savingReceipt: 'Sparar...',
    welcome: 'Smart kvittosparning for matinkop',
    welcomeToCartFilter: 'Välkommen till CartFilter',
    welcomeBack: 'Välkommen tillbaka',
    language: 'Sprak',
    currency: 'Valuta',
    importReceipt: 'Skanna eller ladda upp kvitto',
    addManually: 'Lagg till manuellt',
    hideForm: 'Dolj formularet',
    newReceipt: 'Nytt kvitto',
    importTitle: 'Lägg till ett kvitto',
    importDescription: 'Välj ett tydligt foto av kvittot.',
    chooseImage: 'Välj kvittofil',
    takePhoto: 'Ta foto',
    imageHint: 'Använd kameran eller välj ett foto. Högst 10 MB.',
    fileHint: 'JPG, PNG, WebP, HEIC, BMP, GIF, AVIF eller PDF. Högst 10 MB.',
    analyzeImage: 'Kontrollera kvitto',
    analyzingImage: 'Kontrollerar kvitto',
    imageReady: 'Fotot är klart',
    imageTypeError: 'Välj en bild eller PDF i ett format som stöds.',
    imageSizeError: 'Originalbilden maste vara mindre an 10 MB.',
    imageProcessingError: 'Bilden kunde inte analyseras. Prova ett tydligare foto med bra ljus.',
    noImageSelected: 'Valj en kvittobild forst.',
    imageQualityWarning: 'Bilden kan vara svår att läsa. Prova ett tydligare foto eller fortsätt och redigera resultatet.',
    chooseAnotherPhoto: 'Välj ett annat foto',
    continueAnyway: 'Fortsätt ändå',
    manualReviewInstead: 'Fyll i manuellt',
    manualFallbackMessage: 'Kvittot kunde inte läsas säkert. Fyll i eller rätta varorna manuellt.',
    preparingFile: 'Förbereder fil...',
    pdfPageLimit: 'Endast de första 5 PDF-sidorna kontrolleras.',
    receiptLanguage: 'Kvitto-språk',
    automaticLanguage: 'Automatiskt',
    swedishLanguage: 'Svenska',
    englishLanguage: 'Engelska',
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
    parsedFromOcr: 'Läst från kvittofoto',
    manualEntry: 'Manuell inmatning',
    totalSpent: 'Totalt spenderat',
    weeklyBudget: 'Veckobudget',
    budgetInSek: 'Budget i SEK',
    spentThisWeek: 'Spenderat denna vecka',
    remainingThisWeek: 'Kvar',
    overBudget: 'Du har overskridit din veckobudget.',
    budgetNotSet: 'Sätt en veckobudget för att börja följa den.',
    budgetOnTrack: 'Veckans utgifter följer planen.',
    budgetGettingClose: 'Du närmar dig veckans gräns.',
    budgetLimitReached: 'Du har använt hela veckobudgeten.',
    budgetFarOver: 'Du ligger tydligt över veckobudgeten.',
    shoppingFrequency: 'Inköpsfrekvens',
    shoppingDays: 'Inköpsdagar',
    shoppingDaysUsed: 'inköpsdagar använda',
    maximumShoppingDays: 'Maximalt antal inköpsdagar per vecka',
    storesVisited: 'Besökta butiker',
    shoppingDayLeft: 'Du har en inköpsdag kvar.',
    shoppingDaysOnTrack: 'Planen för inköpsdagar följs.',
    shoppingDayLimitReached: 'Veckans plan är uppnådd.',
    shoppingDayLimitExceeded: 'En extra inköpsdag den här veckan.',
    shoppingDayLimitFarExceeded: 'Du ligger två eller fler dagar över planen.',
    receiptDateNotDetected: 'Kvittodatum kunde inte hittas. Bekräfta datumet.',
    confirmDate: 'Bekräfta datum',
    receipts: 'Kvitton',
    items: 'varor',
    spendingByCategory: 'Utgifter per kategori',
    largestShare: 'Störst andel',
    recentReceipts: 'Senaste kvitton',
    homeFeatures: 'Din shoppingöversikt',
    home: 'Hem',
    budget: 'Budget',
    shoppingDaysNav: 'Inköpsdagar',
    advancedDetails: 'Avancerade detaljer',
    back: 'Tillbaka',
    next: 'Nästa',
    step: 'Steg',
    uploadStep: 'Lägg till kvitto',
    detailsStep: 'Kontrollera detaljer',
    categoriesStep: 'Kontrollera kategorier',
    saveStep: 'Spara kvitto',
    receiptAnalysis: 'Analysera kvitto',
    receiptAnalysisHint: 'Skanna ett kvitto och förstå dina utgifter.',
    budgetPlanning: 'Veckobudget',
    budgetPlanningHint: 'Sätt en gräns och följ vad som är kvar.',
    shoppingDaysFeature: 'Inköpsdagar',
    shoppingDaysFeatureHint: 'Planera färre besök i mataffären.',
    shoppingListFeature: 'Inköpslista',
    shoppingListFeatureHint: 'Planera vad du ska köpa innan du går.',
    showMoreReceipts: 'Visa fler',
    showLessReceipts: 'Visa färre',
    receiptDetails: 'Visa kvittodetaljer',
    noReceipts: 'Inga kvitton annu',
    noReceiptsHint: 'Skanna ditt första kvitto för att börja följa matkostnader.',
    receiptHeroHint: 'Skanna ett kvitto och se vart pengarna går.',
    exchangeRateNote: 'Klar för SEK, EUR och USD.',
    parseSuccess: 'Kvittot är klart. Kontrollera detaljerna.',
    parseError: 'Ingen användbar kvittodata hittades. Prova ett tydligare foto eller fyll i uppgifterna manuellt.',
    groceryFocus: 'Matvarukategorier',
    detectedLines: 'Hittade kvittorader',
    product: 'Vara',
    discount: 'Rabatt',
    deposit: 'Pant',
    'deposit-return': 'Pantretur',
    reconciliation: 'Omatchat kvittobelopp',
    receiptMismatch: 'kunde inte kopplas till en vara. Granska de hittade raderna.',
    itemsDifferFromTotal: 'Varorna skiljer sig från kvittots total med',
    printedTotal: 'Kvitto totalt',
    itemSum: 'Summa varor',
    reviewItems: 'Granska varor',
    useReceiptTotal: 'Använd kvittots total',
    resolveMismatchBeforeSaving: 'Granska skillnaden innan du sparar.',
    receiptTotalAdjustment: 'Justering till kvittots total',
    grossPurchases: 'Varor före pantretur',
    depositReturnCredit: 'Pantretur',
    amountPaid: 'Betalat',
    needsReview: 'Behover granskas',
    checkThisItem: 'Kontrollera varan',
    confirmItem: 'Ser rätt ut',
    itemName: 'Varunamn',
    quantity: 'Antal',
    unitPrice: 'Styckpris',
    lineTotal: 'Radbelopp',
    addMissingItem: 'Lägg till saknad vara',
    removeLine: 'Ta bort vara',
    manualReviewReceipt: 'Kvittot kan behöva granskas manuellt.',
    shoppingList: 'Inkopslista',
    shoppingListHint: 'Lägg till det du planerar att köpa.',
    weeklyBasics: 'Lagg till veckans basvaror',
    proteinAndProduce: 'Lagg till protein och gronsaker',
    learnedSuggestions: 'Förslag från dina kvitton',
    learnedSuggestionsHint: 'Forslag visas nar du har sparat kvitton med identifierade varurader.',
    addItem: 'Lägg till',
    itemCategory: 'Kategori',
    itemPlaceholder: 'Mjolk, tomater, ris...',
    removeItem: 'Ta bort',
    clearCompleted: 'Ta bort avklarade',
    emptyShoppingList: 'Din inkopslista ar tom.',
    estimatedPrice: 'Beräknat pris',
    itemsToBuy: 'kvar att köpa',
    scrollForMore: 'Rulla för fler',
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

// Maps shopping-day usage to a calm, progressively stronger status.
export const getShoppingDaysStatus = (usedDays, plannedDays) => {
  const used = Math.max(0, Number(usedDays) || 0);
  const limit = Math.max(0, Number(plannedDays) || 0);
  if (limit === 0) return { key: 'not-set', tone: 'neutral', remaining: 0 };

  const remaining = limit - used;
  if (remaining > 1) return { key: 'on-track', tone: 'on-track', remaining };
  if (remaining === 1) return { key: 'getting-close', tone: 'close', remaining };
  if (remaining === 0) return { key: 'reached', tone: 'reached', remaining };
  if (remaining === -1) return { key: 'over', tone: 'over', remaining };
  return { key: 'significantly-over', tone: 'critical', remaining };
};

// Maps weekly spending to status thresholds while handling an unset budget safely.
export const getWeeklyBudgetStatus = (spentSek, budgetSek) => {
  const spent = Math.max(0, Number(spentSek) || 0);
  const budget = Math.max(0, Number(budgetSek) || 0);
  if (budget === 0) return { key: 'not-set', tone: 'neutral', ratio: 0 };

  const ratio = spent / budget;
  if (ratio < 0.8) return { key: 'on-track', tone: 'on-track', ratio };
  if (ratio < 1) return { key: 'getting-close', tone: 'close', ratio };
  if (Math.abs(spent - budget) < 0.005) {
    return { key: 'reached', tone: 'reached', ratio: 1 };
  }
  if (ratio < 1.2) return { key: 'over', tone: 'over', ratio };
  return { key: 'significantly-over', tone: 'critical', ratio };
};

const CATEGORY_RULES = [
  { key: 'alcohol', score: 12, pattern: /\b(beer|wine|cider|ale|lager|ol|öl|vin|brau|bräu|champagne|chablis)\b/i },
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

const RECEIPT_TOTAL_LABEL_PATTERN = /^(?:total\s+ttc|net\s+ttc(?:\s+eur)?|a\s+payer|montant\s+total|att\s+betala|totalbelopp|amount\s+due|kopbelopp|totalt|summa|total)\b/i;
const RECEIPT_NON_PRODUCT_PATTERN = /^(?:tva|vat|h\.?\s*t\.?|tax|moms|total\s+ht|subtotal|sous[-\s]?total|card|carte|cash|especes|change|rendu|monnaie|mastercard|visa|payment|paiement)\b/i;
const RECEIPT_AMOUNT_END_PATTERN = /(-?\d+[.,]\d{2})(?:\s*(?:sek|kr|eur|usd|€|\$))?(?:\s*[a-c])?$/i;

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

// Creates one editable product row for manual receipt recovery.
const createEmptyReceiptLine = () => ({
  name: '',
  originalName: '',
  quantity: 1,
  unitPrice: 0,
  amount: 0,
  categoryKey: 'other',
  type: 'product',
  linkedTo: null,
  productKey: '',
  confidence: 'needs-review'
});

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
  if (/eur|€/i.test(text)) return 'EUR';
  if (/usd|\$/i.test(text)) return 'USD';
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

// Identifies a printed receipt total without confusing subtotals or tax totals for it.
const isPrintedTotalLine = (line) => {
  const normalized = normalizeForMatching(line).trim();
  return RECEIPT_TOTAL_LABEL_PATTERN.test(normalized)
    && !/^total\s+ht\b/i.test(normalized)
    && RECEIPT_AMOUNT_END_PATTERN.test(line);
};

// Filters tax, payment, and subtotal rows before product parsing.
const isNonProductFinancialLine = (line) => (
  RECEIPT_NON_PRODUCT_PATTERN.test(normalizeForMatching(line).trim())
);

// Flags structures that are valid receipts but outside CartFilter's grocery-first scope.
const looksLikeUnsupportedReceipt = (text) => (
  /\b(table|couverts?|restaurant|bistrot|merci de votre visite|facture)\b/i.test(
    normalizeForMatching(text)
  )
);

// Warns when an image is unlikely to contain enough pixels for reliable receipt OCR.
export const isLowResolutionReceiptImage = (width, height) => {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(height) || 0);
  return safeWidth < MIN_RECEIPT_IMAGE_WIDTH
    || safeHeight < MIN_RECEIPT_IMAGE_HEIGHT
    || safeWidth * safeHeight < MIN_RECEIPT_IMAGE_PIXELS;
};

// Uses a conservative edge check to warn about very blurry images without blocking them.
export const isLikelyBlurryReceiptImageData = (pixels, width, height) => {
  if (!pixels || width < 3 || height < 3) return false;
  let edgeTotal = 0;
  let sampleCount = 0;
  const grayAt = (x, y) => {
    const offset = (y * width + x) * 4;
    return (
      pixels[offset] * 0.299
      + pixels[offset + 1] * 0.587
      + pixels[offset + 2] * 0.114
    );
  };

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const center = grayAt(x, y);
      const laplacian = Math.abs(
        (4 * center)
        - grayAt(x - 1, y)
        - grayAt(x + 1, y)
        - grayAt(x, y - 1)
        - grayAt(x, y + 1)
      );
      edgeTotal += laplacian;
      sampleCount += 1;
    }
  }

  return sampleCount > 0 && edgeTotal / sampleCount < 6;
};

// Maps supported receipt files to the preparation path they require.
export const getReceiptFileKind = (file) => {
  const type = String(file?.type || '').toLowerCase();
  const extension = String(file?.name || '').toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
  if (type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (
    ['image/heic', 'image/heif'].includes(type)
    || ['heic', 'heif'].includes(extension)
  ) return 'heic';
  if (
    STANDARD_IMAGE_TYPES.has(type)
    || ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif'].includes(extension)
  ) return 'image';
  return 'unsupported';
};

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

// Keeps native select behavior while giving every dropdown one consistent icon.
const StyledSelect = ({
  children,
  className = '',
  wrapperClassName = '',
  ...selectProps
}) => (
  <span className={`select-control ${wrapperClassName}`.trim()}>
    <select className={className} {...selectProps}>
      {children}
    </select>
    <ChevronDown className="select-control-icon" aria-hidden="true" />
  </span>
);

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
    const analysisScale = Math.min(1, 420 / Math.max(width, height));
    const analysisWidth = Math.max(3, Math.round(width * analysisScale));
    const analysisHeight = Math.max(3, Math.round(height * analysisScale));
    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = analysisWidth;
    analysisCanvas.height = analysisHeight;
    const analysisContext = analysisCanvas.getContext('2d');
    analysisContext?.drawImage(image, 0, 0, analysisWidth, analysisHeight);
    const looksBlurry = analysisContext
      ? isLikelyBlurryReceiptImageData(
        analysisContext.getImageData(0, 0, analysisWidth, analysisHeight).data,
        analysisWidth,
        analysisHeight
      )
      : false;
    URL.revokeObjectURL(objectUrl);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image compression failed'));
          return;
        }

        const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';
        resolve({
          file: new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }),
          originalWidth: image.naturalWidth,
          originalHeight: image.naturalHeight,
          looksBlurry
        });
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

// Converts a canvas page into the JPEG format used by OCR and Storage.
const canvasToReceiptFile = (canvas, fileName) => new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        reject(new Error('Receipt page conversion failed'));
        return;
      }
      resolve(new File([blob], fileName, { type: 'image/jpeg' }));
    },
    'image/jpeg',
    0.9
  );
});

// Checks a rendered PDF page for very low visual detail.
const isCanvasLikelyBlurry = (canvas) => {
  const context = canvas.getContext('2d');
  if (!context) return false;
  const scale = Math.min(1, 420 / Math.max(canvas.width, canvas.height));
  const width = Math.max(3, Math.round(canvas.width * scale));
  const height = Math.max(3, Math.round(canvas.height * scale));
  const analysisCanvas = document.createElement('canvas');
  analysisCanvas.width = width;
  analysisCanvas.height = height;
  const analysisContext = analysisCanvas.getContext('2d');
  if (!analysisContext) return false;
  analysisContext.drawImage(canvas, 0, 0, width, height);
  return isLikelyBlurryReceiptImageData(
    analysisContext.getImageData(0, 0, width, height).data,
    width,
    height
  );
};

// Renders up to five PDF pages into local images for Tesseract.
const renderPdfReceipt = async (file) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
  await import('pdfjs-dist/legacy/build/pdf.worker.entry');
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const ocrFiles = [];
  let qualityWarning = false;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const renderScale = Math.min(
      2.5,
      MAX_COMPRESSED_IMAGE_EDGE / Math.max(baseViewport.width, baseViewport.height)
    );
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PDF canvas is not available');
    await page.render({ canvasContext: context, viewport }).promise;
    qualityWarning = qualityWarning
      || isLowResolutionReceiptImage(canvas.width, canvas.height)
      || isCanvasLikelyBlurry(canvas);
    ocrFiles.push(await canvasToReceiptFile(
      canvas,
      `${file.name.replace(/\.pdf$/i, '') || 'receipt'}-page-${pageNumber}.jpg`
    ));
  }

  return {
    uploadFile: ocrFiles[0],
    ocrFiles,
    previewFile: ocrFiles[0],
    qualityWarning,
    pageLimitReached: pdf.numPages > MAX_PDF_PAGES
  };
};

// Converts HEIC/HEIF photos locally before applying normal image compression.
const convertHeicReceipt = async (file) => {
  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.9
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File(
    [blob],
    `${file.name.replace(/\.(heic|heif)$/i, '') || 'receipt'}.jpg`,
    { type: 'image/jpeg' }
  );
};

// Prepares every supported file type for the same OCR pipeline.
const prepareReceiptFile = async (file) => {
  const kind = getReceiptFileKind(file);
  if (kind === 'unsupported') throw new Error('Unsupported receipt file');
  if (kind === 'pdf') return renderPdfReceipt(file);

  const imageFile = kind === 'heic' ? await convertHeicReceipt(file) : file;
  const preparedImage = await compressReceiptImage(imageFile);
  return {
    uploadFile: preparedImage.file,
    ocrFiles: [preparedImage.file],
    previewFile: preparedImage.file,
    qualityWarning: isLowResolutionReceiptImage(
      preparedImage.originalWidth,
      preparedImage.originalHeight
    ) || preparedImage.looksBlurry,
    pageLimitReached: false
  };
};

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
const refreshReceiptCategories = (
  receipt,
  categoryMappings = {},
  productAliases = {}
) => {
  if (receipt.rawText && !receipt.lineItems?.length) {
    const reparsed = parseReceiptText(
      receipt.rawText,
      receipt.date,
      categoryMappings,
      productAliases
    );
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

  const categoryForProduct = (item) => {
    const originalKey = item.productKey || normalizeProductKey(item.name);
    const alias = productAliases[originalKey];
    const aliasedName = typeof alias === 'string' ? alias : alias?.correctedName;
    return (
      (typeof alias === 'object' && alias?.categoryKey)
      || categoryMappings[normalizeProductKey(aliasedName || item.name)]
      || categoryMappings[originalKey]
      || pickCategoryKey(aliasedName || item.name)
    );
  };
  const lineItems = receipt.lineItems.map((item) => {
    if (item.confidence === 'user' || item.confidence === 'remembered') return item;
    if (item.type === 'discount' && item.linkedTo) {
      const linkedProduct = receipt.lineItems.find((candidate) => candidate.name === item.linkedTo);
      return linkedProduct
        ? { ...item, categoryKey: categoryForProduct(linkedProduct) }
        : item;
    }
    const categoryKey = categoryForProduct(item);
    const alias = productAliases[item.productKey || normalizeProductKey(item.name)];
    const aliasedName = item.type === 'product'
      ? (typeof alias === 'string' ? alias : alias?.correctedName)
      : '';
    return {
      ...item,
      ...(aliasedName
        ? {
          name: aliasedName,
          originalName: item.originalName || item.name,
          productKey: normalizeProductKey(aliasedName)
        }
        : {}),
      categoryKey,
      confidence: aliasedName
        ? 'remembered'
        : (categoryKey === 'other' ? 'needs-review' : 'rule')
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
    || /^(tel|org\.?\s*nr|siret|kvitto|receipt|facture|date|qte|quantite|designation|px\s+unit)\b/.test(normalized)
    || /^\d{1,2}:\d{2}/.test(line);
};

// Parses OCR text into merchant, products, categories, discounts, and totals.
const parseReceiptText = (
  text,
  fallbackDate,
  categoryMappings = {},
  productAliases = {}
) => {
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
  const totalLine = lines.find(isPrintedTotalLine);
  const totalAmountMatch = totalLine?.match(RECEIPT_AMOUNT_END_PATTERN);
  let detectedTotal = totalAmountMatch ? sanitizeNumber(totalAmountMatch[1]) : 0;
  const organizationLineIndex = lines.findIndex((line) => /org\.?\s*nr|siret/i.test(line));
  const itemSectionStart = organizationLineIndex >= 0 ? organizationLineIndex + 1 : 0;
  const relativeItemSectionEnd = lines
    .slice(itemSectionStart)
    .findIndex((line) => (
      /totalt?\s+\d+\s+varor/i.test(line)
      || isPrintedTotalLine(line)
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
    if (isPrintedTotalLine(line)) {
      const printedAmount = line.match(RECEIPT_AMOUNT_END_PATTERN);
      detectedTotal = sanitizeNumber(printedAmount?.[1]);
      pendingLabel = '';
      continue;
    }
    if (isNonProductFinancialLine(line)) {
      pendingLabel = '';
      continue;
    }

    const quantityDetailMatch = line.match(
      /^(\d+(?:[.,]\d+)?)\s*(?:(?:each|st|pcs?)\s*)?[*x×]\s*(?:sek|kr)?\s*(\d+[.,]\d{2})(?:\s*(?:sek|kr))?(?:\s*\/\s*(?:each|st|pcs?))?$/i
    );
    if (quantityDetailMatch && lastProduct) {
      lastProduct.quantity = sanitizeNumber(quantityDetailMatch[1]);
      lastProduct.unitPrice = sanitizeNumber(quantityDetailMatch[2]);
      continue;
    }

    const columnItemMatch = line.match(
      /^(\d+(?:[.,]\d+)?)\s+(.+?)\s+(-?\d+[.,]\d{2})\s+(?:[x×*—–-]\s*)?(-?\d+[.,]\d{2})(?:\s+[a-z]{1,3})?$/i
    );

    // Lidl appends a VAT code (for example "B") after each product price.
    const amountMatch = columnItemMatch || line.match(
      /(-?\d+[.,]\d{2})(?:\s*(sek|kr|eur|usd|€|\$))?(?:\s+[a-z]{1,3}|\s*(?:\[[^\]]*\]|[~=_|5]))*$/i
    );
    if (!amountMatch) {
      if (!isReceiptMetadata(line)) pendingLabel = line;
      continue;
    }

    const amount = sanitizeNumber(columnItemMatch ? columnItemMatch[4] : amountMatch[1]);

    const weightDetailMatch = line.match(
      /^(\d+(?:[.,]\d+)?)\s*kg\s*\*\s*(\d+[.,]\d{2})\s*kr\/kg\s*\d+[.,]\d{2}$/i
    );
    const inlineLabel = columnItemMatch
      ? columnItemMatch[2].trim()
      : line.slice(0, amountMatch.index).trim();
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
      || /\b(rabatt|discount|remise|reduction|prisnedsattning|prisnedsatt|nedsattning|prisavdrag)\b|willys\s*plus\s*:/i.test(normalizedLabel)
    );
    const isDeposit = /(?:^|\s|\+)pant(?:\s|$)/i.test(normalizedLabel);
    const inlineQuantityMatch = inlineLabel.match(
      /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:(?:each|st|pcs?)\s*)?[*x+×]\s*(?:sek|kr)?\s*(\d+[.,]\d{2})/i
    );
    const originalProductKey = normalizeProductKey(label);
    const rememberedAlias = productAliases[originalProductKey];
    const correctedName = typeof rememberedAlias === 'string'
      ? rememberedAlias
      : rememberedAlias?.correctedName;
    const displayName = !isDiscount && !isDeposit && !isDepositReturn && correctedName
      ? correctedName
      : label;
    const directCategory = pickCategoryKey(displayName);
    const productKey = normalizeProductKey(displayName);
    const rememberedCategory = (
      (typeof rememberedAlias === 'object' && rememberedAlias?.categoryKey)
      || categoryMappings[productKey]
      || categoryMappings[originalProductKey]
    );
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
      name: displayName,
      originalName: label,
      amount,
      categoryKey,
      type: isDepositReturn
        ? 'deposit-return'
        : (isDeposit ? 'deposit' : (isDiscount ? 'discount' : 'product')),
      linkedTo: (isDiscount || isDeposit) ? linkedProduct?.name || null : null,
      productKey,
      ...((columnItemMatch || inlineQuantityMatch || weightDetailMatch) && !isDiscount && !isDeposit
        ? {
          quantity: sanitizeNumber(
            columnItemMatch?.[1] || (inlineQuantityMatch || weightDetailMatch)[1]
          ),
          unitPrice: sanitizeNumber(
            columnItemMatch?.[3] || (inlineQuantityMatch || weightDetailMatch)[2]
          )
        }
        : {}),
      confidence: rememberedCategory || correctedName
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

  const items = groupLineItems(itemLines);

  const total = roundMoney(
    detectedTotal || parsedItemsTotal
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
    unmatchedAmount,
    printedTotalDetected: Boolean(totalAmountMatch),
    requiresManualReview: looksLikeUnsupportedReceipt(trimmed)
  };
};

// Renders the CartFilter application and coordinates its data and actions.
const CartFilter = () => {
  const [user, setUser] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [visibleReceiptCount, setVisibleReceiptCount] = useState(1);
  const [activeModule, setActiveModule] = useState('home');
  const [receiptStep, setReceiptStep] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [language, setLanguage] = useState('en');
  const [displayCurrency, setDisplayCurrency] = useState('SEK');
  const [ocrText, setOcrText] = useState('');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptOcrImages, setReceiptOcrImages] = useState([]);
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
  const [productAliases, setProductAliases] = useState({});
  const [receiptLanguage, setReceiptLanguage] = useState('auto');
  const [weeklyBudgetSek, setWeeklyBudgetSek] = useState(800);
  const [weeklyBudgetOwner, setWeeklyBudgetOwner] = useState('');
  const [weeklyShoppingDayLimit, setWeeklyShoppingDayLimit] = useState(3);
  const [weeklyShoppingDayOwner, setWeeklyShoppingDayOwner] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOwner, setSettingsOwner] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const accountMenuRef = useRef(null);
  const accountTriggerRef = useRef(null);
  const profileDialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const receiptLineReviewRef = useRef(null);

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
    unmatchedAmount: 0,
    printedTotalDetected: false,
    requiresManualReview: false
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
      setReceiptLanguage(
        SUPPORTED_RECEIPT_LANGUAGES.has(parsed.receiptLanguage)
          ? parsed.receiptLanguage
          : 'auto'
      );
    } catch (error) {
      console.error('Failed to restore CartFilter state', error);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ language, displayCurrency, receiptLanguage })
    );
  }, [language, displayCurrency, receiptLanguage]);

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
      setPreferredName('');
      setAccountMenuOpen(false);
      setNameEditorOpen(false);
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

    const storedName = window.localStorage
      .getItem(`cartfilter-preferred-name-${user.uid}`)
      ?.trim();
    setPreferredName(storedName || user.displayName?.trim() || '');
  }, [user]);

  // Loads budget, shopping frequency, and shopping list settings from Firestore.
  useEffect(() => {
    if (!user) return undefined;

    const settingsRef = doc(db, 'users', user.uid, 'settings', 'preferences');
    return onSnapshot(
      settingsRef,
      (snapshot) => {
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
          if (typeof settings.preferredName === 'string' && settings.preferredName.trim()) {
            const savedName = settings.preferredName.trim();
            setPreferredName(savedName);
            window.localStorage.setItem(
              `cartfilter-preferred-name-${user.uid}`,
              savedName
            );
          }
        }
        setSettingsOwner(user.uid);
        setSettingsLoaded(true);
      },
      (error) => {
        console.error('Failed to load CartFilter settings', error);
        setSettingsOwner(user.uid);
        setSettingsLoaded(true);
      }
    );
  }, [user]);

  // Saves synchronized settings so the user can restore them on another device.
  useEffect(() => {
    if (!user || !settingsLoaded || settingsOwner !== user.uid) return;
    Promise.resolve(setDoc(doc(db, 'users', user.uid, 'settings', 'preferences'), {
      weeklyBudgetSek: Number(weeklyBudgetSek) || 0,
      weeklyShoppingDayLimit: Number(weeklyShoppingDayLimit) || 1,
      shoppingList,
      preferredName: preferredName.trim(),
      updatedAt: serverTimestamp()
    }, { merge: true })).catch((error) => {
      console.error('Failed to save CartFilter settings', error);
    });
  }, [
    preferredName,
    shoppingList,
    weeklyBudgetSek,
    weeklyShoppingDayLimit,
    settingsLoaded,
    settingsOwner,
    user
  ]);

  useEffect(() => {
    if (!user || !preferredName.trim()) return;
    window.localStorage.setItem(
      `cartfilter-preferred-name-${user.uid}`,
      preferredName.trim()
    );
  }, [preferredName, user]);

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
    if (!accountMenuOpen) return undefined;

    const closeOnOutsidePress = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        accountTriggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!nameEditorOpen) return undefined;
    nameInputRef.current?.focus();

    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setNameEditorOpen(false);
      setNameError('');
      accountTriggerRef.current?.focus();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [nameEditorOpen]);

  useEffect(() => {
    if (!profileNotice) return undefined;
    const timeoutId = window.setTimeout(() => setProfileNotice(''), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [profileNotice]);

  useEffect(() => {
    if (!user) {
      setReceipts([]);
      setCategoryMappings({});
      setProductAliases({});
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
    if (!user) return undefined;

    return onSnapshot(
      collection(db, 'users', user.uid, 'productAliases'),
      (snapshot) => {
        setProductAliases(Object.fromEntries(
          snapshot.docs.map((aliasDoc) => {
            const alias = aliasDoc.data();
            return [alias.normalizedOriginalName, alias];
          })
        ));
      },
      (error) => {
        console.error('Failed to load learned product names', error);
      }
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setReceipts((current) => {
      const refreshed = current.map((receipt) => (
        refreshReceiptCategories(receipt, categoryMappings, productAliases)
      ));
      return JSON.stringify(refreshed) === JSON.stringify(current) ? current : refreshed;
    });
  }, [categoryMappings, productAliases, user]);

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
  const receiptLineTotal = roundMoney(
    formData.lineItems.length > 0
      ? formData.lineItems.reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0
      )
      : normalizedItems.reduce(
        (sum, item) => sum + (Number(item.amount) || 0),
        0
      )
  );
  const receiptMismatchAmount = formData.receiptTotal > 0
    ? roundMoney(formData.receiptTotal - receiptLineTotal)
    : 0;
  const hasUnresolvedReceiptMismatch = formData.lineItems.length > 0
    && formData.printedTotalDetected
    && Math.abs(receiptMismatchAmount) >= 0.01;

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
  const chartCategoryData = useMemo(() => {
    if (categoryTotalSek <= 0) return [];
    const visible = categoryData.filter((category) => category.value / categoryTotalSek >= 0.04);
    const smallValue = categoryData
      .filter((category) => category.value / categoryTotalSek < 0.04)
      .reduce((sum, category) => sum + category.value, 0);
    const groupedCategories = smallValue > 0
      ? [...visible, {
        key: 'chart-other',
        name: translatedCategoryLabel('other'),
        value: smallValue
      }]
      : visible;
    return groupedCategories
      .sort((a, b) => b.value - a.value)
      .map((category, index) => ({
        ...category,
        color: getCategoryRankColor(index),
        percentage: (category.value / categoryTotalSek) * 100
      }));
  }, [categoryData, categoryTotalSek, translatedCategoryLabel]);
  const largestChartCategory = chartCategoryData[0] || null;

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
  const weeklyBudgetValue = Number(weeklyBudgetSek) || 0;
  const weeklyRemainingSek = weeklyBudgetValue - weeklySpentSek;
  const weeklyBudgetProgress = weeklyBudgetValue > 0
    ? Math.min((weeklySpentSek / weeklyBudgetValue) * 100, 100)
    : 0;
  const weeklyShoppingDaysProgress = weeklyShoppingDayLimit > 0
    ? Math.min((weeklyShoppingDayCount / weeklyShoppingDayLimit) * 100, 100)
    : 0;
  const shoppingDaysStatus = getShoppingDaysStatus(
    weeklyShoppingDayCount,
    weeklyShoppingDayLimit
  );
  const weeklyBudgetStatus = getWeeklyBudgetStatus(
    weeklySpentSek,
    weeklyBudgetValue
  );
  const shoppingDaysStatusMessage = {
    'not-set': t('shoppingDaysOnTrack'),
    'on-track': t('shoppingDaysOnTrack'),
    'getting-close': t('shoppingDayLeft'),
    reached: t('shoppingDayLimitReached'),
    over: t('shoppingDayLimitExceeded'),
    'significantly-over': t('shoppingDayLimitFarExceeded')
  }[shoppingDaysStatus.key];
  const weeklyBudgetStatusMessage = {
    'not-set': t('budgetNotSet'),
    'on-track': t('budgetOnTrack'),
    'getting-close': t('budgetGettingClose'),
    reached: t('budgetLimitReached'),
    over: t('overBudget'),
    'significantly-over': t('budgetFarOver')
  }[weeklyBudgetStatus.key];
  const ShoppingDaysStatusIcon = shoppingDaysStatus.tone === 'neutral'
    ? CalendarDays
    : ['on-track', 'reached'].includes(shoppingDaysStatus.tone)
      ? CheckCircle2
      : AlertTriangle;
  const WeeklyBudgetStatusIcon = weeklyBudgetStatus.tone === 'neutral'
    ? CircleDollarSign
    : ['on-track', 'reached'].includes(weeklyBudgetStatus.tone)
      ? CheckCircle2
      : AlertTriangle;
  const shoppingListEstimatedTotalSek = shoppingList.reduce(
    (sum, item) => sum + (Number(item.estimatedPriceSek) || 0),
    0
  );
  const hasShoppingListEstimates = shoppingList.some(
    (item) => Number(item.estimatedPriceSek) > 0
  );
  const shoppingItemsToBuy = shoppingList.filter((item) => !item.completed).length;
  const shoppingListBudgetDifferenceSek = weeklyRemainingSek - shoppingListEstimatedTotalSek;
  const shoppingListIsWithinBudget = shoppingListEstimatedTotalSek <= weeklyRemainingSek;
  const preferredFirstName = preferredName.trim().split(/\s+/)[0] || '';
  const greetingReady = settingsLoaded && !receiptsLoading;
  const homeGreeting = `${t(receipts.length > 0 ? 'welcomeBack' : 'welcomeToCartFilter')}${
    preferredFirstName ? `, ${preferredFirstName}` : ''
  }`;

  // Rebuilds category totals and the printed-total difference after line edits.
  const updateReceiptLineItems = (current, lineItems) => {
    const itemsTotal = roundMoney(
      lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    );
    const receiptTotal = current.printedTotalDetected
      ? current.receiptTotal
      : itemsTotal;
    return {
      ...current,
      lineItems,
      items: groupLineItems(lineItems),
      receiptTotal,
      unmatchedAmount: current.printedTotalDetected
        ? roundMoney(receiptTotal - itemsTotal)
        : 0
    };
  };

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

  // Saves a corrected OCR product name for this user only.
  const rememberProductAlias = async (
    originalName,
    correctedName,
    categoryKey
  ) => {
    if (!user) return;
    const normalizedOriginalName = normalizeProductKey(originalName);
    const normalizedCorrectedName = normalizeProductKey(correctedName);
    if (
      !normalizedOriginalName
      || !normalizedCorrectedName
      || normalizedOriginalName === normalizedCorrectedName
    ) return;

    const alias = {
      normalizedOriginalName,
      originalName,
      correctedName: correctedName.trim(),
      categoryKey,
      updatedAt: serverTimestamp()
    };
    setProductAliases((current) => ({
      ...current,
      [normalizedOriginalName]: alias
    }));
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'productAliases', encodeURIComponent(normalizedOriginalName)),
        alias,
        { merge: true }
      );
    } catch (error) {
      console.error('Failed to remember corrected product name', error);
    }
  };

  // Updates an editable receipt line and recalculates dependent totals.
  const handleReceiptLineChange = (index, field, value) => {
    setFormData((current) => {
      const withoutAdjustment = current.lineItems.filter(
        (item) => item.type !== 'reconciliation'
      );
      const lineItems = withoutAdjustment.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const nextItem = {
          ...item,
          confidence: 'user'
        };
        if (field === 'name') {
          nextItem.name = value;
          nextItem.productKey = normalizeProductKey(value);
        } else {
          nextItem[field] = sanitizeNumber(value);
        }
        if (
          ['quantity', 'unitPrice'].includes(field)
          && Number(nextItem.quantity) > 0
          && Number(nextItem.unitPrice) > 0
        ) {
          nextItem.amount = roundMoney(nextItem.quantity * nextItem.unitPrice);
        }
        return nextItem;
      });
      return updateReceiptLineItems(current, lineItems);
    });
  };

  // Marks an uncertain line as reviewed without changing its values.
  const confirmReceiptLine = (index) => {
    setFormData((current) => {
      const lineItems = current.lineItems.map((item, itemIndex) => (
        itemIndex === index ? { ...item, confidence: 'user' } : item
      ));
      return updateReceiptLineItems(current, lineItems);
    });
  };

  // Adds an empty product row for something the receipt reader missed.
  const addMissingReceiptLine = () => {
    setFormData((current) => {
      const lineItems = current.lineItems
        .filter((item) => item.type !== 'reconciliation')
        .concat(createEmptyReceiptLine());
      return updateReceiptLineItems(current, lineItems);
    });
  };

  // Removes an incorrect product row and recalculates the receipt.
  const removeReceiptLine = (index) => {
    setFormData((current) => {
      const lineItems = current.lineItems
        .filter((item) => item.type !== 'reconciliation')
        .filter((item, itemIndex) => itemIndex !== index);
      return updateReceiptLineItems(current, lineItems);
    });
  };

  // Reconciles an accepted printed total as an explicit review adjustment.
  const usePrintedReceiptTotal = () => {
    setFormData((current) => {
      const lineItems = current.lineItems.filter(
        (item) => item.type !== 'reconciliation'
      );
      const itemsTotal = roundMoney(
        lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      );
      const adjustment = roundMoney(current.receiptTotal - itemsTotal);
      if (Math.abs(adjustment) >= 0.01) {
        lineItems.push({
          name: t('receiptTotalAdjustment'),
          originalName: '',
          amount: adjustment,
          categoryKey: 'other',
          type: 'reconciliation',
          linkedTo: null,
          productKey: 'receipt total adjustment',
          confidence: 'user'
        });
      }
      return updateReceiptLineItems(current, lineItems);
    });
  };

  // Returns focus to the editable rows when the user reviews a mismatch.
  const focusReceiptItems = () => {
    setReceiptStep(3);
    window.setTimeout(() => receiptLineReviewRef.current?.focus(), 0);
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
      return updateReceiptLineItems(current, lineItems);
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
      unmatchedAmount: 0,
      printedTotalDetected: false,
      requiresManualReview: false
    });
    setReceiptImage(null);
    setReceiptOcrImages([]);
    setReceiptImagePreview('');
    setImageMessage('');
    setImageStatus('idle');
    setOcrProgress(0);
    setOcrText('');
    setParseMessage('');
    setParseStatus('idle');
    setReceiptNotice('');
  };

  // Opens an editable blank receipt when OCR is unavailable or unreliable.
  const startManualReceiptReview = ({
    imageUrl = '',
    storagePath = '',
    rawText = ''
  } = {}) => {
    setFormData((current) => ({
      ...current,
      source: receiptImage ? 'ocr' : 'manual',
      imageUrl: imageUrl || current.imageUrl,
      storagePath: storagePath || current.storagePath,
      rawText,
      lineItems: [createEmptyReceiptLine()],
      items: groupLineItems([createEmptyReceiptLine()]),
      receiptTotal: 0,
      unmatchedAmount: 0,
      printedTotalDetected: false,
      requiresManualReview: true
    }));
    setParseStatus('error');
    setParseMessage(t('manualFallbackMessage'));
    setReceiptStep(2);
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
    if (hasUnresolvedReceiptMismatch) {
      setReceiptNotice(t('resolveMismatchBeforeSaving'));
      focusReceiptItems();
      return;
    }

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
      itemTotal: receiptLineTotal,
      printedTotal: formData.printedTotalDetected ? formData.receiptTotal : null,
      imageUrl: formData.imageUrl || null,
      storagePath: formData.storagePath || null,
      unmatchedAmount: receiptMismatchAmount,
      printedTotalDetected: formData.printedTotalDetected || false,
      requiresManualReview: formData.requiresManualReview || false
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
      await Promise.all(
        formData.lineItems
          .filter((item) => (
            item.type === 'product'
            && item.originalName
            && normalizeProductKey(item.originalName) !== normalizeProductKey(item.name)
          ))
          .map((item) => rememberProductAlias(
            item.originalName,
            item.name,
            item.categoryKey
          ))
      );
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
    const parsed = parseReceiptText(
      text,
      formData.date,
      categoryMappings,
      productAliases
    );

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
      unmatchedAmount: parsed.unmatchedAmount,
      printedTotalDetected: parsed.printedTotalDetected,
      requiresManualReview: parsed.requiresManualReview
    });
    setParseStatus('success');
    setParseMessage(t('parseSuccess'));
    setReceiptStep(2);
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
    if (getReceiptFileKind(file) === 'unsupported') {
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
      setImageMessage(t('preparingFile'));
      const preparedFile = await prepareReceiptFile(file);
      setReceiptImage(preparedFile.uploadFile);
      setReceiptOcrImages(preparedFile.ocrFiles);
      setReceiptImagePreview(URL.createObjectURL(preparedFile.previewFile));
      if (preparedFile.qualityWarning || preparedFile.pageLimitReached) {
        setImageStatus('quality-warning');
        setImageMessage([
          preparedFile.qualityWarning ? t('imageQualityWarning') : '',
          preparedFile.pageLimitReached ? t('pdfPageLimit') : ''
        ].filter(Boolean).join(' '));
      } else {
        setImageStatus('ready');
        setImageMessage(t('imageReady'));
      }
    } catch (error) {
      console.error('Receipt image preparation failed', error);
      setImageStatus('error');
      setImageMessage(t('imageProcessingError'));
    }
  };

  // Uploads an image, runs OCR, and parses the extracted receipt text.
  const handleAnalyzeImage = async () => {
    if (!receiptImage || receiptOcrImages.length === 0) {
      setImageStatus('error');
      setImageMessage(t('noImageSelected'));
      return;
    }

    setImageStatus('working');
    setImageMessage('');
    setOcrProgress(0);
    let worker;
    let uploadedImageUrl = '';
    let uploadedStoragePath = '';

    try {
      const safeFileName = receiptImage.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `users/${user.uid}/receipts/${Date.now()}-${safeFileName}`;
      uploadedStoragePath = storagePath;
      const imageReference = ref(storage, storagePath);
      await uploadBytes(imageReference, receiptImage, {
        contentType: receiptImage.type
      });
      const imageUrl = await getDownloadURL(imageReference);
      uploadedImageUrl = imageUrl;

      worker = await createWorker(
        OCR_LANGUAGE_CODES[receiptLanguage] || OCR_LANGUAGE_CODES.auto,
        1,
        {
        logger: (message) => {
          if (message.status === 'recognizing text') {
            setOcrProgress(Math.round((message.progress || 0) * 100));
          }
        }
        }
      );
      const extractedPages = [];
      for (let index = 0; index < receiptOcrImages.length; index += 1) {
        const result = await worker.recognize(receiptOcrImages[index]);
        extractedPages.push(result.data.text.trim());
        setOcrProgress(Math.round(((index + 1) / receiptOcrImages.length) * 100));
      }
      const extractedText = extractedPages.filter(Boolean).join('\n');

      setOcrText(extractedText);
      setFormData((current) => ({
        ...current,
        imageUrl,
        storagePath
      }));

      const parsed = parseReceiptText(
        extractedText,
        formData.date,
        categoryMappings,
        productAliases
      );
      if (!parsed) {
        startManualReceiptReview({
          imageUrl,
          storagePath,
          rawText: extractedText
        });
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
          unmatchedAmount: parsed.unmatchedAmount,
          printedTotalDetected: parsed.printedTotalDetected,
          requiresManualReview: parsed.requiresManualReview
        });
        setParseStatus('success');
        setParseMessage(t('parseSuccess'));
        setReceiptStep(2);
      }
      setImageStatus('success');
      setOcrProgress(100);
    } catch (error) {
      console.error('Receipt image OCR failed', error);
      setImageStatus('error');
      setImageMessage(t('manualFallbackMessage'));
      startManualReceiptReview({
        imageUrl: uploadedImageUrl,
        storagePath: uploadedStoragePath
      });
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
    setAccountMenuOpen(false);
    setNameEditorOpen(false);
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign-out failed', error);
    }
  };

  // Opens one focused dashboard module and returns the view to the top.
  const openModule = (moduleName) => {
    setAccountMenuOpen(false);
    setActiveModule(moduleName);
    if (process.env.NODE_ENV !== 'test') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Opens the preferred-name editor with the current saved value.
  const openNameEditor = () => {
    setNameDraft(preferredName || user?.displayName?.trim() || '');
    setNameError('');
    setAccountMenuOpen(false);
    setNameEditorOpen(true);
  };

  // Closes the preferred-name editor and restores focus to the account button.
  const closeNameEditor = () => {
    setNameEditorOpen(false);
    setNameError('');
    window.setTimeout(() => accountTriggerRef.current?.focus(), 0);
  };

  // Saves a trimmed preferred name locally and through the existing settings sync.
  const handleSavePreferredName = (event) => {
    event.preventDefault();
    const nextName = nameDraft.trim();
    if (!nextName) {
      setNameError(t('nameRequired'));
      nameInputRef.current?.focus();
      return;
    }

    setPreferredName(nextName);
    setProfileNotice(t('nameSaved'));
    setNameEditorOpen(false);
    setNameError('');
    window.setTimeout(() => accountTriggerRef.current?.focus(), 0);
  };

  // Keeps keyboard focus inside the small account editor dialog.
  const handleProfileDialogKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...(profileDialogRef.current?.querySelectorAll(
      'input, button:not(:disabled)'
    ) || [])];
    if (controls.length === 0) return;
    const firstControl = controls[0];
    const lastControl = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === firstControl) {
      event.preventDefault();
      lastControl.focus();
    } else if (!event.shiftKey && document.activeElement === lastControl) {
      event.preventDefault();
      firstControl.focus();
    }
  };

  const accountDisplayName = preferredFirstName || t('account');
  const accountInitial = (preferredName || user?.displayName || '').trim().charAt(0).toUpperCase();

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
          <p className="text-sm font-semibold text-amber-700 mb-3">{t('appName')}</p>
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
      <header className="app-header">
        <div className="app-header-shell">
          <div className="brand-lockup">
            <img
              src={cartFilterLogo}
              alt=""
              aria-hidden="true"
              className="brand-logo"
            />
            <h1>{t('appName')}</h1>
          </div>

          <div className="account-menu-shell" ref={accountMenuRef}>
            <button
              type="button"
              ref={accountTriggerRef}
              className="account-trigger"
              onClick={() => setAccountMenuOpen((current) => !current)}
              aria-expanded={accountMenuOpen}
              aria-controls="account-popover"
              aria-label={`${t('account')}: ${accountDisplayName}`}
            >
              <span className="account-avatar" aria-hidden="true">
                {accountInitial || <UserRound />}
              </span>
              <span className="account-trigger-name">{accountDisplayName}</span>
              <ChevronDown className="account-trigger-chevron" aria-hidden="true" />
            </button>

            {accountMenuOpen && (
              <div
                id="account-popover"
                className="account-popover"
                role="dialog"
                aria-label={t('account')}
              >
                <div className="account-popover-heading">
                  <div>
                    <span>{t('account')}</span>
                    <strong>{preferredName || accountDisplayName}</strong>
                  </div>
                  <button type="button" onClick={openNameEditor} className="account-edit-name">
                    <Pencil aria-hidden="true" />
                    {t('editName')}
                  </button>
                </div>

                {user.email && (
                  <div className="account-email">
                    <Mail aria-hidden="true" />
                    <span>
                      <small>{t('accountEmail')}</small>
                      <strong>{user.email}</strong>
                    </span>
                  </div>
                )}

                <div className="account-preferences">
                  <label>
                    <span><Globe2 aria-hidden="true" />{t('language')}</span>
                    <StyledSelect
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      wrapperClassName="account-select"
                    >
                      <option value="en">English</option>
                      <option value="sv">Svenska</option>
                    </StyledSelect>
                  </label>

                  <label>
                    <span><Coins aria-hidden="true" />{t('currency')}</span>
                    <StyledSelect
                      value={displayCurrency}
                      onChange={(event) => setDisplayCurrency(event.target.value)}
                      wrapperClassName="account-select"
                    >
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </StyledSelect>
                  </label>
                </div>

                <button type="button" onClick={handleSignOut} className="account-sign-out">
                  <LogOut aria-hidden="true" />
                  {t('signOut')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {nameEditorOpen && (
        <div
          className="profile-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeNameEditor();
          }}
        >
          <section
            ref={profileDialogRef}
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preferred-name-title"
            onKeyDown={handleProfileDialogKeyDown}
          >
            <div className="profile-modal-heading">
              <div>
                <h2 id="preferred-name-title">{t('preferredName')}</h2>
                <p>{t('preferredNameHint')}</p>
              </div>
              <button type="button" onClick={closeNameEditor} aria-label={t('cancel')}>
                <X aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSavePreferredName}>
              <label htmlFor="preferred-name-input">{t('preferredName')}</label>
              <input
                ref={nameInputRef}
                id="preferred-name-input"
                type="text"
                value={nameDraft}
                maxLength="60"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'preferred-name-error' : undefined}
                onChange={(event) => {
                  setNameDraft(event.target.value);
                  if (nameError) setNameError('');
                }}
              />
              {nameError && (
                <p id="preferred-name-error" role="alert" className="profile-name-error">
                  {nameError}
                </p>
              )}
              <div className="profile-modal-actions">
                <button type="button" onClick={closeNameEditor}>{t('cancel')}</button>
                <button type="submit" className="profile-save-name">{t('save')}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {profileNotice && (
        <div className="profile-toast" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          {profileNotice}
        </div>
      )}

      <nav className="module-nav" aria-label={t('homeFeatures')}>
        {[
          ['home', t('home'), Home],
          ['receipts', t('receipts'), ReceiptText],
          ['budget', t('budget'), Wallet],
          ['days', t('shoppingDaysNav'), CalendarDays],
          ['list', t('shoppingList'), ListChecks]
        ].map(([moduleName, label, Icon]) => (
          <button
            key={moduleName}
            type="button"
            className={activeModule === moduleName ? 'is-active' : ''}
            onClick={() => openModule(moduleName)}
            aria-current={activeModule === moduleName ? 'page' : undefined}
          >
            <Icon className="module-nav-icon" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main className="max-w-5xl mx-auto p-4 pb-20">
        {receiptError && (
          <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {receiptError}
          </p>
        )}
        {receiptsLoading && (
          <p className="mb-4 text-sm text-stone-500">{t('loadingReceipts')}</p>
        )}
        {activeModule === 'home' && (
          <>
        <section id="receipt-analysis" className="grid gap-4 md:grid-cols-[1.3fr_0.7fr] mb-6">
          <div className="rounded-3xl bg-stone-900 text-white p-6 shadow-xl">
            <h2 className="text-3xl font-bold mb-3" aria-live="polite" aria-busy={!greetingReady}>
              {greetingReady ? homeGreeting : (
                <span className="greeting-placeholder" aria-hidden="true">CartFilter</span>
              )}
            </h2>
            <p className="text-stone-200 max-w-xl">{t('receiptHeroHint')}</p>
          </div>

          <div className="rounded-3xl bg-white border border-amber-100 p-6 shadow-md">
            <p className="text-sm text-stone-500 mb-2">{t('exchangeRateNote')}</p>
            <button
              onClick={() => {
                setShowForm(true);
                setReceiptStep(1);
                openModule('receipts');
              }}
              className="home-import-action w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-full transition"
            >
              <Camera aria-hidden="true" />
              {t('importReceipt')}
            </button>
          </div>
        </section>

        <section className="home-feature-section" aria-label={t('homeFeatures')}>
          <div className="home-feature-heading">
            <p className="home-eyebrow">CartFilter</p>
            <h2 className="text-xl font-bold text-stone-900">{t('homeFeatures')}</h2>
          </div>
          <div className="home-feature-grid">
            {[
              ['receipts', 'receiptAnalysis', 'receiptAnalysisHint', ReceiptText],
              ['budget', 'budgetPlanning', 'budgetPlanningHint', Wallet],
              ['days', 'shoppingDaysFeature', 'shoppingDaysFeatureHint', CalendarDays],
              ['list', 'shoppingListFeature', 'shoppingListFeatureHint', ListChecks]
            ].map(([moduleName, titleKey, hintKey, Icon]) => (
              <button
                key={moduleName}
                type="button"
                className="home-feature-card"
                onClick={() => {
                  if (moduleName === 'receipts') {
                    setShowForm(true);
                    setReceiptStep(1);
                  }
                  openModule(moduleName);
                }}
              >
                <span className={`feature-icon feature-icon-${moduleName}`} aria-hidden="true">
                  <Icon />
                </span>
                <span className="home-feature-copy">
                  <strong>{t(titleKey)}</strong>
                  <small>{t(hintKey)}</small>
                </span>
                <ArrowRight className="home-feature-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
          </>
        )}

        {activeModule === 'receipts' && !showForm && (
          <section className="module-heading">
            <div>
              <button type="button" className="module-back" onClick={() => openModule('home')}>
                <ArrowLeft aria-hidden="true" />
                {t('home')}
              </button>
              <h2>{t('receiptAnalysis')}</h2>
              <p>{t('receiptAnalysisHint')}</p>
            </div>
            <button
              type="button"
              className="module-primary-action"
              onClick={() => {
                setReceiptStep(1);
                setShowForm(true);
              }}
            >
              <Camera aria-hidden="true" />
              {t('importReceipt')}
            </button>
          </section>
        )}

        {activeModule === 'days' && (
        <section id="shopping-days" className="module-panel mb-6 rounded-3xl border border-amber-100 bg-white p-6 shadow-md">
          <button type="button" className="module-back mb-4" onClick={() => openModule('home')}>
            <ArrowLeft aria-hidden="true" />
            {t('home')}
          </button>
          <div className="module-title-row">
            <div className="module-title-with-icon">
              <span aria-hidden="true"><CalendarDays /></span>
              <div>
                <h2 className="text-xl font-bold text-stone-900">{t('shoppingFrequency')}</h2>
                <p className="shopping-days-count mt-1 text-stone-900">
                  <strong className={`status-value status-${shoppingDaysStatus.tone}`}>
                    {weeklyShoppingDayCount}
                  </strong>{' '}
                  {language === 'sv' ? 'av' : 'of'}{' '}
                  <strong>{weeklyShoppingDayLimit}</strong> {t('shoppingDaysUsed')}
                </p>
              </div>
            </div>
            <label className="module-edit-control text-sm font-medium text-stone-700">
              {t('maximumShoppingDays')}
              <StyledSelect
                value={weeklyShoppingDayLimit}
                onChange={(event) => setWeeklyShoppingDayLimit(Number(event.target.value))}
                className="ml-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                wrapperClassName="module-limit-select"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
              </StyledSelect>
            </label>
          </div>
          <div
            className={`module-progress status-${shoppingDaysStatus.tone}`}
            role="progressbar"
            aria-label={shoppingDaysStatusMessage}
            aria-valuemin="0"
            aria-valuemax={weeklyShoppingDayLimit}
            aria-valuenow={Math.min(weeklyShoppingDayCount, weeklyShoppingDayLimit)}
            aria-valuetext={`${weeklyShoppingDayCount} ${language === 'sv' ? 'av' : 'of'} ${weeklyShoppingDayLimit}`}
          >
            <span style={{ width: `${weeklyShoppingDaysProgress}%` }} />
          </div>
          <div className="module-secondary-stat">
            <ShoppingBag aria-hidden="true" />
            <span>
              {t('storesVisited')}: <strong>{weeklyStoreStops}</strong>
            </span>
          </div>

          <p
            className={`module-status-message status-${shoppingDaysStatus.tone}`}
            role={shoppingDaysStatus.tone === 'critical' ? 'alert' : 'status'}
          >
            <ShoppingDaysStatusIcon aria-hidden="true" />
            {shoppingDaysStatusMessage}
          </p>
        </section>
        )}

        {activeModule === 'budget' && (
        <section id="weekly-budget" className="module-panel mb-6 rounded-3xl border border-amber-100 bg-white p-6 shadow-md">
          <button type="button" className="module-back mb-4" onClick={() => openModule('home')}>
            <ArrowLeft aria-hidden="true" />
            {t('home')}
          </button>
          <div className="module-title-row">
            <div className="module-title-with-icon">
              <span aria-hidden="true"><Wallet /></span>
              <div>
                <h2 className="text-xl font-bold text-stone-900">{t('weeklyBudget')}</h2>
                <p>{t('budgetPlanningHint')}</p>
              </div>
            </div>
            <label className="module-edit-control text-sm font-medium text-stone-700">
              {t('budgetInSek')}
              <input
                type="number"
                inputMode="decimal"
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

          <div className="budget-metrics">
            <div>
              <span>{t('weeklyBudget')}</span>
              <strong>{formatMoney(weeklyBudgetValue, displayCurrency, locale)}</strong>
            </div>
            <div>
              <span>{t('spentThisWeek')}</span>
              <strong>{formatMoney(weeklySpentSek, displayCurrency, locale)}</strong>
            </div>
            <div>
              <span>{t('remainingThisWeek')}</span>
              <strong className={`status-value status-${weeklyBudgetStatus.tone}`}>
                {formatMoney(weeklyRemainingSek, displayCurrency, locale)}
              </strong>
            </div>
          </div>
          <div
            className={`module-progress status-${weeklyBudgetStatus.tone}`}
            role={weeklyBudgetValue > 0 ? 'progressbar' : undefined}
            aria-label={weeklyBudgetStatusMessage}
            aria-valuemin={weeklyBudgetValue > 0 ? 0 : undefined}
            aria-valuemax={weeklyBudgetValue > 0 ? weeklyBudgetValue : undefined}
            aria-valuenow={
              weeklyBudgetValue > 0
                ? Math.min(weeklySpentSek, weeklyBudgetValue)
                : undefined
            }
            aria-valuetext={
              weeklyBudgetValue > 0
                ? `${formatMoney(weeklySpentSek, displayCurrency, locale)} ${t('spentThisWeek')}`
                : undefined
            }
          >
            <span style={{ width: `${weeklyBudgetProgress}%` }} />
          </div>
          <p
            className={`module-status-message status-${weeklyBudgetStatus.tone}`}
            role={weeklyBudgetStatus.tone === 'critical' ? 'alert' : 'status'}
          >
            <WeeklyBudgetStatusIcon aria-hidden="true" />
            {weeklyBudgetStatusMessage}
          </p>
        </section>
        )}

        {activeModule === 'list' && (
        <section id="shopping-list" className="module-panel mb-6 rounded-3xl border border-amber-100 bg-white p-6 shadow-md">
          <button type="button" className="module-back mb-4" onClick={() => openModule('home')}>
            <ArrowLeft aria-hidden="true" />
            {t('home')}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="module-title-with-icon">
              <span aria-hidden="true"><ListChecks /></span>
              <div>
                <h2 className="text-xl font-bold text-stone-900">{t('shoppingList')}</h2>
                <p className="text-sm text-stone-600">{t('shoppingListHint')}</p>
              </div>
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

          <form onSubmit={handleAddShoppingItem} className="shopping-composer mt-5">
            <input
              type="text"
              value={shoppingInput}
              onChange={(event) => setShoppingInput(event.target.value)}
              placeholder={t('itemPlaceholder')}
              aria-label={t('addItem')}
              className="shopping-composer-input"
            />
            <span className="shopping-composer-category">
              <Tag aria-hidden="true" />
              <StyledSelect
                value={shoppingCategory}
                onChange={(event) => setShoppingCategory(event.target.value)}
                aria-label={t('itemCategory')}
                wrapperClassName="shopping-category-select"
              >
                {REVIEW_CATEGORY_KEYS
                  .filter((categoryKey) => categoryKey !== 'deposit')
                  .map((categoryKey) => (
                    <option key={categoryKey} value={categoryKey}>
                      {translatedCategoryLabel(categoryKey)}
                    </option>
                  ))}
              </StyledSelect>
            </span>
            <button
              type="submit"
              className="shopping-composer-submit"
            >
              <Plus aria-hidden="true" />
              {t('addItem')}
            </button>
          </form>

          <div className="shopping-templates mt-3">
            <button
              type="button"
              onClick={() => addCommonTemplate('weeklyBasics')}
            >
              <Plus aria-hidden="true" />
              {t('weeklyBasics')}
            </button>
            <button
              type="button"
              onClick={() => addCommonTemplate('proteinAndProduce')}
            >
              <Plus aria-hidden="true" />
              {t('proteinAndProduce')}
            </button>
          </div>

          {learnedShoppingSuggestions.length > 0 ? (
            <details className="shopping-suggestions mt-5">
              <summary className="text-sm font-semibold text-stone-800">
                <span>{t('learnedSuggestions')}</span>
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className="shopping-suggestion-list mt-2">
                {learnedShoppingSuggestions.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => addShoppingItems(
                      [item.name],
                      item.categoryKey,
                      item.estimatedPriceSek
                    )}
                    className="shopping-suggestion"
                  >
                    <Plus aria-hidden="true" />
                    <span>{item.name} {item.count > 1 ? `×${item.count}` : ''}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : (
            <p className="mt-4 text-xs text-stone-500">{t('learnedSuggestionsHint')}</p>
          )}

          {shoppingList.length > 0 ? (
            <div className="shopping-list-panel mt-5">
              <div className="shopping-list-header">
                <strong>
                  {shoppingItemsToBuy} {t('itemsToBuy')}
                </strong>
                <span>{t('estimatedPrice')}</span>
                {shoppingList.length > 5 && (
                  <small>{t('scrollForMore')}</small>
                )}
              </div>
              <div
                className="shopping-list-rows"
                tabIndex={shoppingList.length > 5 ? 0 : undefined}
                aria-label={t('shoppingList')}
              >
                {shoppingList.map((item) => (
                  <div
                    key={item.id}
                    className="shopping-list-row"
                  >
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleShoppingItem(item.id)}
                      aria-label={item.name}
                    />
                    <div className="shopping-item-name">
                      <span className={`block text-sm ${item.completed ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                        {item.name}
                      </span>
                      {item.categoryKey && item.categoryKey !== 'other' && (
                        <span className="block text-xs text-stone-500">
                          {translatedCategoryLabel(item.categoryKey)}
                        </span>
                      )}
                    </div>
                    <label className="shopping-price-control">
                      <input
                        type="number"
                        inputMode="decimal"
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
                      />
                      <span>{displayCurrency}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeShoppingItem(item.id)}
                      aria-label={`${t('removeItem')}: ${item.name}`}
                      className="shopping-item-remove text-xs font-semibold text-red-600"
                      title={`${t('removeItem')}: ${item.name}`}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-stone-500">{t('emptyShoppingList')}</p>
          )}

          {shoppingList.length > 0 && (
            <div className="shopping-list-total mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
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
        )}

        {activeModule === 'receipts' && showForm && (
          <section className={`receipt-wizard receipt-wizard-step-${receiptStep} grid gap-6 lg:grid-cols-2 mb-8`}>
            <div className="wizard-progress" aria-label={`${t('step')} ${receiptStep}`}>
              {[t('uploadStep'), t('detailsStep'), t('categoriesStep'), t('saveStep')].map((label, index) => (
                <span key={label} className={receiptStep >= index + 1 ? 'is-current' : ''}>
                  <i>{index + 1}</i>{label}
                </span>
              ))}
            </div>
            <div className="receipt-upload-step bg-white rounded-3xl shadow-md p-6 border border-amber-100">
              <h2 className="text-xl font-bold text-stone-900 mb-2">{t('importTitle')}</h2>
              <p className="text-stone-600 mb-4">{t('importDescription')}</p>

              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <label className="receipt-language-control">
                  <span>{t('receiptLanguage')}</span>
                  <StyledSelect
                    value={receiptLanguage}
                    onChange={(event) => setReceiptLanguage(event.target.value)}
                  >
                    <option value="auto">{t('automaticLanguage')}</option>
                    <option value="sv">{t('swedishLanguage')}</option>
                    <option value="en">{t('englishLanguage')}</option>
                  </StyledSelect>
                </label>
                <div className="receipt-file-actions">
                  <label
                    htmlFor="receipt-image"
                    className="receipt-photo-action cursor-pointer bg-amber-600 px-5 py-3 font-semibold text-white"
                  >
                    <FileUp aria-hidden="true" />
                    {t('chooseImage')}
                  </label>
                  <label
                    htmlFor="receipt-camera"
                    className="receipt-photo-action receipt-camera-action cursor-pointer px-5 py-3 font-semibold"
                  >
                    <Camera aria-hidden="true" />
                    {t('takePhoto')}
                  </label>
                </div>
                <input
                  id="receipt-image"
                  type="file"
                  accept={RECEIPT_FILE_ACCEPT}
                  onChange={handleImageSelected}
                  disabled={['working', 'compressing'].includes(imageStatus)}
                  className="sr-only"
                />
                <input
                  id="receipt-camera"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleImageSelected}
                  disabled={['working', 'compressing'].includes(imageStatus)}
                  className="sr-only"
                />
                <p className="mt-3 text-xs text-stone-600">{t('fileHint')}</p>

                {receiptImagePreview && (
                  <img
                    src={receiptImagePreview}
                    alt={t('chooseImage')}
                    className="mt-4 max-h-72 w-full rounded-2xl bg-white object-contain"
                  />
                )}

                {imageStatus === 'quality-warning' && (
                  <div className="image-quality-warning" role="alert">
                    <AlertTriangle aria-hidden="true" />
                    <p>{imageMessage}</p>
                    <div>
                      <label htmlFor="receipt-image">{t('chooseAnotherPhoto')}</label>
                      <button
                        type="button"
                        onClick={() => {
                          setImageStatus('ready');
                          setImageMessage(t('imageReady'));
                        }}
                      >
                        {t('continueAnyway')}
                      </button>
                    </div>
                  </div>
                )}

                {receiptImage && imageStatus !== 'quality-warning' && (
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

                {imageMessage && imageStatus !== 'quality-warning' && (
                  <p
                    role={imageStatus === 'error' ? 'alert' : undefined}
                    className={`mt-3 text-sm ${imageStatus === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
                  >
                    {imageMessage}
                  </p>
                )}

                <button
                  type="button"
                  className="receipt-manual-action"
                  onClick={() => startManualReceiptReview()}
                >
                  <Pencil aria-hidden="true" />
                  {t('manualReviewInstead')}
                </button>
              </div>

              <details className="advanced-details">
                <summary>
                  <span>{t('advancedDetails')}</span>
                  <ChevronDown aria-hidden="true" />
                </summary>
              <label className="block text-sm font-medium text-stone-700 mb-2 mt-4">{t('ocrText')}</label>
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
              {receiptStep === 1 && parseMessage && (
                <p className={`mt-3 text-sm ${parseStatus === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
                  {parseMessage}
                </p>
              )}
              </details>
            </div>

            <div className="receipt-review-step bg-white rounded-3xl shadow-md p-6 border border-amber-100">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-stone-900">{t('newReceipt')}</h2>
              </div>

              {formData.requiresManualReview && (
                <>
                  <p className="unsupported-receipt-warning" role="status">
                    <AlertTriangle aria-hidden="true" />
                    {t('manualReviewReceipt')}
                  </p>
                  {parseStatus === 'error' && parseMessage && (
                    <p className="manual-review-message">{parseMessage}</p>
                  )}
                </>
              )}

              <div className="receipt-basic-fields grid gap-4 md:grid-cols-2">
                <div className="receipt-source-field">
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
                  <StyledSelect
                    value={formData.currency}
                    onChange={(event) => setFormData((current) => ({ ...current, currency: event.target.value }))}
                    className="w-full border border-stone-300 rounded-2xl px-3 py-2"
                    wrapperClassName="w-full"
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </StyledSelect>
                </div>
              </div>

              <div
                ref={receiptLineReviewRef}
                tabIndex="-1"
                className="receipt-line-review mt-5"
              >
                <p className="text-sm font-semibold text-stone-800 mb-3">{t('detectedLines')}</p>
                {formData.lineItems.length > 0 && (
                  <div className="receipt-edit-list">
                    {formData.lineItems.map((item, index) => (
                      <div
                        key={`receipt-line-${index}`}
                        className={`receipt-edit-row ${
                          item.confidence === 'needs-review' ? 'needs-review' : ''
                        }`}
                      >
                        {item.confidence === 'needs-review' && (
                          <div className="receipt-edit-warning">
                            <AlertTriangle aria-hidden="true" />
                            <span>{t('checkThisItem')}</span>
                            <button type="button" onClick={() => confirmReceiptLine(index)}>
                              {t('confirmItem')}
                            </button>
                          </div>
                        )}
                        <label className="receipt-edit-name">
                          <span>{t('itemName')}</span>
                          <input
                            aria-label={`${t('itemName')}: ${item.name || index + 1}`}
                            value={item.name}
                            onChange={(event) => handleReceiptLineChange(
                              index,
                              'name',
                              event.target.value
                            )}
                          />
                        </label>
                        <label>
                          <span>{t('quantity')}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            aria-label={`${t('quantity')}: ${item.name || index + 1}`}
                            value={item.quantity ?? ''}
                            onChange={(event) => handleReceiptLineChange(
                              index,
                              'quantity',
                              event.target.value
                            )}
                          />
                        </label>
                        <label>
                          <span>{t('unitPrice')}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            aria-label={`${t('unitPrice')}: ${item.name || index + 1}`}
                            value={item.unitPrice ?? ''}
                            onChange={(event) => handleReceiptLineChange(
                              index,
                              'unitPrice',
                              event.target.value
                            )}
                          />
                        </label>
                        <label>
                          <span>{t('lineTotal')}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            aria-label={`${t('lineTotal')}: ${item.name || index + 1}`}
                            value={item.amount}
                            onChange={(event) => handleReceiptLineChange(
                              index,
                              'amount',
                              event.target.value
                            )}
                          />
                        </label>
                        <StyledSelect
                          aria-label={`${t('category')}: ${item.name}`}
                          value={item.categoryKey}
                          onChange={(event) => handleLineItemCategoryChange(index, event.target.value)}
                          className="rounded-xl border border-stone-300 bg-white px-2 py-2 text-sm"
                          wrapperClassName="receipt-category-select"
                        >
                          {REVIEW_CATEGORY_KEYS.map((categoryKey) => (
                            <option key={categoryKey} value={categoryKey}>
                              {translatedCategoryLabel(categoryKey)}
                            </option>
                          ))}
                        </StyledSelect>
                        <button
                          type="button"
                          className="receipt-line-delete"
                          onClick={() => removeReceiptLine(index)}
                          aria-label={`${t('removeLine')}: ${item.name || index + 1}`}
                          title={t('removeLine')}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="add-receipt-line"
                  onClick={addMissingReceiptLine}
                >
                  <Plus aria-hidden="true" />
                  {t('addMissingItem')}
                </button>
              </div>

              {hasUnresolvedReceiptMismatch && (
                <div className="receipt-mismatch-panel" role="alert">
                  <div>
                    <AlertTriangle aria-hidden="true" />
                    <strong>
                      {t('itemsDifferFromTotal')}{' '}
                      {new Intl.NumberFormat(locale, {
                        style: 'currency',
                        currency: formData.currency
                      }).format(Math.abs(receiptMismatchAmount))}.
                    </strong>
                  </div>
                  <dl>
                    <div>
                      <dt>{t('itemSum')}</dt>
                      <dd>
                        {new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency: formData.currency
                        }).format(receiptLineTotal)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('printedTotal')}</dt>
                      <dd>
                        {new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency: formData.currency
                        }).format(formData.receiptTotal)}
                      </dd>
                    </div>
                  </dl>
                  <div className="receipt-mismatch-actions">
                    <button type="button" onClick={focusReceiptItems}>
                      {t('reviewItems')}
                    </button>
                    <button type="button" onClick={usePrintedReceiptTotal}>
                      {t('useReceiptTotal')}
                    </button>
                  </div>
                </div>
              )}

              <div className="receipt-category-summary mt-5">
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
                        inputMode="decimal"
                        step="0.01"
                        value={item.amount || ''}
                        onChange={(event) => handleItemChange(index, 'amount', event.target.value)}
                        readOnly={formData.lineItems.length > 0}
                        placeholder="0.00"
                        className={`border rounded-2xl px-3 py-2 text-sm ${
                          formData.lineItems.length > 0
                            ? 'border-stone-200 bg-stone-50 text-stone-600'
                            : 'border-stone-300'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="receipt-save-summary mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4">
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

              {receiptStep === 4 && receiptNotice && (
                <p
                  role="status"
                  className="mt-4 rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900"
                >
                  {receiptNotice}
                </p>
              )}

              <div className="receipt-save-actions flex gap-2 mt-5">
                <button
                  onClick={handleAddReceipt}
                  disabled={
                    receiptSaving
                    || totalSpentSek <= 0
                    || formData.dateNeedsConfirmation
                    || !formData.date
                    || hasUnresolvedReceiptMismatch
                  }
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-full transition"
                >
                  {receiptSaving ? t('savingReceipt') : t('saveReceipt')}
                </button>
              </div>
            </div>
            <div className="wizard-navigation">
              <button
                type="button"
                className="wizard-secondary"
                onClick={() => {
                  if (receiptStep === 1) {
                    resetForm();
                    setShowForm(false);
                  } else {
                    setReceiptStep((current) => current - 1);
                  }
                }}
              >
                <ArrowLeft aria-hidden="true" />
                {receiptStep === 1 ? t('cancel') : t('back')}
              </button>
              {receiptStep < 4 && (
                <button
                  type="button"
                  className="wizard-primary"
                  disabled={receiptStep === 1 && totalSpentSek <= 0}
                  onClick={() => setReceiptStep((current) => Math.min(current + 1, 4))}
                >
                  {t('next')}
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
            </div>
          </section>
        )}

        {activeModule === 'receipts' && !showForm && receipts.length > 0 && (
          <>
            <section className="analytics-summary-panel mb-8" aria-label={t('totalSpent')}>
              <div className="analytics-metric analytics-metric-primary">
                <span className="analytics-metric-icon" aria-hidden="true">
                  <CircleDollarSign />
                </span>
                <div>
                  <span>{t('totalSpent')}</span>
                  <strong>{formatMoney(totalAcrossReceiptsSek, displayCurrency, locale)}</strong>
                </div>
              </div>
              <div className="analytics-metric">
                <span className="analytics-metric-icon analytics-metric-icon-secondary" aria-hidden="true">
                  <ReceiptText />
                </span>
                <div>
                  <span>{t('receipts')}</span>
                  <strong>{receipts.length}</strong>
                </div>
              </div>
            </section>

            <section className="category-analytics-panel bg-white rounded-3xl shadow-md p-6 mb-8 border border-amber-100">
              <div className="chart-heading">
                <div>
                  <h2 className="text-lg font-bold text-stone-900">{t('spendingByCategory')}</h2>
                  {largestChartCategory && (
                    <p className="largest-category-callout">
                      <span>{t('largestShare')}</span>
                      <strong>
                        {largestChartCategory.name} · {largestChartCategory.percentage.toFixed(0)}%
                      </strong>
                    </p>
                  )}
                </div>
              </div>
              <div className="category-chart-layout">
                <div className="category-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartCategoryData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="56%"
                        outerRadius="82%"
                        paddingAngle={3}
                        stroke="none"
                        label={({ percent }) => (percent >= 0.05 ? `${(percent * 100).toFixed(0)}%` : '')}
                        labelLine={false}
                      >
                        {chartCategoryData.map((category, index) => (
                          <Cell
                            key={category.key}
                            fill={category.color}
                            opacity={index === 0 ? 1 : Math.max(0.72, 0.94 - index * 0.025)}
                            stroke={index === 0 ? '#8f3025' : '#fffdf8'}
                            strokeWidth={index === 0 ? 4 : 2}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatMoney(value, displayCurrency, locale)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="category-chart-total">
                    <strong>{formatMoney(totalAcrossReceiptsSek, displayCurrency, locale)}</strong>
                    <span>{t('totalSpent')}</span>
                  </div>
                </div>
                <div className="category-legend">
                  {chartCategoryData.map((category, index) => (
                      <div
                        key={category.key}
                        className={`category-legend-row ${index === 0 ? 'is-dominant' : ''}`}
                      >
                        <span className="category-legend-label">
                          <i style={{ background: category.color }} />
                          {category.name}
                        </span>
                        <span>{category.percentage.toFixed(1)}%</span>
                      </div>
                    ))}
                </div>
              </div>
            </section>

            <section className="receipt-history-panel">
              <div className="receipt-history-header">
                <div>
                  <span className="receipt-history-heading-icon" aria-hidden="true">
                    <ReceiptText />
                  </span>
                  <h2>{t('recentReceipts')}</h2>
                </div>
                <span>
                  {receipts.length} {t('receipts').toLocaleLowerCase(locale)}
                </span>
              </div>
              {receiptsWithDisplay.slice(0, visibleReceiptCount).map((receipt) => (
                <details key={receipt.id} className="receipt-history-row">
                  <summary className="receipt-history-summary">
                    <span className="receipt-row-icon" aria-hidden="true">
                      <ShoppingBag />
                    </span>
                    <span className="receipt-row-merchant">
                      <strong>{receipt.merchant}</strong>
                      <small>{formatReceiptDate(receipt.date, locale)}</small>
                    </span>
                    <span className="receipt-row-total">
                      <strong>{receipt.displayTotal}</strong>
                      <small>{receipt.items.length} {t('items')}</small>
                    </span>
                    <ChevronDown className="receipt-row-chevron" aria-hidden="true" />
                  </summary>
                  <div className="receipt-history-details">
                    <div className="receipt-category-list">
                      {receipt.items.map((item, index) => (
                        <div key={`${receipt.id}-${item.key}-${index}`}>
                          <span>{translatedCategoryLabel(item.key)}</span>
                          <strong>
                            {new Intl.NumberFormat(locale, {
                              style: 'currency',
                              currency: receipt.currency
                            }).format(item.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
              {(visibleReceiptCount < receipts.length || visibleReceiptCount > 1) && (
                <div className="receipt-history-footer">
                  {visibleReceiptCount < receipts.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleReceiptCount((current) => Math.min(current + 3, receipts.length))}
                    >
                      {language === 'sv'
                        ? `Visa ${Math.min(3, receipts.length - visibleReceiptCount)} kvitton till`
                        : `Show ${Math.min(3, receipts.length - visibleReceiptCount)} more receipts`}
                      <ChevronDown aria-hidden="true" />
                    </button>
                  )}
                  {visibleReceiptCount > 1 && (
                    <button
                      type="button"
                      className="receipt-history-collapse"
                      onClick={() => setVisibleReceiptCount(1)}
                    >
                      {language === 'sv' ? 'Visa färre kvitton' : 'Show fewer receipts'}
                      <ChevronUp aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {activeModule === 'receipts' && receipts.length === 0 && !showForm && !receiptsLoading && (
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
