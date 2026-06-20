export default function MobileFilterModal({
  isOpen,
  onClose,
  maxPrice,
  setMaxPrice
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">

      <div className="bg-white w-full p-4 rounded-t-xl">

        <h3 className="font-bold mb-4">Filters</h3>

        <p>Max Price: ${maxPrice}</p>
        <input
          type="range"
          min={0}
          max={500}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
        />

        <button
          onClick={onClose}
          className="mt-4 w-full bg-black text-white py-2 rounded"
        >
          Apply
        </button>

      </div>
    </div>
  );
}
