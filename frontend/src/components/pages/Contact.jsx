import { useState } from "react";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    setSubmitted(true);
  };

  return (
    <section className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Contact Us</h1>
      <p className="mt-3 text-gray-600">
        Need help with your order or account? Send us a message.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          name="name"
          type="text"
          placeholder="Your Name"
          value={form.name}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500"
        />
        <input
          name="email"
          type="email"
          placeholder="Your Email"
          value={form.email}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500"
        />
        <textarea
          name="message"
          rows={5}
          placeholder="Write your message..."
          value={form.message}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-red-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-black px-5 py-2.5 text-white hover:bg-gray-800 transition"
        >
          Send Message
        </button>
      </form>

      {submitted ? (
        <p className="mt-4 text-sm text-green-600">
          Message sent successfully. We will get back to you soon.
        </p>
      ) : null}
    </section>
  );
}
