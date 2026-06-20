export default function LoadingSpinner({
  size = "md",
  label = "Loading...",
  fullScreen = false,
}) {
  const sizeClass = {
    sm: "h-5 w-5 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-4",
  }[size] || "h-8 w-8 border-2";

  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClass} animate-spin rounded-full border-gray-300 border-t-red-500`}
      />
      {label ? <p className="text-sm text-gray-600">{label}</p> : null}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        {content}
      </div>
    );
  }

  return <div className="w-full py-6 flex items-center justify-center">{content}</div>;
}
