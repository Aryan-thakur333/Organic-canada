import React from 'react';

const AuthStepProgress = ({ currentStep, totalSteps }) => {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;

        return (
          <React.Fragment key={index}>
            <div 
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isActive 
                  ? 'bg-[#594236] text-white' 
                  : isCompleted 
                    ? 'bg-[#C16D45] text-white' 
                    : 'bg-stone-100 text-stone-400'
              }`}
            >
              {stepNumber}
            </div>
            {index < totalSteps - 1 && (
              <div 
                className={`w-6 h-0.5 rounded-full transition-colors ${
                  isCompleted ? 'bg-[#C16D45]' : 'bg-stone-100'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default AuthStepProgress;
