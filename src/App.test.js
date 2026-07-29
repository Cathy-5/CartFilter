import { fireEvent, render, screen } from '@testing-library/react';
import CartFilter from './CartFilter';

test('renders localized receipt import after sign in', () => {
  render(<CartFilter />);

  fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

  expect(screen.getByRole('heading', { name: /cartfilter/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /import receipt/i })).toBeInTheDocument();
});
