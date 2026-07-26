import { render, screen } from '@testing-library/react';
import CartFilter from './CartFilter';

test('renders learn react link', () => {
  render(<CartFilter />);
  const linkElement = screen.getByText(/learn react/i);
  expect(linkElement).toBeInTheDocument();
});
