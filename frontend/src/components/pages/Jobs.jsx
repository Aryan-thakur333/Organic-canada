const openings = [
  { role: "Frontend Developer", type: "Full-time", location: "Remote" },
  { role: "Delivery Operations Manager", type: "Full-time", location: "Mumbai" },
  { role: "Customer Support Executive", type: "Shift-based", location: "Delhi" },
];

export default function Jobs() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Jobs at Eatsie</h1>
      <p className="mt-3 text-gray-600">
        Join us to build the future of food delivery.
      </p>

      <div className="mt-6 space-y-4">
        {openings.map((job) => (
          <article key={job.role} className="rounded-xl border border-gray-200 p-5">
            <h2 className="text-lg font-semibold">{job.role}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {job.type} • {job.location}
            </p>
            <button className="mt-4 rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800 transition">
              Apply Now
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
