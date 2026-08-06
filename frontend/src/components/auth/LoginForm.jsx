import React from 'react';
import { Link } from 'react-router-dom';
import Input from '../common/Input';
import PasswordField from './PasswordField';
import AuthLoadingButton from './AuthLoadingButton';

const LoginForm = ({ 
  email, 
  setEmail, 
  password, 
  setPassword, 
  onSubmit, 
  isLoading,
  showForgotPassword = true 
}) => {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Input
        label="Email Address"
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="hello@example.com"
        autoComplete="email"
        disabled={isLoading}
        required
      />

      <div>
        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          disabled={isLoading}
          required
        />
        
        {showForgotPassword && (
          <div className="flex justify-end mt-2">
            <Link to="/auth/forgot-password" className="text-xs font-bold text-[#C16D45] hover:underline">
              Forgot Password?
            </Link>
          </div>
        )}
      </div>

      <AuthLoadingButton isLoading={isLoading} className="mt-2">
        Sign In
      </AuthLoadingButton>
    </form>
  );
};

export default LoginForm;
