import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import B2BQuoteDetails from './B2BQuoteDetails';

const mockGetQuote = vi.fn();
const mockAcceptQuote = vi.fn();
const mockRejectQuote = vi.fn();
const mockGetQuoteMessages = vi.fn();
const mockSendQuoteMessage = vi.fn();
const mockGetQuotePaymentInstructions = vi.fn();

vi.mock('../services/b2bApi', () => ({
  b2bApi: {
    getQuote: (...args) => mockGetQuote(...args),
    acceptQuote: (...args) => mockAcceptQuote(...args),
    rejectQuote: (...args) => mockRejectQuote(...args),
    getQuoteMessages: (...args) => mockGetQuoteMessages(...args),
    sendQuoteMessage: (...args) => mockSendQuoteMessage(...args),
    getQuotePaymentInstructions: (...args) => mockGetQuotePaymentInstructions(...args),
  },
}));

const mockListAddresses = vi.fn();
const mockGetCurrentCustomer = vi.fn();

vi.mock('../services/medusa/authService', () => ({
  authService: {
    listAddresses: (...args) => mockListAddresses(...args),
    getCurrentCustomer: (...args) => mockGetCurrentCustomer(...args),
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
  default: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('lucide-react', () => {
  const Icon = (props) => <span {...props} />;
  return {
    AlertCircle: Icon,
    Calendar: Icon,
    CheckCircle2: Icon,
    ChevronLeft: Icon,
    Clock: Icon,
    CreditCard: Icon,
    FileText: Icon,
    Package: Icon,
    RefreshCw: Icon,
    Scale: Icon,
    Send: Icon,
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderDetails() {
  return render(
    <MemoryRouter initialEntries={['/b2b/quotes/quote_123']}>
      <Routes>
        <Route path="/b2b/quotes/:id" element={<><B2BQuoteDetails /><LocationProbe /></>} />
        <Route path="/b2b/quotes/:id/checkout" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

const baseQuote = {
  id: 'quote_123',
  status: 'pending_customer',
  payment_state: 'not_required',
  original_total: 5000,
  negotiated_total: 3996,
  total: 3996,
  currency_code: 'cad',
  offer_version: 2,
  items: [
    {
      id: 'item_1',
      title: 'Organic Apples',
      quantity: 4,
      original_unit_price: 1250,
      requested_unit_price: 1250,
      negotiated_unit_price: 999,
      unit_price: 999,
      total: 3996,
      line_total: 3996,
    },
  ],
};

describe('B2BQuoteDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQuote.mockResolvedValue({
      quote: baseQuote,
    });
    mockAcceptQuote.mockResolvedValue({ quote: { id: 'quote_123', status: 'accepted' } });
    mockRejectQuote.mockResolvedValue({ quote: { id: 'quote_123', status: 'customer_rejected' } });
    mockGetQuoteMessages.mockResolvedValue({
      messages: [
        { id: 'msg_1', quote_id: 'quote_123', sender_type: 'customer', message: 'Can you offer better pricing?', created_at: '2026-08-01T10:00:00Z' },
        { id: 'msg_2', quote_id: 'quote_123', sender_type: 'admin', message: 'We can offer this final total.', created_at: '2026-08-01T10:01:00Z' },
      ],
    });
    mockSendQuoteMessage.mockResolvedValue({
      message: { id: 'msg_3', quote_id: 'quote_123', sender_type: 'customer', message: 'Thanks.', created_at: '2026-08-01T10:02:00Z' },
    });
    mockGetQuotePaymentInstructions.mockResolvedValue({
      amount: 3996,
      currency_code: 'cad',
      reference: 'B2B-QUOTE123',
      instructions: 'Include reference B2B-QUOTE123.',
    });
    mockListAddresses.mockResolvedValue({
      addresses: [
        { id: 'addr_1', address_1: '123 Main St', city: 'Toronto', postal_code: 'M5V 2T6', country_code: 'ca', is_default_shipping: true }
      ]
    });
    mockGetCurrentCustomer.mockResolvedValue({
      customer: { id: 'cus_123', email: 'customer@eatsie.test' }
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('accepts a final offer for online payment and routes to checkout page', async () => {
    renderDetails();

    await waitFor(() => expect(screen.getByText('Accept Final Offer')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Accept Final Offer'));

    expect(mockAcceptQuote).toHaveBeenCalledWith('quote_123', expect.objectContaining({
      offer_version: 2,
      settlement_mode: 'online',
    }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/b2b/quotes/quote_123/checkout'));
  });

  it('renders final offer actions below the quote chat', async () => {
    renderDetails();

    const chatInput = await screen.findByPlaceholderText('Write a message...');
    const finalOffer = await screen.findByText('Final Offer');

    expect(Boolean(chatInput.compareDocumentPosition(finalOffer) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.getByText('Accept Final Offer')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
    expect(screen.queryByText('Accept Invoice Terms')).not.toBeInTheDocument();
  });

  it('renders persisted quote messages and sends a customer message', async () => {
    renderDetails();

    await waitFor(() => expect(screen.getByText('Can you offer better pricing?')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('We can offer this final total.')).toBeInTheDocument());

    await userEvent.type(screen.getByPlaceholderText('Write a message...'), 'Thanks.');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    expect(mockSendQuoteMessage).toHaveBeenCalledWith('quote_123', { message: 'Thanks.' });
  });

  it('preserves typed chat text across background message polling', async () => {
    // shouldAdvanceTime:true lets Testing Library's findBy* resolve while
    // still intercepting setInterval so vi.advanceTimersByTimeAsync controls polling.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime
    });
    renderDetails();

    const input = await screen.findByPlaceholderText('Write a message...');
    await user.type(input, 'hello merchant');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(input).toHaveValue('hello merchant');
    expect(mockGetQuoteMessages).toHaveBeenCalledTimes(2);
  });

  it('keeps quote page visible during background quote polling', async () => {
    // shouldAdvanceTime:true keeps Testing Library working while
    // setInterval is under fake-timer control.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderDetails();

    await screen.findByText('Organic Apples');
    mockGetQuote.mockImplementationOnce(() => new Promise(() => {}));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText('Organic Apples')).toBeInTheDocument();
    expect(screen.queryByText('Could not load quote')).not.toBeInTheDocument();
  });

  it('clears chat input only after a successful send', async () => {
    let resolveSend;
    mockSendQuoteMessage.mockReturnValueOnce(new Promise((resolve) => {
      resolveSend = resolve;
    }));
    const user = userEvent.setup();
    renderDetails();

    const input = await screen.findByPlaceholderText('Write a message...');
    await user.type(input, 'Thanks.');
    await user.click(screen.getByRole('button', { name: /Send/i }));

    expect(input).toHaveValue('Thanks.');

    await act(async () => {
      resolveSend({
        message: { id: 'msg_3', quote_id: 'quote_123', sender_type: 'customer', message: 'Thanks.', created_at: '2026-08-01T10:02:00Z' },
      });
    });

    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('renders pending merchant original 649 and negotiated 640 from structured totals', async () => {
    mockGetQuote.mockResolvedValueOnce({
      quote: {
        ...baseQuote,
        status: 'pending_merchant',
        original_total: 64900,
        requested_total: 64900,
        negotiated_total: 64000,
        total: 64000,
        items: [
          {
            id: 'item_1',
            title: 'Organic Milk',
            sku: 'EATSIE-ORGANIC-MILK',
            quantity: 100,
            original_unit_price: 649,
            requested_unit_price: 649,
            negotiated_unit_price: 640,
            unit_price: 640,
            line_total: 64000,
            total: 64000,
          },
        ],
      },
    });

    renderDetails();

    await waitFor(() => expect(screen.getByText('Organic Milk')).toBeInTheDocument());
    expect(screen.getByText('CA$649.00')).toBeInTheDocument();
    expect(screen.getAllByText('CA$640.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('Accept Final Offer')).not.toBeInTheDocument();
  });

  it('renders accept CTA for pending customer offers', async () => {
    renderDetails();

    await waitFor(() => expect(screen.getByText('Accept Final Offer')).toBeInTheDocument());
  });

  it('does not use chat text containing 640 as the negotiated price', async () => {
    mockGetQuote.mockResolvedValueOnce({
      quote: {
        ...baseQuote,
        original_total: 64900,
        requested_total: 64900,
        negotiated_total: 64900,
        total: 64900,
        items: [
          {
            id: 'item_1',
            title: 'Organic Milk',
            quantity: 100,
            original_unit_price: 649,
            requested_unit_price: 649,
            negotiated_unit_price: 649,
            unit_price: 649,
            line_total: 64900,
            total: 64900,
          },
        ],
      },
    });
    mockGetQuoteMessages.mockResolvedValueOnce({
      messages: [
        { id: 'msg_1', quote_id: 'quote_123', sender_type: 'admin', message: 'I will give you 640', created_at: '2026-08-01T10:01:00Z' },
      ],
    });

    renderDetails();

    await waitFor(() => expect(screen.getByText('I will give you 640')).toBeInTheDocument());
    expect(screen.getAllByText('CA$649.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('CA$640.00')).not.toBeInTheDocument();
  });

  it('renders exact negotiated subtotal, b2b fee, and final payable from structured fields', async () => {
    mockGetQuote.mockResolvedValueOnce({
      quote: {
        ...baseQuote,
        original_total: 100,
        negotiated_total: 90,
        negotiated_subtotal: 90,
        commission_amount: 4,
        commission_type: 'percentage',
        commission_value: 4,
        final_payable_total: 94,
        total: 94,
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
            total: 100,
          },
        ],
      },
    });

    renderDetails();

    await waitFor(() => expect(screen.getByText('Fresh Bananas')).toBeInTheDocument());
    expect(screen.getAllByText('CA$1.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CA$0.90').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CA$0.04').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CA$0.94').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/b2b fee \(4%\)/i).length).toBeGreaterThan(0);
  });
});
