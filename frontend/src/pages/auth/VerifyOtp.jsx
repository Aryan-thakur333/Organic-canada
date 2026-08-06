import React from 'react';
import { ShieldAlert } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import AuthFooter from '../../components/auth/AuthFooter';

const VerifyOtp = () => {
  return (
    <AuthLayout
      title="Verify Your Account."
      subtitle="For added security, please verify your account."
    >
      <AuthHeader 
        title="Verification Unavailable"
        subtitle="OTP Verification is currently not supported by the backend."
        icon={ShieldAlert}
      />

      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center">
        <p className="text-stone-500 text-sm font-medium mb-4">
          This verification step will be enabled when backend support is available.
        </p>
        <p className="text-stone-400 text-xs">
          If you have already registered, you may proceed to login.
        </p>
      </div>

      <div className="mt-8">
        <a 
          href="/auth/login?role=customer"
          className="w-full flex items-center justify-center h-[48px] rounded-2xl font-bold text-white bg-[#594236] hover:bg-[#4A372D]"
        >
          Continue to Login
        </a>
      </div>

      <AuthFooter />
    </AuthLayout>
  );
};

export default VerifyOtp;
