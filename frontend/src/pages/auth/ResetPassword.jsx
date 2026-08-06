import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import PasswordField from '../../components/auth/PasswordField';
import AuthLoadingButton from '../../components/auth/AuthLoadingButton';
import AuthAlert from '../../components/auth/AuthAlert';
import AuthFooter from '../../components/auth/AuthFooter';

import apiClient from '../../services/apiClient';

const ResetPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const searchParams = new URLSearchParams(location.search);
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [alertState, setAlertState] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      setAlertState({ type: 'error', message: 'Invalid or missing reset token.' });
    }
  }, [token, email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token || !email) return;

    if (password.length < 8) {
      setAlertState({ type: 'error', message: 'Password must be at least 8 characters long.' });
      return;
    }
    
    if (password !== confirmPassword) {
      setAlertState({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setIsLoading(true);
    setAlertState(null);

    try {
      // Typically Medusa expects POST /store/customers/password-reset
      await apiClient.post('/store/customers/password-reset', {
        email: email,
        token: token,
        password: password,
      });
      setIsSuccess(true);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to reset password.";
      setAlertState({ type: 'error', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout title="Password Reset Complete." subtitle="You can now log in with your new password.">
        <AuthHeader 
          title="Success"
          subtitle="Your password has been successfully reset."
          icon={Lock}
        />
        <div className="mt-6 flex justify-center">
          <button 
            onClick={() => navigate('/auth/login?role=customer')}
            className="w-full h-[48px] rounded-2xl font-bold text-white bg-[#594236] hover:bg-[#4A372D]"
          >
            Continue to Login
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create new password."
      subtitle="Please enter your new password below."
    >
      <AuthHeader 
        title="Reset Password"
        subtitle="Create a new password for your account"
        icon={Lock}
      />

      <AuthAlert {...(alertState || {})} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <PasswordField
          label="New Password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading || !token}
        />
        <PasswordField
          label="Confirm New Password"
          name="confirm_password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={isLoading || !token}
        />

        <AuthLoadingButton isLoading={isLoading} disabled={!token} className="mt-2">
          Reset Password
        </AuthLoadingButton>
      </form>

      <AuthFooter backLink="/auth/login?role=customer" backText="Back to Login" />
    </AuthLayout>
  );
};

export default ResetPassword;
