import { BRAND } from "../../config/branding";



export default function OrganicPromoBar() {

  return (

    <div className="border-b border-stone-200/90 bg-organic-pageMuted py-1.5 text-organic-primary">

      <div className="container flex flex-col items-center justify-center gap-1 px-2 text-center sm:flex-row sm:justify-between sm:text-left">

        <p className="text-[11px] font-semibold leading-snug tracking-wide text-organic-primary sm:text-xs md:text-[13px]">

          {BRAND.promo}

        </p>

        <button

          type="button"

          className="shrink-0 rounded-full border border-organic-primary/25 bg-white px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-organic-primary shadow-sm transition hover:border-organic-primary/50 hover:bg-organic-headerBg sm:py-1 sm:text-[11px]"

        >

          Download app

        </button>

      </div>

    </div>

  );

}

