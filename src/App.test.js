import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CartFilter, { parseReceiptText } from './CartFilter';

const mockSignInWithPopup = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockOnSnapshot = jest.fn();
const mockAddDoc = jest.fn();

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
  addDoc: (...args) => mockAddDoc(...args),
  collection: (...path) => ({ path }),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  orderBy: () => ({ field: 'createdAt' }),
  query: (collectionRef) => collectionRef,
  serverTimestamp: () => 'server-timestamp'
}));

beforeEach(() => {
  jest.clearAllMocks();
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
  mockAddDoc.mockResolvedValue({ id: 'receipt-1' });

  render(<CartFilter />);

  fireEvent.click(screen.getByRole('button', { name: /import receipt/i }));
  const amountInputs = screen.getAllByRole('spinbutton');
  fireEvent.change(amountInputs[0], { target: { value: '49.90' } });
  fireEvent.click(screen.getByRole('button', { name: /save receipt/i }));

  await waitFor(() => {
    expect(mockAddDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.arrayContaining(['users', 'user-1', 'receipts'])
      }),
      expect.objectContaining({
        totalSek: 49.9,
        createdAt: 'server-timestamp'
      })
    );
  });
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
    vegetables: 105.59,
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
