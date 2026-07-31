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

  expect(await screen.findByText(/shopping days: 2 \/ 3/i)).toBeInTheDocument();
  expect(screen.getByText(/stores visited: 2/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/maximum shopping days per week/i), {
    target: { value: '2' }
  });

  expect(await screen.findByText(/reached your planned shopping days/i)).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole('button', { name: /import receipt/i }));
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
    meat: 89.9,
    other: 38.69
  });
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

test('adds an explicit reconciliation line when OCR misses part of the paid total', () => {
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
  expect(reconciliation).toEqual(expect.objectContaining({
    amount: 15,
    categoryKey: 'other',
    confidence: 'needs-review'
  }));
  expect(parsed.items.reduce((sum, item) => sum + item.amount, 0)).toBe(35);
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
  fireEvent.click(await screen.findByRole('button', { name: /\+ milk/i }));

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
