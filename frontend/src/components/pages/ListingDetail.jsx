import { useParams } from "react-router-dom";

export default function ListingDetail() {
  const { id } = useParams();

  return (
    <section className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-900">Listing Details</h1>
      <p className="mt-3 text-gray-600">Viewing details for listing id: {id}</p>

      <div className="mt-6 rounded-xl border border-gray-200 p-5">
        <h2 className="text-xl font-semibold">Restaurant Overview</h2>
        <p className="mt-3 text-gray-600">
          This page can be connected to your API to render menu, timings,
          ratings, and reviews for each listing.
        </p>
      </div>
    </section>
  );
}
