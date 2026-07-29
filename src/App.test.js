import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CartFilter from './CartFilter';

const mockSignInWithPopup = jest.fn();
const mockOnAuthStateChanged = jest.fn();

jest.mock('./firebase', () => ({
  auth: { app: 'test-auth' }
}));

jest.mock('firebase/auth', () => ({
  GoogleAuthProvider: jest.fn(),
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  signInWithPopup: (...args) => mockSignInWithPopup(...args),
  signOut: jest.fn()
}));

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

  render(<CartFilter />);

  fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /cartfilter/i })).toBeInTheDocument();
  });

  expect(screen.getByRole('button', { name: /import receipt/i })).toBeInTheDocument();
  expect(mockSignInWithPopup).toHaveBeenCalled();
});
