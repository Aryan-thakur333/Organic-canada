import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import B2BQuotePayment from './B2BQuotePayment';

const mockGetQuote = vi.fn();
const mockGetQuotePaymentOptions = vi.fn();
const mockRequestQuoteInvoicePayment = vi.fn();

vi.mock('../services/b2bApi', () => ({
  b2bApi: {
    getQuote: (...args) => mockGetQuote(...args),
    getQuotePaymentOptions: (...args) => mockGetQuotePaymentOptions(...args),
    requestQuoteInvoicePayment: (...args) => mockRequestQuoteInvoicePayment(...args),
  },
}));

const mockShowToast = vi.fn();
vi.mock('../hooks/useToast', () => ({
  default: () => ({ showToast: mockShowToast }),
}));

vi.mock('../components/layout/Navbar', () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock('../components/Footer', () => ({ default: () => <footer data-testid="footer" /> }));
vi.mock('../components/MobileNav', () => ({ default: () => <nav data-testid="mobile-nav" /> }));
vi.mock('../components/common/Button', () => ({
  default: ({ children, onClick, disabled, isLoading, ...props }) => (
    <button onClick={onClick} disabled={disabled || isLoading} {...props}>{children}</button>
  ),
}));
vi.mock('../components/b2b/StripePaymentElement', () => ({ default: () => <div data-testid="stripe-element" /> }));
vi.mock('../components/b2b/PayPalButtonsWrapper', () => ({ default: () => <div data-testid="paypal-buttons" /> }));

vi.mock('lucide-react', () => {
  const Icon = (props) => <span {...props} />;
  return {
    ArrowLeft: Icon,
    CheckCircle2: Icon,
    FileText: Icon,
    Loader2: Icon,
    Package: Icon,
    RefreshCw: Icon,
    CreditCard: Icon,
    WalletCards: Icon,
  };
});

function renderPaymentPage() {
  return render(
    <MemoryRouter initialEntries={['/b2b/quotes/quote_123/checkout']}>
      <Routes>
        <Route path="/b2b/quotes/:id/checkout" element={<B2BQuotePayment />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('B2BQuotePayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQuote.mockResolvedValue({
      quote: {
        id: 'quote_123',
        status: 'accepted',
        payment_state: 'payment_required',
        original_total: 5000,
        negotiated_total: 3996,
        currency_code: 'cad',
        company_name: 'Acme Organic Farms',
        offer_version: 2,
        items: [
          {
            id: 'item_1',
            title: 'Organic Apples',
            sku: 'ORG-APP-12',
            quantity: 4,
            original_unit_price: 1250,
            requested_unit_price: 1250,
            negotiated_unit_price: 999,
            unit_price: 999,
            line_total: 3996,
            negotiated_line_total: 3996,
          },
        ],
      },
    });
    mockGetQuotePaymentOptions.mockResolvedValue({
      quote: {
        quote_id: 'quote_123',
        amount: 3996,
        negotiated_total: 3996,
        original_total: 5000,
        currency_code: 'cad',
        payment_state: 'payment_required',
        offer_version: 2,
      },
      providers: [
        { id: 'stripe', label: 'Credit card', enabled: false },
        { id: 'paypal', label: 'PayPal', enabled: false },
        { id: 'invoice', label: 'Invoice / bank transfer', enabled: true },
      ],
    });
    mockRequestQuoteInvoicePayment.mockResolvedValue({
      payment_state: 'awaiting_remittance',
      reference: 'B2B-quote_123',
    });
  });

  it('renders the negotiated backend amount as amount due', async () => {
    renderPaymentPage();

    await waitFor(() => {
      expect(screen.getByText('Quote Checkout')).toBeInTheDocument();
    });

    expect(screen.getByText('Acme Organic Farms | Quote #UOTE_123')).toBeInTheDocument();
    expect(screen.getByText('Organic Apples')).toBeInTheDocument();
    expect(screen.getByText('ORG-APP-12')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === 'Qty 4 | Original CA$12.50 | Negotiated CA$9.99')).toBeInTheDocument();
    expect(screen.getAllByText('CA$39.96').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('CA$50.00')).toBeInTheDocument();
    expect(screen.getByText('CA$10.04')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === 'v2')).toBeInTheDocument();
  });

  it('starts invoice payment without treating it as paid', async () => {
    renderPaymentPage();

    await waitFor(() => {
      expect(screen.getAllByText('Invoice / bank transfer').length).toBeGreaterThanOrEqual(1);
    });

    await userEvent.click(screen.getByText('Request Invoice Instructions'));

    expect(mockRequestQuoteInvoicePayment).toHaveBeenCalledWith('quote_123');
    expect(mockShowToast).toHaveBeenCalledWith('Invoice payment instructions requested.', 'success');
  });

  it('uses final payable for exact negotiated quote checkout totals', async () => {
    mockGetQuote.mockResolvedValueOnce({
      quote: {
        id: 'quote_123',
        status: 'accepted',
        payment_state: 'payment_required',
        original_total: 100,
        negotiated_total: 90,
        negotiated_subtotal: 90,
        commission_amount: 4,
        commission_type: 'percentage',
        commission_value: 4,
        final_payable_total: 94,
        total: 94,
        currency_code: 'cad',
        company_name: 'Acme Organic Farms',
        offer_version: 2,
        items: [
          {
            id: 'item_1',
            title: 'Fresh Bananas',
            sku: 'B2B-BANANAS-50',
            quantity: 50,
            original_unit_price: 2,
            requested_unit_price: 2,
            negotiated_unit_price: 2,
            unit_price: 2,
            line_total: 100,
            negotiated_line_total: 90,
          },
        ],
      },
    });
    mockGetQuotePaymentOptions.mockResolvedValueOnce({
      quote: {
        quote_id: 'quote_123',
        amount: 94,
        negotiated_total: 90,
        commission_amount: 4,
        final_payable_total: 94,
        original_total: 100,
        currency_code: 'cad',
        payment_state: 'payment_required',
        offer_version: 2,
      },
      providers: [
        { id: 'invoice', label: 'Invoice / bank transfer', enabled: true },
      ],
    });

    renderPaymentPage();

    await waitFor(() => {
      expect(screen.getByText('Fresh Bananas')).toBeInTheDocument();
    });

    expect(screen.getByText((_, element) => element?.textContent === 'Qty 50 | Original CA$0.02 | Negotiated CA$0.02')).toBeInTheDocument();
    expect(screen.getAllByText('CA$1.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CA$0.90').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CA$0.04').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CA$0.94').length).toBeGreaterThan(0);
  });
});
