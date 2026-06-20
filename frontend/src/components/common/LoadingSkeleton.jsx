export default function LoadingSkeleton({ rows = 4 }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-4 w-full rounded bg-gray-200" />
      ))}
    </div>
  );
}
