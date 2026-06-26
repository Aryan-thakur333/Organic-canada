import React, { useState } from 'react';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';

const Contact = () => {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary overflow-x-hidden">
      <Navbar />
      <main className="pt-28">
        <section className="bg-bg-secondary border-b border-stone-100 dark:border-slate-800">
          <div className="container-custom py-20">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-widest text-accent-primary">Contact</p>
              <h1 className="mt-3 text-4xl md:text-6xl font-black tracking-tight">How can we help?</h1>
              <p className="mt-6 text-lg leading-8 text-text-secondary font-medium">
                Reach Organic Canada for order support, vendor questions, or marketplace help.
              </p>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container-custom grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-4">
              <ContactCard icon={Mail} title="Email" body="support@organiccanada.ca" />
              <ContactCard icon={Phone} title="Phone" body="+1 (416) 555-0198" />
              <ContactCard icon={MapPin} title="Warehouse" body="Toronto, Ontario, Canada" />
            </div>

            <form onSubmit={handleSubmit} className="rounded-[2rem] border border-stone-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 md:p-8 shadow-sm">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
                  <MessageCircle size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black">Send a message</h2>
                  <p className="text-sm text-text-secondary">We will get back to you soon.</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" name="name" value={form.name} onChange={updateField} placeholder="Your name" />
                <Field label="Email" name="email" type="email" value={form.email} onChange={updateField} placeholder="you@example.com" />
              </div>
              <div className="mt-4">
                <label className="text-xs font-black uppercase tracking-widest text-text-secondary">Message</label>
                <textarea
                  name="message"
                  rows={6}
                  value={form.message}
                  onChange={updateField}
                  placeholder="Tell us what you need help with..."
                  className="mt-2 w-full rounded-2xl border border-stone-200 dark:border-slate-700 bg-bg-primary px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-accent-primary"
                />
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="submit" size="lg">Send Message</Button>
                {submitted && (
                  <p className="text-sm font-bold text-green-600">Message sent successfully.</p>
                )}
              </div>
            </form>
          </div>
        </section>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
};

const ContactCard = ({ icon: Icon, title, body }) => (
  <div className="rounded-2xl border border-stone-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
      <Icon size={22} />
    </div>
    <h3 className="font-black">{title}</h3>
    <p className="mt-2 text-sm font-medium text-text-secondary">{body}</p>
  </div>
);

const Field = ({ label, ...props }) => (
  <div>
    <label className="text-xs font-black uppercase tracking-widest text-text-secondary">{label}</label>
    <input
      {...props}
      className="mt-2 w-full rounded-2xl border border-stone-200 dark:border-slate-700 bg-bg-primary px-4 py-3 text-sm font-medium outline-none transition-colors focus:border-accent-primary"
    />
  </div>
);

export default Contact;
