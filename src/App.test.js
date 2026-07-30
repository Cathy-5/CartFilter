import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CartFilter, { parseReceiptText } from './CartFilter';

const mockSignInWithPopup = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockOnSnapshot = jest.fn();
const mockSetDoc = jest.fn();

jest.mock('./firebase', () => ({
  auth: { app: 'test-auth' },
  db: { app: 'test-db' }
}));

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: jest.fn(),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  signInWithPopup: (...args) => mockSignInWithPopup(...args),
  signOut: jest.fn()
}));

jest.mock('firebase/firestore', () => ({
  collection: (...path) => ({ path }),
  doc: (...path) => ({ path }),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  orderBy: () => ({ field: 'createdAt' }),
  query: (collectionRef) => collectionRef,
  serverTimestamp: () => 'server-timestamp',
  setDoc: (...args) => mockSetDoc(...args)
}));

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

test('renders localized receipt import after firebase sign in', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback(null);
    return jest.fn();
  });

  mockSignInWithPopup.mockImplementation(async (authArg, provider) => {
    const authCallback = mockOnAuthStateChanged.mock.calls[0][1];
    authCallback({ email: 'user@example.com', uid: 'user-1' });
    return { user: { email: 'user@example.com', uid: 'user-1' }, provider };
  });
  mockOnSnapshot.mockImplementation((receiptQuery, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });

  render(<CartFilter />);

  fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /cartfilter/i })).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: /import receipt/i })).toBeInTheDocument();
  expect(mockSignInWithPopup).toHaveBeenCalled();
});

test('saves a receipt under the signed-in user', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((receiptQuery, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });
  mockSetDoc.mockResolvedValue();

  render(<CartFilter />);

  fireEvent.click(screen.getByRole('button', { name: /import receipt/i }));
  const receiptAmountInput = screen
    .getAllByRole('spinbutton')
    .find((input) => input.getAttribute('step') === '0.01');
  fireEvent.change(receiptAmountInput, { target: { value: '49.90' } });
  fireEvent.click(screen.getByRole('button', { name: /save receipt/i }));

  await waitFor(() => {
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.arrayContaining(['users', 'user-1', 'receipts', expect.stringMatching(/^receipt-/)])
      }),
      expect.objectContaining({
        totalSek: 49.9,
        fingerprint: expect.stringMatching(/^receipt-/),
        createdAt: 'server-timestamp'
      })
    );
  });
});

test('does not save the same receipt twice', async () => {
  const savedReceipt = {
    merchant: 'Unknown Merchant',
    date: new Date().toISOString().split('T')[0],
    currency: 'SEK',
    source: 'manual',
    items: [{ key: 'meat', label: 'meat', amount: 49.9 }],
    lineItems: [],
    totalSek: 49.9,
    imageUrl: null,
    storagePath: null
  };
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    if (queryRef.path?.includes('receipts')) {
      callback({
        docs: [{ id: 'existing-receipt', data: () => savedReceipt }]
      });
    } else {
      callback({ docs: [] });
    }
    return jest.fn();
  });

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /import receipt/i }));
  const receiptAmountInput = screen
    .getAllByRole('spinbutton')
    .find((input) => input.getAttribute('step') === '0.01');
  fireEvent.change(receiptAmountInput, { target: { value: '49.90' } });
  fireEvent.click(screen.getByRole('button', { name: /save receipt/i }));

  expect(await screen.findByText(/already saved in history/i)).toBeInTheDocument();
  expect(mockSetDoc).not.toHaveBeenCalled();
});

test('removes repeated OCR noise from a known merchant name', () => {
  const parsed = parseReceiptText(
    `ICA Kvantum Teleborg eee
Org. nr: 556000-0000
MJÖLK 20,00
Totalt 1 varor
Totalt 20,00 SEK`,
    '2026-07-30'
  );

  expect(parsed.merchant).toBe('ICA Kvantum Teleborg');
});

test('parses the real Willys OCR text into Swedish grocery categories', () => {
  const receiptText = `00:09 ol TE
& Kvitto :
Willys Växjö Teleborg
Tel.0470-705180
Org. nr: 556163-2232
EXOTISK ZERO 2st+13,15 26,30
Rabatt :LÄSK -6,30
+PANT ENG PET >1L 2st+3,00 6,00
ÄGG 24P INNE M 59,90
GURKA SVERIGE ST 2st+15,90 31,80
2 + Rabatt:GURKA -12,00
KYCKLING NUGGETS 40,60
BISCOFF 250G 16,90
MOROT 1KG 16,90
SOJAMARINERAD TOFU 2st+13,90 27,80
DRUVOR GRÖNA 39,90
PAPRIKA GUL 8,10
SPENAT 19,90
Rabatt : SALLAD -5,00
BLADPERSILJA 5,99
Totalt 14 varor
Totalt 276,79 SEK
Mottaget Kontokort 276,79
2026-07-27 07:38:21`;

  const parsed = parseReceiptText(receiptText, '2026-07-30');
  const categoryAmounts = Object.fromEntries(
    parsed.items.map((item) => [item.key, Number(item.amount.toFixed(2))])
  );

  expect(parsed.merchant).toBe('Willys Växjö Teleborg');
  expect(parsed.date).toBe('2026-07-27');
  expect(parsed.currency).toBe('SEK');
  expect(parsed.total).toBe(276.79);
  expect(categoryAmounts).toEqual({
    beverages: 20,
    deposit: 6,
    meat: 128.3,
    fruits: 39.9,
    vegetables: 65.69,
    snacks: 16.9
  });
  expect(parsed.lineItems.find((item) => item.name.includes('PANT'))).toEqual(
    expect.objectContaining({
      type: 'deposit',
      categoryKey: 'deposit',
      linkedTo: expect.stringContaining('EXOTISK ZERO')
    })
  );
  expect(parsed.lineItems.find((item) => item.name.includes('Rabatt:GURKA'))).toEqual(
    expect.objectContaining({
      type: 'discount',
      categoryKey: 'vegetables',
      linkedTo: expect.stringContaining('GURKA')
    })
  );
});

test('reconstructs wrapped OCR lines without a supermarket product catalogue', () => {
  const receiptText = `Willys Växjö Teleborg
Tel.0470-705180
Org. nr: 556163-2232
COLA SOCKERFRI 2L
2st*13,15 26,30
+PANT ENG PET >1L
2st*2,00 4,00
MUSLIBAR JORDGUBB
15,99
MUSLIBAR CHOKLAD
15,99
Rabatt:BÄR -3,98
NÖTFÄRS IMP 99,90
Willys Plus:NÖTFÄRS -10,00
Totalt 8 varor
Totalt 186,89 SEK
2026-07-21 19:18:41`;

  const parsed = parseReceiptText(receiptText, '2026-07-30');
  const categoryAmounts = Object.fromEntries(
    parsed.items.map((item) => [item.key, Number(item.amount.toFixed(2))])
  );

  expect(categoryAmounts).toEqual({
    beverages: 26.3,
    deposit: 4,
    snacks: 28,
    meat: 89.9
  });
  expect(parsed.lineItems[0].name).toContain('COLA SOCKERFRI 2L');
  expect(parsed.lineItems[0].categoryKey).toBe('beverages');
});

test('parses Lidl VAT markers and stops before the payment section', () => {
  const receiptText = `Växjö Teleborg, Smedsvängen 12A
Org.nr: 969667-6312, lidl.se/kontakt
SEK
Kex Kakao 23,56 B
Apelsin, 1,5kg 29,90 B
Muffins SK1 7,50 x 2 15,00 B
Cookies SK1 7,50 B
Pastel de Nata 7,50 B
ATT BETALA 83,46
Kundens Kvitto
Köp
2026/07/27 08:57
KÖPBELOPP SEK 83,46
TOTALBELOPP SEK 83,46`;

  const parsed = parseReceiptText(receiptText, '2026-07-30');
  const categoryAmounts = Object.fromEntries(
    parsed.items.map((item) => [item.key, Number(item.amount.toFixed(2))])
  );

  expect(parsed.merchant).toBe('Lidl');
  expect(parsed.date).toBe('2026-07-27');
  expect(parsed.total).toBe(83.46);
  expect(parsed.lineItems).toHaveLength(5);
  expect(parsed.lineItems.map((item) => item.name)).toEqual([
    'Kex Kakao',
    'Apelsin, 1,5kg',
    'Muffins SK1 7,50 x 2',
    'Cookies SK1',
    'Pastel de Nata'
  ]);
  expect(categoryAmounts).toEqual({
    snacks: 53.56,
    fruits: 29.9
  });
});

test('reuses a remembered category and treats price reduction as a discount', () => {
  const parsed = parseReceiptText(
    `ICA Nära
Org. nr: 123456-7890
ROYAL ROLLS VANILJ 9,36
Prisnedsättning -2,00
Totalt 1 varor
Totalt 7,36 SEK`,
    '2026-07-30',
    { 'royal rolls vanilj': 'snacks' }
  );

  expect(parsed.lineItems[0]).toEqual(expect.objectContaining({
    name: 'ROYAL ROLLS VANILJ',
    categoryKey: 'snacks',
    confidence: 'remembered',
    type: 'product'
  }));
  expect(parsed.lineItems[1]).toEqual(expect.objectContaining({
    categoryKey: 'snacks',
    type: 'discount',
    linkedTo: 'ROYAL ROLLS VANILJ',
    amount: -2
  }));
  expect(parsed.items).toEqual([
    expect.objectContaining({ key: 'snacks', amount: 7.36 })
  ]);
});

test('links a named brioche discount even when another product is between the lines', () => {
  const parsed = parseReceiptText(
    `Willys
Org. nr: 556163-2232
BROSCHE 24,90
MJÖLK 18,00
Willys Plus:BROSCHE -5,00
Totalt 2 varor
Totalt 37,90 SEK`,
    '2026-07-30'
  );

  expect(parsed.lineItems[0]).toEqual(expect.objectContaining({
    categoryKey: 'grains',
    type: 'product'
  }));
  expect(parsed.lineItems[2]).toEqual(expect.objectContaining({
    categoryKey: 'grains',
    type: 'discount',
    linkedTo: 'BROSCHE',
    amount: -5
  }));
  expect(parsed.items.find((item) => item.key === 'grains').amount).toBe(19.9);
});

test('builds a simple shopping list from common-item templates', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((receiptQuery, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /add weekly basics/i }));

  expect(screen.getByText('Milk')).toBeInTheDocument();
  expect(screen.getByText('Eggs')).toBeInTheDocument();
  expect(screen.getByText('Bread')).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem('cartfilter-shopping-list-user-1'))).toHaveLength(9);

  fireEvent.change(screen.getByPlaceholderText(/milk, tomatoes, rice/i), {
    target: { value: 'Mjölk' }
  });
  fireEvent.click(screen.getByRole('button', { name: /^add item$/i }));
  expect(screen.queryByText('Mjölk')).not.toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem('cartfilter-shopping-list-user-1'))).toHaveLength(9);

  fireEvent.change(screen.getByPlaceholderText(/milk, tomatoes, rice/i), {
    target: { value: 'Royal Rolls Vanilj' }
  });
  fireEvent.change(screen.getByRole('combobox', { name: /item category/i }), {
    target: { value: 'snacks' }
  });
  fireEvent.click(screen.getByRole('button', { name: /^add item$/i }));

  await waitFor(() => {
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.arrayContaining(['categoryMappings', 'royal%20rolls%20vanilj'])
      }),
      expect.objectContaining({
        normalizedName: 'royal rolls vanilj',
        categoryKey: 'snacks'
      }),
      { merge: true }
    );
  });
});
