import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CartFilter, {
  getCategoryRankColor,
  getReceiptFileKind,
  isLikelyBlurryReceiptImageData,
  isLowResolutionReceiptImage,
  getShoppingDaysStatus,
  getWeeklyBudgetStatus,
  parseReceiptText
} from './CartFilter';

const mockSignInWithPopup = jest.fn();
const mockSignOut = jest.fn();
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
  signOut: (...args) => mockSignOut(...args)
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

test('uses distinct colors for ranked spending categories', () => {
  const colors = Array.from({ length: 14 }, (_, index) => getCategoryRankColor(index));

  expect(new Set(colors)).toHaveProperty('size', 14);
  expect(colors[0]).not.toBe(colors[1]);
});

test.each([
  [1, 3, 'on-track', 'on-track'],
  [2, 3, 'getting-close', 'close'],
  [3, 3, 'reached', 'reached'],
  [4, 3, 'over', 'over'],
  [5, 3, 'significantly-over', 'critical'],
  [0, 0, 'not-set', 'neutral']
])(
  'maps %s of %s shopping days to %s',
  (used, limit, expectedKey, expectedTone) => {
    expect(getShoppingDaysStatus(used, limit)).toEqual(
      expect.objectContaining({ key: expectedKey, tone: expectedTone })
    );
  }
);

test.each([
  [0, 0, 'not-set', 'neutral'],
  [639, 800, 'on-track', 'on-track'],
  [640, 800, 'getting-close', 'close'],
  [799.99, 800, 'getting-close', 'close'],
  [800, 800, 'reached', 'reached'],
  [801, 800, 'over', 'over'],
  [959.99, 800, 'over', 'over'],
  [960, 800, 'significantly-over', 'critical']
])(
  'maps SEK %s spent from SEK %s to %s',
  (spent, budget, expectedKey, expectedTone) => {
    expect(getWeeklyBudgetStatus(spent, budget)).toEqual(
      expect.objectContaining({ key: expectedKey, tone: expectedTone })
    );
  }
);

test('renders localized receipt import after firebase sign in', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback(null);
    return jest.fn();
  });

  mockSignInWithPopup.mockImplementation(async (authArg, provider) => {
    const authCallback = mockOnAuthStateChanged.mock.calls[0][1];
    authCallback({ displayName: 'Cathy Wu', email: 'user@example.com', uid: 'user-1' });
    return {
      user: { displayName: 'Cathy Wu', email: 'user@example.com', uid: 'user-1' },
      provider
    };
  });
  mockOnSnapshot.mockImplementation((receiptQuery, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });

  render(<CartFilter />);

  fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1, name: /cartfilter/i })).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: /scan or upload receipt/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /account: cathy/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /welcome to cartfilter, cathy/i })).toBeInTheDocument();
  expect(screen.queryByText('user@example.com')).not.toBeInTheDocument();
  expect(mockSignInWithPopup).toHaveBeenCalled();
});

test('restores the preferred name from Firestore and uses it in the greeting', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ displayName: 'Google Name', email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    if (queryRef.path?.includes('settings')) {
      callback({
        exists: () => true,
        data: () => ({
          preferredName: 'Mina Andersson',
          weeklyBudgetSek: 800,
          weeklyShoppingDayLimit: 3,
          shoppingList: []
        })
      });
    } else {
      callback({ docs: [] });
    }
    return jest.fn();
  });

  render(<CartFilter />);

  expect(await screen.findByRole('button', { name: /account: mina/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', {
    name: /welcome to cartfilter, mina/i
  })).toBeInTheDocument();
  expect(window.localStorage.getItem('cartfilter-preferred-name-user-1')).toBe(
    'Mina Andersson'
  );
});

test('edits and validates the preferred name from the account menu', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ displayName: 'Cathy Wu', email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    if (queryRef.path?.includes('settings')) {
      callback({ exists: () => false });
    } else {
      callback({ docs: [] });
    }
    return jest.fn();
  });
  mockSetDoc.mockResolvedValue();

  render(<CartFilter />);

  fireEvent.click(await screen.findByRole('button', { name: /account: cathy/i }));
  expect(screen.getByText('user@example.com')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText('user@example.com')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /account: cathy/i }));
  fireEvent.click(screen.getByRole('button', { name: /edit name/i }));

  const nameInput = screen.getByRole('textbox', { name: /preferred name/i });
  fireEvent.change(nameInput, { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
  expect(screen.getByRole('alert')).toHaveTextContent(/enter a name/i);

  fireEvent.change(nameInput, { target: { value: 'Mina Andersson' } });
  fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

  expect(await screen.findByRole('status')).toHaveTextContent(/name saved/i);
  expect(screen.getByRole('button', { name: /account: mina/i })).toBeInTheDocument();
  expect(window.localStorage.getItem('cartfilter-preferred-name-user-1')).toBe(
    'Mina Andersson'
  );
  await waitFor(() => {
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.arrayContaining(['users', 'user-1', 'settings', 'preferences'])
      }),
      expect.objectContaining({ preferredName: 'Mina Andersson' }),
      { merge: true }
    );
  });

  fireEvent.click(screen.getByRole('button', { name: /account: mina/i }));
  fireEvent.click(screen.getByRole('button', { name: /^sign out$/i }));
  expect(mockSignOut).toHaveBeenCalled();
});

test('shows a returning greeting only after receipt history loads', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ displayName: 'Alex Smith', email: 'alex@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    if (queryRef.path?.includes('settings')) {
      callback({ exists: () => false });
    } else if (queryRef.path?.includes('receipts')) {
      callback({
        docs: [{
          id: 'receipt-1',
          data: () => ({
            merchant: 'ICA',
            date: '2026-07-31',
            currency: 'SEK',
            items: [],
            lineItems: [],
            totalSek: 100
          })
        }]
      });
    } else {
      callback({ docs: [] });
    }
    return jest.fn();
  });

  render(<CartFilter />);

  expect(await screen.findByRole('heading', {
    name: /welcome back, alex/i
  })).toBeInTheDocument();
  expect(screen.queryByText(/welcome to cartfilter, alex/i)).not.toBeInTheDocument();
});

test('uses a neutral account label when Google provides no display name', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    if (queryRef.path?.includes('settings')) {
      callback({ exists: () => false });
    } else {
      callback({ docs: [] });
    }
    return jest.fn();
  });

  render(<CartFilter />);

  expect(await screen.findByRole('button', { name: /^account: account$/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', {
    name: /^welcome to cartfilter$/i
  })).toBeInTheDocument();
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

  fireEvent.click(screen.getByRole('button', { name: /scan or upload receipt/i }));
  const receiptAmountInput = screen
    .getAllByRole('spinbutton')
    .find((input) => input.getAttribute('step') === '0.01');
  fireEvent.change(receiptAmountInput, { target: { value: '49.90' } });
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
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
  fireEvent.click(screen.getByRole('button', { name: /scan or upload receipt/i }));
  const receiptAmountInput = screen
    .getAllByRole('spinbutton')
    .find((input) => input.getAttribute('step') === '0.01');
  fireEvent.change(receiptAmountInput, { target: { value: '49.90' } });
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  fireEvent.click(screen.getByRole('button', { name: /save receipt/i }));

  expect(await screen.findByText(/already saved in history/i)).toBeInTheDocument();
  expect(mockSetDoc.mock.calls.some(([docRef]) => docRef.path?.includes('receipts'))).toBe(false);
});

test('counts unique shopping days and saves the selected limit', async () => {
  const startOfWeek = new Date();
  const daysSinceMonday = (startOfWeek.getDay() + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
  startOfWeek.setHours(12, 0, 0, 0);
  const secondShoppingDay = new Date(startOfWeek);
  secondShoppingDay.setDate(secondShoppingDay.getDate() + 1);
  const firstDate = startOfWeek.toISOString().split('T')[0];
  const secondDate = secondShoppingDay.toISOString().split('T')[0];
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    if (queryRef.path?.includes('receipts')) {
      callback({
        docs: [
          {
            id: 'receipt-1',
            data: () => ({
              merchant: 'ICA',
              date: firstDate,
              currency: 'SEK',
              items: [],
              lineItems: [],
              totalSek: 100
            })
          },
          {
            id: 'receipt-2',
            data: () => ({
              merchant: 'Lidl',
              date: secondDate,
              currency: 'SEK',
              items: [],
              lineItems: [],
              totalSek: 200
            })
          }
        ]
      });
    } else {
      callback({ docs: [] });
    }
    return jest.fn();
  });

  render(<CartFilter />);

  fireEvent.click(screen.getByRole('button', { name: /^shopping days$/i }));
  expect(await screen.findByText(/shopping days used/i)).toHaveTextContent(
    /2 of 3 shopping days used/i
  );
  expect(screen.getByText(/stores visited:/i)).toHaveTextContent(/stores visited: 2/i);
  fireEvent.change(screen.getByLabelText(/maximum shopping days per week/i), {
    target: { value: '2' }
  });

  expect(await screen.findByText(/plan reached for this week/i)).toBeInTheDocument();
  await waitFor(() => {
    expect(window.localStorage.getItem('cartfilter-weekly-shopping-days-user-1')).toBe('2');
  });
});

test('requires confirmation when OCR cannot detect a receipt date', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /scan or upload receipt/i }));
  fireEvent.change(screen.getByPlaceholderText(/paste ocr text here/i), {
    target: {
      value: `ICA Kvantum
Org. nr: 556000-0000
MJÖLK 20,00
Totalt 1 varor
Totalt 20,00 SEK`
    }
  });
  fireEvent.click(screen.getByRole('button', { name: /parse receipt text/i }));

  expect(await screen.findByText(/receipt date was not detected/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save receipt/i })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: /confirm date/i }));
  expect(screen.getByRole('button', { name: /save receipt/i })).toBeEnabled();
});

test('lets users edit, add, and delete receipt rows before saving corrections', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });
  mockSetDoc.mockResolvedValue();

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /scan or upload receipt/i }));
  fireEvent.change(screen.getByPlaceholderText(/paste ocr text here/i), {
    target: {
      value: `ICA
Org. nr: 556000-0000
MJÖLK 20,00
Totalt 2 varor
Totalt 35,00 SEK
2026-07-31`
    }
  });
  fireEvent.click(screen.getByRole('button', { name: /parse receipt text/i }));
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));

  expect(screen.getByRole('alert')).toHaveTextContent(
    /items differ from the receipt total by.*15/i
  );

  fireEvent.click(screen.getByRole('button', { name: /add missing item/i }));
  const itemNameInputs = screen.getAllByLabelText(/^item name:/i);
  const lineTotalInputs = screen.getAllByLabelText(/^line total:/i);
  fireEvent.change(itemNameInputs[1], { target: { value: 'Bread' } });
  fireEvent.change(lineTotalInputs[1], { target: { value: '15.00' } });
  expect(screen.queryByText(/items differ from the receipt total by/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /remove item: bread/i }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    /items differ from the receipt total by.*15/i
  );

  fireEvent.change(screen.getByLabelText(/item name: mjölk/i), {
    target: { value: 'Milk' }
  });
  fireEvent.change(screen.getByLabelText(/line total: milk/i), {
    target: { value: '35.00' }
  });
  expect(screen.queryByText(/items differ from the receipt total by/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  fireEvent.click(screen.getByRole('button', { name: /save receipt/i }));

  await waitFor(() => {
    const receiptSave = mockSetDoc.mock.calls.find(([documentRef]) => (
      documentRef.path?.includes('receipts')
    ));
    expect(receiptSave?.[1]).toEqual(expect.objectContaining({
      lineItems: [
        expect.objectContaining({
          name: 'Milk',
          originalName: 'MJÖLK',
          amount: 35
        })
      ],
      unmatchedAmount: 0
    }));
  });
  expect(mockSetDoc.mock.calls.some(([documentRef]) => (
    documentRef.path?.includes('productAliases')
  ))).toBe(true);
});

test('requires resolving a printed-total mismatch and supports using the receipt total', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });
  mockSetDoc.mockResolvedValue();

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /scan or upload receipt/i }));
  fireEvent.change(screen.getByPlaceholderText(/paste ocr text here/i), {
    target: {
      value: `Local Market
Org. nr: 556000-0000
Milk 20,00
Total 35,00 SEK
2026-07-31`
    }
  });
  fireEvent.click(screen.getByRole('button', { name: /parse receipt text/i }));
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));

  expect(screen.getByRole('button', { name: /use receipt total/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /use receipt total/i }));
  expect(screen.queryByText(/items differ from the receipt total by/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  expect(screen.getByRole('button', { name: /save receipt/i })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /save receipt/i }));

  await waitFor(() => {
    const receiptSave = mockSetDoc.mock.calls.find(([documentRef]) => (
      documentRef.path?.includes('receipts')
    ));
    expect(receiptSave?.[1].lineItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'reconciliation',
        amount: 15,
        confidence: 'user'
      })
    ]));
  });
});

test('allows a receipt to be entered and saved when automatic reading is unavailable', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });
  mockSetDoc.mockResolvedValue();

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /scan or upload receipt/i }));
  expect(screen.getByLabelText(/choose receipt file/i)).toHaveAttribute(
    'accept',
    expect.stringContaining('.pdf')
  );
  expect(screen.getByLabelText(/take photo/i)).toHaveAttribute('capture', 'environment');
  fireEvent.click(screen.getByRole('button', { name: /enter manually/i }));
  expect(screen.getByText(/could not read this receipt reliably/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^next/i }));
  fireEvent.change(screen.getByLabelText(/item name:/i), {
    target: { value: 'Bread' }
  });
  fireEvent.change(screen.getByLabelText(/line total: bread/i), {
    target: { value: '24.50' }
  });
  fireEvent.click(screen.getByRole('button', { name: /^next/i }));

  expect(screen.getByRole('button', { name: /save receipt/i })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /save receipt/i }));
  await waitFor(() => {
    const receiptSave = mockSetDoc.mock.calls.find(([documentRef]) => (
      documentRef.path?.includes('receipts')
    ));
    expect(receiptSave?.[1]).toEqual(expect.objectContaining({
      totalSek: 24.5,
      lineItems: [
        expect.objectContaining({ name: 'Bread', amount: 24.5 })
      ]
    }));
  });
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
    meat: 87.7,
    preparedMeals: 40.6,
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
  expect(parsed.unmatchedAmount).toBe(38.69);
  expect(parsed.lineItems[0].name).toContain('COLA SOCKERFRI 2L');
  expect(parsed.lineItems[0].categoryKey).toBe('beverages');
});

test('reconciles the complete Willys receipt with alcohol and a pant return', () => {
  const receiptText = `Willys Växjö Teleborg
Tel.0470-705180
Org. nr: 556163-2232
COLA SOCKERFRI 2L 13,15
+PANT ENG PET >1L 2,00
EMD BRÄU 2.8% 50CL6P 26,90
+PANT ALUMINIUMBURK 6,00
TUC SALTY CRA 19,50
BISCOFF CRUNCHY 90G 19,50
Rabatt:CHOKLAD -9,00
JORDGUBBAR 1KG 29,90
MANGO 500G 20,72
FÄRSKPOTATIS TVÄTTAD 10,37
BLANDFÄRS 18% 44,90
.FÄRS
LÖK GUL 1,64
MOROT 1KG 16,90
SOJAMARINERAD TOFU 2st*13,90 27,80
BISCOFF 250G 16,90
SENSATION WHITE 20,90
POPCORN 65G 10,50
FALAFEL 800G 47,22
RUSSIN KÄRNFRIA 250G 18,83
ISBERGSSALLAD
0,635kg*19,90kr/kg 12,63
SPENAT 23,90
Rabatt:SALLAD -9,00
CHEESEBURGARE 2P 34,90
Prisnedsättning 50,0% -17,45
ROYAL ROLLS VANILJ 9,36
CHAMPINJONER 250G 16,90
Rabatt:CHAMPINJONER -7,00
CITRON 500G KL 2 16,90
PANTRETUR -68,00
Totalt 24 varor
Totalt 357,77 SEK
2026-07-12 19:52:31`;

  const parsed = parseReceiptText(receiptText, '2026-07-31');
  const depositReturn = parsed.lineItems.find((item) => item.type === 'deposit-return');
  const grossPurchases = parsed.lineItems
    .filter((item) => item.type !== 'deposit-return')
    .reduce((sum, item) => sum + item.amount, 0);

  expect(parsed.total).toBe(357.77);
  expect(parsed.unmatchedAmount).toBe(0);
  expect(Number(grossPurchases.toFixed(2))).toBe(425.77);
  expect(parsed.items.find((item) => item.key === 'alcohol').amount).toBe(26.9);
  expect(parsed.lineItems.find((item) => item.name === 'ISBERGSSALLAD')).toEqual(
    expect.objectContaining({
      amount: 12.63,
      quantity: 0.635,
      unitPrice: 19.9,
      categoryKey: 'vegetables'
    })
  );
  expect(parsed.lineItems.find((item) => item.name === 'CHEESEBURGARE 2P')).toEqual(
    expect.objectContaining({ amount: 34.9, categoryKey: 'preparedMeals' })
  );
  expect(parsed.lineItems.find((item) => item.type === 'discount' && item.linkedTo === 'CHEESEBURGARE 2P')).toEqual(
    expect.objectContaining({ amount: -17.45, categoryKey: 'preparedMeals' })
  );
  expect(depositReturn).toEqual(expect.objectContaining({
    name: 'PANTRETUR',
    amount: -68,
    categoryKey: 'depositReturn',
    linkedTo: null
  }));
  expect(parsed.items.find((item) => item.key === 'depositReturn').amount).toBe(-68);
});

test('ignores trailing OCR noise without losing products or discount links', () => {
  const parsed = parseReceiptText(
    `Willys
Org. nr: 556163-2232
SPENAT 23,90
Rabatt:SALLAD -9,00 jy
CHEESEBURGARE 2P 34,90 5
Prisnedsättning 50,0% -17,45 ~
ROYAL ROLLS VANILJ 9,36 [5]
Totalt 3 varor
Totalt 41,71 SEK`,
    '2026-07-31'
  );

  expect(parsed.lineItems.map((item) => item.name)).toEqual([
    'SPENAT',
    'Rabatt:SALLAD',
    'CHEESEBURGARE 2P',
    'Prisnedsättning 50,0%',
    'ROYAL ROLLS VANILJ'
  ]);
  expect(parsed.lineItems[1]).toEqual(expect.objectContaining({
    amount: -9,
    linkedTo: 'SPENAT'
  }));
  expect(parsed.lineItems[3]).toEqual(expect.objectContaining({
    amount: -17.45,
    linkedTo: 'CHEESEBURGARE 2P'
  }));
});

test('keeps a missing amount unresolved instead of inventing a product', () => {
  const parsed = parseReceiptText(
    `Willys
Org. nr: 556163-2232
MJÖLK 20,00
Totalt 2 varor
Totalt 35,00 SEK`,
    '2026-07-31'
  );
  const reconciliation = parsed.lineItems.find((item) => item.type === 'reconciliation');

  expect(parsed.total).toBe(35);
  expect(parsed.unmatchedAmount).toBe(15);
  expect(reconciliation).toBeUndefined();
  expect(parsed.items.reduce((sum, item) => sum + item.amount, 0)).toBe(20);
});

test('keeps a known unsupported total label out of product rows', () => {
  const parsed = parseReceiptText(
    `Le Bistrot des Arts
Siret : 50350097500018 NAF 5610A
Coffee 5,00
NET TTC EUR 5,00`,
    '2026-07-31'
  );

  expect(parsed.total).toBe(5);
  expect(parsed.lineItems).toHaveLength(1);
  expect(parsed.lineItems.map((item) => item.name)).not.toContain('NET TTC EUR');
});

test('flags low-resolution receipt image dimensions', () => {
  expect(isLowResolutionReceiptImage(262, 450)).toBe(true);
  expect(isLowResolutionReceiptImage(1200, 1800)).toBe(false);
});

test.each([
  ['receipt.pdf', 'application/pdf', 'pdf'],
  ['receipt.HEIC', '', 'heic'],
  ['receipt.avif', 'image/avif', 'image'],
  ['receipt.bmp', 'image/bmp', 'image'],
  ['receipt.csv', 'text/csv', 'unsupported']
])('maps %s to the %s preparation path', (name, type, expectedKind) => {
  expect(getReceiptFileKind(new File(['receipt'], name, { type }))).toBe(expectedKind);
});

test('warns for a flat blurry image but not a high-contrast receipt pattern', () => {
  const width = 12;
  const height = 12;
  const flatPixels = new Uint8ClampedArray(width * height * 4).fill(180);
  const sharpPixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = (x + y) % 2 === 0 ? 0 : 255;
      sharpPixels[offset] = value;
      sharpPixels[offset + 1] = value;
      sharpPixels[offset + 2] = value;
      sharpPixels[offset + 3] = 255;
    }
  }

  expect(isLikelyBlurryReceiptImageData(flatPixels, width, height)).toBe(true);
  expect(isLikelyBlurryReceiptImageData(sharpPixels, width, height)).toBe(false);
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

test('parses ICA quantities, unit prices, and product-linked discounts', () => {
  const parsed = parseReceiptText(
    `ICA Kvantum Teleborg
2026-07-21 19:38
Org.nr. 559026-1367
*Kvarg vanilj 0.2% 83,64 kr
2 each * SEK 41.82/each
Mild kvarg 30kr/st -23,64 kr
Kvarg vanilj Lfri 42,45 kr`,
    '2026-07-31'
  );

  expect(parsed.total).toBe(102.45);
  expect(parsed.lineItems).toHaveLength(3);
  expect(parsed.lineItems[0]).toEqual(expect.objectContaining({
    name: '*Kvarg vanilj 0.2%',
    quantity: 2,
    unitPrice: 41.82,
    amount: 83.64,
    categoryKey: 'dairy',
    type: 'product'
  }));
  expect(parsed.lineItems[1]).toEqual(expect.objectContaining({
    name: 'Mild kvarg 30kr/st',
    amount: -23.64,
    categoryKey: 'dairy',
    type: 'discount',
    linkedTo: '*Kvarg vanilj 0.2%'
  }));
  expect(parsed.items).toEqual([
    expect.objectContaining({ key: 'dairy', amount: 102.45 })
  ]);
});

test('parses quantity details for unrelated grocery products', () => {
  const parsed = parseReceiptText(
    `Coop
2026-07-30
Org. nr: 556000-0000
PASTA 37,00
2 st x 18,50/st
APELSIN 45,00
3 x 15,00`,
    '2026-07-31'
  );

  expect(parsed.lineItems[0]).toEqual(expect.objectContaining({
    name: 'PASTA',
    quantity: 2,
    unitPrice: 18.5,
    amount: 37
  }));
  expect(parsed.lineItems[1]).toEqual(expect.objectContaining({
    name: 'APELSIN',
    quantity: 3,
    unitPrice: 15,
    amount: 45
  }));
  expect(parsed.total).toBe(82);
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

  const { container } = render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /^shopping list$/i }));
  fireEvent.click(screen.getByRole('button', { name: /add weekly basics/i }));

  expect(screen.getByText('Milk')).toBeInTheDocument();
  expect(screen.getByText('Eggs')).toBeInTheDocument();
  expect(screen.getByText('Bread')).toBeInTheDocument();
  expect(screen.getByText(/9 to buy/i)).toBeInTheDocument();
  expect(screen.queryByText(/estimated price: milk/i)).not.toBeInTheDocument();
  expect(container.querySelector('.shopping-list-rows')).toHaveAttribute('tabindex', '0');
  expect(JSON.parse(window.localStorage.getItem('cartfilter-shopping-list-user-1'))).toHaveLength(9);

  fireEvent.change(screen.getByPlaceholderText(/milk, tomatoes, rice/i), {
    target: { value: 'Mjölk' }
  });
  fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
  expect(screen.queryByText('Mjölk')).not.toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem('cartfilter-shopping-list-user-1'))).toHaveLength(9);

  fireEvent.change(screen.getByPlaceholderText(/milk, tomatoes, rice/i), {
    target: { value: 'Royal Rolls Vanilj' }
  });
  fireEvent.change(screen.getByRole('combobox', { name: /^category$/i }), {
    target: { value: 'snacks' }
  });
  fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

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

test('prefills a learned shopping item with its receipt unit price', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((queryRef, callback) => {
    if (queryRef.path?.includes('receipts')) {
      callback({
        docs: [{
          id: 'receipt-1',
          data: () => ({
            merchant: 'ICA',
            date: '2026-07-21',
            currency: 'SEK',
            items: [{ key: 'dairy', amount: 50 }],
            lineItems: [{
              name: 'Milk',
              type: 'product',
              categoryKey: 'dairy',
              quantity: 2,
              unitPrice: 25,
              amount: 50
            }],
            totalSek: 50
          })
        }]
      });
    } else {
      callback({ docs: [] });
    }
    return jest.fn();
  });

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /^shopping list$/i }));
  fireEvent.click(screen.getByText(/^suggestions from your receipts$/i));
  fireEvent.click(await screen.findByRole('button', { name: /^milk/i }));

  expect(screen.getByLabelText(/estimated price: milk/i)).toHaveValue(25);
  expect(screen.getByText(/^within budget$/i)).toBeInTheDocument();
});

test('compares editable shopping estimates with the remaining weekly budget', async () => {
  mockOnAuthStateChanged.mockImplementation((authArg, callback) => {
    callback({ email: 'user@example.com', uid: 'user-1' });
    return jest.fn();
  });
  mockOnSnapshot.mockImplementation((receiptQuery, callback) => {
    callback({ docs: [] });
    return jest.fn();
  });

  render(<CartFilter />);
  fireEvent.click(screen.getByRole('button', { name: /^shopping list$/i }));
  fireEvent.click(screen.getByRole('button', { name: /add weekly basics/i }));
  const milkPriceInput = screen.getByLabelText(/estimated price: milk/i);

  fireEvent.change(milkPriceInput, { target: { value: '100' } });
  expect(screen.getByText(/^within budget$/i)).toBeInTheDocument();

  fireEvent.change(milkPriceInput, { target: { value: '900' } });
  expect(screen.getByText(/over budget by/i)).toHaveTextContent('SEK 100.00');

  await waitFor(() => {
    const storedList = JSON.parse(
      window.localStorage.getItem('cartfilter-shopping-list-user-1')
    );
    expect(storedList.find((item) => item.name === 'Milk').estimatedPriceSek).toBe(900);
  });
});
