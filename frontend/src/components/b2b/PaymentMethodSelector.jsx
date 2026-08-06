import { CreditCard, FileText, WalletCards } from 'lucide-react';

const icons = {
  stripe: CreditCard,
  paypal: WalletCards,
  invoice: FileText,
};

export default function PaymentMethodSelector({ providers = [], selected, onSelect }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {providers.map((provider) => {
        const Icon = icons[provider.id] || CreditCard;
        const active = selected === provider.id;
        return (
          <button
            key={provider.id}
            type="button"
            disabled={!provider.enabled}
            onClick={() => provider.enabled && onSelect(provider.id)}
            className={`min-h-[88px] rounded-2xl border p-4 text-left transition-all ${
              active
                ? 'border-accent-primary bg-accent-primary/5 text-text-primary shadow-sm'
                : 'border-stone-200 bg-white text-text-secondary hover:border-accent-primary/30 dark:border-slate-700 dark:bg-slate-900'
            } ${!provider.enabled ? 'opacity-45 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center gap-3">
              <span className={`rounded-xl p-2 ${active ? 'bg-accent-primary text-white' : 'bg-stone-100 dark:bg-slate-800'}`}>
                <Icon size={18} />
              </span>
              <div>
                <p className="text-sm font-black text-text-primary">{provider.label}</p>
                <p className="text-[11px] font-semibold text-text-secondary">
                  {provider.enabled ? 'Available' : 'Not configured'}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
