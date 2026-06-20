import React from 'react';

const Skeleton = ({ className = '', ...props }) => {
  return (
    <div 
      className={`animate-pulse bg-stone-200 dark:bg-slate-800 rounded-lg ${className}`}
      {...props}
    />
  );
};

export const ProductCardSkeleton = () => (
  <div className="flex flex-col gap-3">
    <Skeleton className="aspect-square rounded-3xl" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/4" />
    <div className="flex gap-2">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="h-10 flex-1 rounded-full" />
    </div>
  </div>
);

export default Skeleton;
