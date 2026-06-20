import { Link } from "react-router-dom";

export default function SuccessSend() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16 text-center">
      <div className="mx-auto w-fit rounded-full bg-blue-100 p-4 text-3xl">📨</div>
      <h1 className="mt-4 text-3xl font-bold text-gray-900">Message Sent</h1>
      <p className="mt-3 text-gray-600">
        Thanks for contacting us. Our team will respond shortly.
      </p>
      <Link
        to="/contact"
        className="mt-6 inline-block rounded-lg bg-black px-5 py-2.5 text-white hover:bg-gray-800 transition"
      >
        Back to Contact
      </Link>
    </section>
  );
}
