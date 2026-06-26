import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Apple,
  Beef,
  Carrot,
  CheckCircle2,
  Clock,
  CreditCard,
  Leaf,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Store,
  Truck,
  Wheat,
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';

const fallbackImage = 'https://images.unsplash.com/photo-1523741543316-beb7fc7023d8?auto=format&fit=crop&w=1200&q=80';

const heroSlides = [
  {
    title: 'Organic farms',
    caption: 'Trusted farm partners focused on seasonal freshness.',
    image: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'Fresh vegetables',
    caption: 'Quality produce selected for daily grocery baskets.',
    image: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'Grocery marketplace',
    caption: 'Verified sellers, clear product availability, one checkout.',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=85',
  },
  {
    title: 'Farm-to-home delivery',
    caption: 'Fresh essentials prepared for reliable doorstep delivery.',
    image: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=1200&q=85',
  },
];

const sectionImages = {
  story: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=2200&q=85',
  categories: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=2200&q=85',
  quality: 'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=2200&q=85',
  marketplace: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=2200&q=85',
  why: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=2200&q=85',
  cta: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=2200&q=85',
};

const offerCards = [
  {
    title: 'Fresh Fruits',
    description: 'Seasonal apples, berries, grapes, mangoes, and everyday fruit staples.',
    icon: Apple,
    image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=800&q=80',
    tone: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-300',
  },
  {
    title: 'Organic Vegetables',
    description: 'Crisp greens, carrots, tomatoes, potatoes, and fresh cooking essentials.',
    icon: Carrot,
    image: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?auto=format&fit=crop&w=800&q=80',
    tone: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-300',
  },
  {
    title: 'Dairy Products',
    description: 'Milk, yogurt, cheese, butter, paneer, and chilled daily essentials.',
    icon: PackageCheck,
    image: 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?auto=format&fit=crop&w=800&q=80',
    tone: 'bg-sky-100 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300',
  },
  {
    title: 'Bakery Items',
    description: 'Bread, croissants, sourdough, muffins, and organic sweet treats.',
    icon: Wheat,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  },
  {
    title: 'Meat & Seafood',
    description: 'Selected protein options from verified sellers and trusted suppliers.',
    icon: Beef,
    image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=800&q=80',
    tone: 'bg-rose-100 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300',
  },
  {
    title: 'Fast Delivery',
    description: 'Order groceries from one platform and track delivery to your home.',
    icon: Truck,
    image: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?auto=format&fit=crop&w=800&q=80',
    tone: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300',
  },
];

const reasons = [
  { title: '100% Organic Focus', description: 'A storefront experience centered around organic and better-for-you groceries.', icon: Leaf },
  { title: 'Fresh Daily Stock', description: 'Availability is checked so customers can shop with confidence.', icon: Clock },
  { title: 'Trusted Vendors', description: 'Verified sellers and farms manage their own product catalog and inventory.', icon: ShieldCheck },
  { title: 'Secure Payments', description: 'Checkout is designed for safe, reliable, marketplace-ready transactions.', icon: CreditCard },
  { title: 'Fast Delivery', description: 'Fresh orders move from seller preparation to delivery with clear status updates.', icon: Truck },
  { title: 'Easy Order Tracking', description: 'Customers can follow their orders from confirmation through fulfillment.', icon: MapPin },
];

const About = () => {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 3800);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden">
      <Navbar />

      <main className="pt-28">
        <section
          className="relative overflow-hidden border-b border-stone-100 bg-stone-950 text-white dark:border-slate-800"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(15, 23, 18, 0.88) 0%, rgba(15, 23, 18, 0.72) 48%, rgba(15, 23, 18, 0.38) 100%), url(${sectionImages.story})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-stone-950/20" />
          <div className="container-custom relative grid min-h-[720px] items-center gap-12 py-16 md:grid-cols-[1.02fr_0.98fr] md:py-24">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-black uppercase tracking-widest text-white backdrop-blur">
                <Leaf size={16} /> Organic Marketplace
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white">
                About Organic Canada
              </h1>
              <p className="mt-6 max-w-3xl text-base md:text-xl leading-8 text-white/85 font-medium">
                Organic Canada is a fresh grocery marketplace connecting customers with trusted farms,
                local producers, and verified grocery sellers. Our mission is to make organic fruits,
                vegetables, dairy, bakery products, meat, seafood, and daily essentials easier to discover,
                order, and receive at home.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/shop">
                  <Button size="lg" className="w-full sm:w-auto">Shop Now</Button>
                </Link>
                <Link to="/vendor/register">
                  <Button variant="secondary" size="lg" className="w-full sm:w-auto bg-white/95">
                    Become a Seller
                  </Button>
                </Link>
              </div>
            </div>

            <HeroSlider activeSlide={activeSlide} setActiveSlide={setActiveSlide} />
          </div>
        </section>

        <PhotoBand
          image={sectionImages.story}
          eyebrow="Our Story"
          title="Built around a practical farm-to-home grocery model."
          body={[
            'Organic Canada was created to make fresh groceries easier to trust. Instead of asking customers to search across scattered sellers, the marketplace brings verified farms, producers, and grocery vendors into one clean storefront.',
            'The goal is simple: help households discover fresh food, understand what is available, and receive their order without losing confidence in quality. From organic produce to bakery, dairy, meat, seafood, and essentials, every part of the experience is designed around freshness, clarity, and customer trust.',
          ]}
          align="left"
        />

        <section
          className="relative overflow-hidden py-20"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.90), rgba(255,255,255,0.96)), url(${sectionImages.categories})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="container-custom relative">
            <div className="mb-10 max-w-3xl">
              <p className="text-xs font-black uppercase tracking-widest text-accent-primary">What We Offer</p>
              <h2 className="mt-3 text-3xl md:text-4xl font-black">Fresh categories, ready for the week.</h2>
              <p className="mt-4 text-text-secondary font-medium leading-7">
                Shop across everyday grocery departments with the same marketplace experience: clear product
                details, seller-backed inventory, and a cart that keeps ordering simple.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {offerCards.map((card) => (
                <OfferCard key={card.title} {...card} />
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-bg-primary">
          <div className="container-custom grid gap-8 lg:grid-cols-2">
            <InfoPanel
              image={sectionImages.quality}
              eyebrow="Product Quality"
              title="Sourced, checked, and prepared for delivery readiness."
              body="Products are sourced from verified sellers and farms, then checked for freshness, quality, inventory availability, and delivery readiness. Organic Canada keeps the storefront experience consistent so customers can trust product details, pricing, availability, and fulfillment updates."
              icon={CheckCircle2}
            />
            <InfoPanel
              image={sectionImages.marketplace}
              eyebrow="Marketplace Model"
              title="One shopping experience powered by verified sellers."
              body="Customers order from one platform while verified vendors manage their own products and inventory. Organic Canada handles the customer experience, checkout flow, order tracking, marketplace trust, and storefront presentation that helps sellers reach more households."
              icon={Store}
            />
          </div>
        </section>

        <section
          className="relative overflow-hidden py-20 text-white"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(23, 31, 24, 0.90), rgba(23, 31, 24, 0.74)), url(${sectionImages.why})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="container-custom relative">
            <div className="mb-10 max-w-3xl">
              <p className="text-xs font-black uppercase tracking-widest text-white/70">Why Choose Us</p>
              <h2 className="mt-3 text-3xl md:text-4xl font-black text-white">A premium grocery marketplace made for trust.</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {reasons.map(({ title, description, icon: Icon }) => (
                <div key={title} className="rounded-2xl border border-white/15 bg-white/10 p-6 shadow-xl backdrop-blur">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white">
                    <Icon size={22} />
                  </div>
                  <h3 className="font-black text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/75 font-medium">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="relative overflow-hidden py-20"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(139, 69, 19, 0.94), rgba(82, 50, 28, 0.80)), url(${sectionImages.cta})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className="container-custom relative">
            <div className="rounded-[2rem] border border-white/20 bg-white/10 p-8 md:p-12 text-white shadow-2xl backdrop-blur">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <h2 className="text-3xl md:text-4xl font-black text-white">Ready for fresher groceries?</h2>
                  <p className="mt-4 text-white/85 font-medium leading-7">
                    Shop organic essentials or become a verified seller on Organic Canada.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link to="/shop">
                    <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                      Shop Now
                    </Button>
                  </Link>
                  <Link to="/vendor/register">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto border-white text-white hover:bg-white hover:text-accent-primary">
                      Become a Seller
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

const HeroSlider = ({ activeSlide, setActiveSlide }) => (
  <div className="relative mx-auto w-full max-w-lg">
    <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur">
      {heroSlides.map((slide, index) => (
        <div
          key={slide.title}
          className={`absolute inset-3 transition-all duration-700 ease-out ${
            index === activeSlide
              ? 'translate-x-0 opacity-100'
              : index < activeSlide
                ? '-translate-x-6 opacity-0'
                : 'translate-x-6 opacity-0'
          }`}
        >
          <img
            src={slide.image}
            alt={slide.title}
            onError={(event) => {
              event.currentTarget.src = fallbackImage;
            }}
            className="h-full w-full rounded-[1.5rem] object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-b-[1.5rem] bg-gradient-to-t from-stone-950/85 to-transparent p-5">
            <p className="text-lg font-black text-white">{slide.title}</p>
            <p className="mt-1 text-sm font-medium text-white/75">{slide.caption}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-5 flex items-center justify-center gap-2">
      {heroSlides.map((slide, index) => (
        <button
          key={slide.title}
          type="button"
          aria-label={`Show ${slide.title}`}
          onClick={() => setActiveSlide(index)}
          className={`h-2.5 rounded-full transition-all ${
            index === activeSlide ? 'w-8 bg-white' : 'w-2.5 bg-white/40 hover:bg-white/70'
          }`}
        />
      ))}
    </div>
  </div>
);

const PhotoBand = ({ image, eyebrow, title, body, align = 'left' }) => (
  <section
    className="relative overflow-hidden py-20 text-white"
    style={{
      backgroundImage: `linear-gradient(90deg, rgba(23, 31, 24, 0.88), rgba(23, 31, 24, 0.58)), url(${image})`,
      backgroundPosition: 'center',
      backgroundSize: 'cover',
    }}
  >
    <div className={`container-custom relative grid gap-8 ${align === 'right' ? 'lg:grid-cols-[0.85fr_1.15fr]' : 'lg:grid-cols-[1.15fr_0.85fr]'}`}>
      <div className="rounded-[2rem] border border-white/15 bg-white/10 p-8 md:p-10 shadow-2xl backdrop-blur">
        <p className="text-xs font-black uppercase tracking-widest text-white/70">{eyebrow}</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-black text-white">{title}</h2>
        <div className="mt-6 space-y-4">
          {body.map((paragraph) => (
            <p key={paragraph} className="text-base leading-8 text-white/82 font-medium">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const OfferCard = ({ title, description, icon: Icon, image, tone }) => (
  <div className="group relative min-h-[240px] overflow-hidden rounded-2xl border border-stone-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-premium dark:border-slate-700 dark:bg-slate-800">
    <img
      src={image}
      alt={title}
      onError={(event) => {
        event.currentTarget.src = fallbackImage;
      }}
      className="absolute inset-0 h-full w-full object-cover opacity-22 transition-transform duration-500 group-hover:scale-105"
    />
    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/88 to-white/72 dark:from-slate-900 dark:via-slate-900/88 dark:to-slate-900/72" />
    <div className="relative flex h-full flex-col justify-end">
      <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
        <Icon size={26} />
      </div>
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-text-secondary font-medium">{description}</p>
    </div>
  </div>
);

const InfoPanel = ({ image, eyebrow, title, body, icon: Icon }) => (
  <div className="overflow-hidden rounded-[2rem] border border-stone-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <div className="relative aspect-[16/9] overflow-hidden bg-stone-100 dark:bg-slate-900">
      <img
        src={image}
        alt={title}
        onError={(event) => {
          event.currentTarget.src = fallbackImage;
        }}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/45 to-transparent" />
    </div>
    <div className="p-8">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
        <Icon size={26} />
      </div>
      <p className="text-xs font-black uppercase tracking-widest text-accent-primary">{eyebrow}</p>
      <h3 className="mt-3 text-2xl font-black">{title}</h3>
      <p className="mt-4 leading-7 text-text-secondary font-medium">{body}</p>
    </div>
  </div>
);

export default About;
