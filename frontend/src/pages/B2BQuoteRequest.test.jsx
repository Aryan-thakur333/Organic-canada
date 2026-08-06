import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import B2BQuoteRequest from './B2BQuoteRequest';

const mockGetCompany = vi.fn();
const mockGetB2BProducts = vi.fn();
const mockSubmitQuote = vi.fn();

vi.mock('../services/b2bApi', () => ({
  b2bApi: {
    getCompany: (...args) => mockGetCompany(...args),
    getB2BProducts: (...args) => mockGetB2BProducts(...args),
    submitQuote: (...args) => mockSubmitQuote(...args),
  },
}));

vi.mock('../lib/medusa/regions', () => ({
  resolveDefaultRegionContext: vi.fn().mockResolvedValue({
    region_id: 'reg_canada',
    currency_code: 'cad',
    country_code: 'ca',
  }),
}));

vi.mock('../config/publicEnv', () => ({
  getDefaultSalesChannelIdFromEnv: () => 'sc_b2b',
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

vi.mock('lucide-react', () => {
  const Icon = (props) => <span {...props} />;
  return {
    AlertCircle: Icon,
    Building2: Icon,
    CheckCircle2: Icon,
    ChevronLeft: Icon,
    DollarSign: Icon,
    FileText: Icon,
    Hash: Icon,
    Loader2: Icon,
    Package: Icon,
    Plus: Icon,
    Scale: Icon,
    Search: Icon,
    Send: Icon,
    ShoppingBag: Icon,
    Trash2: Icon,
    X: Icon,
  };
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderRequest() {
  return render(
    <MemoryRouter initialEntries={['/b2b/request-quote']}>
      <Routes>
        <Route path="/b2b/request-quote" element={<><B2BQuoteRequest /><LocationProbe /></>} />
        <Route path="/b2b/quotes/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('B2BQuoteRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCompany.mockResolvedValue({
      company: {
        id: 'comp_123',
        company_name: 'Acme Organic Farms',
        status: 'approved',
        credit_limit: 100000,
      },
    });
    mockGetB2BProducts.mockResolvedValue({
      products: [
        {
          id: 'prod_carrots',
          title: 'Organic Carrots',
          variants: [
            {
              id: 'variant_carrots',
              title: 'Default',
              sku: 'EATSIE-ORGANIC-CARROTS',
              b2b_price: 55,
              b2b_currency_code: 'cad',
              price_set_id: 'pset_carrots',
              price_source: 'b2b_price_list_override',
            },
          ],
        },
      ],
    });
    mockSubmitQuote.mockResolvedValue({
      quote: { id: 'quote_audit', status: 'pending_merchant' },
    });
  });

  it('Quick Add preserves variant identity and submits variant rows without trusting frontend price', async () => {
    const user = userEvent.setup();
    renderRequest();

    await screen.findByText('Wholesale Quote.');
    await user.click(screen.getByRole('button', { name: /quick add/i }));
    expect(mockGetB2BProducts).toHaveBeenCalledWith(expect.objectContaining({
      region_id: 'reg_canada',
      currency_code: 'cad',
      country_code: 'ca',
      sales_channel_id: 'sc_b2b',
    }));
    await user.click(await screen.findByRole('button', { name: /organic carrots/i }));

    expect(screen.getByDisplayValue('Organic Carrots')).toBeInTheDocument();
    expect(screen.getByDisplayValue('EATSIE-ORGANIC-CARROTS')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.55')).toBeInTheDocument();

    const qtyInputs = screen.getAllByDisplayValue('1');
    const catalogQtyInput = qtyInputs[qtyInputs.length - 1];
    fireEvent.change(catalogQtyInput, { target: { value: '25' } });

    expect(screen.getAllByText('CA$13.75').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /submit quote request/i }));

    await waitFor(() => expect(mockSubmitQuote).toHaveBeenCalledTimes(1));
    expect(mockSubmitQuote).toHaveBeenCalledWith(expect.objectContaining({
      currency_code: 'cad',
      region_id: 'reg_canada',
      country_code: 'ca',
      sales_channel_id: 'sc_b2b',
      items: [
        {
          source_type: 'variant',
          product_id: 'prod_carrots',
          variant_id: 'variant_carrots',
          quantity: 25,
          displayed_unit_price_minor: 55,
        },
      ],
    }), expect.anything());
  });
});
