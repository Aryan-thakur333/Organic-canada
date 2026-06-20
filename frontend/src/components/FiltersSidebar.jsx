export default function FiltersSidebar({
  maxPrice,
  setMaxPrice,
  minRating,
  setMinRating
}) {
  return (
    <div className="bg-white p-4 rounded-xl shadow sticky top-20 h-fit">

      <h3 className="font-semibold mb-4">Filters</h3>

      <div className="mb-4">
        <p className="text-sm">Max Price: ${maxPrice}</p>
        <input
          type="range"
          min={0}
          max={500}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
        />
      </div>

      <div>
        <p className="text-sm">Min Rating: {minRating}</p>
        <input
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={minRating}
          onChange={(e) => setMinRating(Number(e.target.value))}
        />
      </div>

    </div>
  );
}
