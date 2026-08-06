import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import Input from '../../components/common/Input';
import AuthLoadingButton from '../../components/auth/AuthLoadingButton';
import AuthAlert from '../../components/auth/AuthAlert';
import AuthFooter from '../../components/auth/AuthFooter';

import { authService } from '../../services/medusa/authService';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [alertState, setAlertState] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setAlertState(null);

    try {
      if (authService.requestPasswordReset) {
        await authService.requestPasswordReset(email);
      }
      // Always show generic success even if error (unless network error)
      setIsSuccess(true);
    } catch (err) {
      if (err?.code === "ERR_NETWORK" || err?.message?.includes("Network")) {
        setAlertState({ type: 'error', message: "Network error. Please try again." });
      } else {
        setIsSuccess(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout title="Check your inbox." subtitle="We've sent password reset instructions to your email.">
        <AuthHeader 
          title="Email Sent"
          subtitle="If an account exists for this email, reset instructions have been sent."
          icon={Lock}
        />
        <AuthFooter backLink="/auth/login?role=customer" backText="Back to Login" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your email address and we'll send you instructions to reset your password."
    >
      <AuthHeader 
        title="Reset Password"
        subtitle="Enter your email to receive a reset link"
        icon={Lock}
      />

      <AuthAlert {...(alertState || {})} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input
          label="Email Address"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="hello@example.com"
          required
          disabled={isLoading}
        />

        <AuthLoadingButton isLoading={isLoading} className="mt-2">
          Send Reset Link
        </AuthLoadingButton>
      </form>

      <AuthFooter backLink="/auth/login?role=customer" backText="Back to Login" />
    </AuthLayout>
  );
};

export default ForgotPassword;
