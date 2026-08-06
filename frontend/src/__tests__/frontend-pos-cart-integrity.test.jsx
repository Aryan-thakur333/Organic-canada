import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import '@testing-library/jest-dom';

/**
 * Mock POS Checkout Component
 * Simulates the frontend behavior where optimistic totals must be overridden
 * by the server's authoritative native cart total.
 */
const MockPosCheckout = ({ submitCheckout }) => {
  // Optimistic UI state based on frontend multiplication (flawed pattern)
  const [cartState, setCartState] = useState({
    items: [{ title: 'Thekua', quantity: 1, displayPrice: 2000 }],
    optimisticSubtotal: 2000, 
    serverTotal: null,
    error: null,
  });

  const handleCheckout = async () => {
    try {
      // Send optimistic subtotal for confirmation logic
      const response = await submitCheckout({ confirmed_total: cartState.optimisticSubtotal });
      
      // CRITICAL: Overwrite local optimistic values with authoritative server values
      setCartState(prev => ({
        ...prev,
        serverTotal: response.native_cart.total_minor,
      }));
    } catch (err) {
      if (err.code === 'POS_TOTAL_CHANGED') {
        setCartState(prev => ({
          ...prev,
          error: err.message,
          optimisticSubtotal: err.metadata.native_cart.total_minor, // Reset optimistic to match reality
        }));
      }
    }
  };

  return (
    <div>
      <div data-testid="amount-due">
        {cartState.serverTotal !== null ? cartState.serverTotal : cartState.optimisticSubtotal}
      </div>
      {cartState.error && <div data-testid="error-message">{cartState.error}</div>}
      <button onClick={handleCheckout}>Complete Checkout</button>
    </div>
  );
};

import { vi } from 'vitest';

describe('POS Frontend Cart Integrity', () => {
  it('should replace optimistic/local POS subtotal with server/native cart totals', async () => {
    // Mock a successful backend checkout that returns authoritative totals
    const mockSubmitCheckout = vi.fn().mockResolvedValue({
      native_cart: {
        total_minor: 2100 // Tax added by server
      }
    });

    render(<MockPosCheckout submitCheckout={mockSubmitCheckout} />);

    // Initially displays optimistic total (2000)
    expect(screen.getByTestId('amount-due').textContent).toBe('2000');

    // Click checkout
    fireEvent.click(screen.getByText('Complete Checkout'));

    // Wait for the server authoritative response to replace the local total
    await waitFor(() => {
      expect(screen.getByTestId('amount-due').textContent).toBe('2100');
    });

    expect(mockSubmitCheckout).toHaveBeenCalledWith({ confirmed_total: 2000 });
  });

  it('should handle POS_TOTAL_CHANGED and update amount due', async () => {
    // Mock backend rejecting the optimistic total due to a price change
    const mockSubmitCheckout = vi.fn().mockRejectedValue({
      code: 'POS_TOTAL_CHANGED',
      message: 'The cart total changed before checkout. Please review the updated total.',
      metadata: {
        native_cart: {
          total_minor: 2500 // Price increased on backend
        }
      }
    });

    render(<MockPosCheckout submitCheckout={mockSubmitCheckout} />);

    expect(screen.getByTestId('amount-due').textContent).toBe('2000');

    fireEvent.click(screen.getByText('Complete Checkout'));

    await waitFor(() => {
      // The component should display the error
      expect(screen.getByTestId('error-message').textContent).toBe('The cart total changed before checkout. Please review the updated total.');
      // The amount due should be updated to the server's correct total
      expect(screen.getByTestId('amount-due').textContent).toBe('2500');
    });
  });
});
