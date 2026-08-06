import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { User } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import Input from '../../components/common/Input';
import PasswordField from '../../components/auth/PasswordField';
import AuthLoadingButton from '../../components/auth/AuthLoadingButton';
import AuthAlert from '../../components/auth/AuthAlert';
import AuthFooter from '../../components/auth/AuthFooter';

import { authService } from '../../services/medusa/authService';
import { authStart, authResolved, loginSuccess, loginFailure } from '../../redux/authSlice';
import { setUserProfile } from '../../redux/userSlice';
import { mapCustomerToProfile } from '../../utils/customerProfile';

const RegisterCustomer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  
  const searchParams = new URLSearchParams(location.search);
  const returnUrlParam = searchParams.get('returnUrl');

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: ''
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alertState, setAlertState] = useState(null);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    if (alertState) setAlertState(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setAlertState({ type: 'error', message: 'You must accept the Terms of Service to continue.' });
      return;
    }
    
    if (formData.password.length < 8) {
      setAlertState({ type: 'error', message: 'Password must be at least 8 characters long.' });
      return;
    }
    
    if (formData.password !== formData.confirm_password) {
      setAlertState({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setIsLoading(true);
    dispatch(authStart());
    setAlertState(null);

    try {
      const { token, customer } = await authService.register({
        email: formData.email,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
      });

      // Auto login success
      dispatch(loginSuccess({ token, user: customer }));
      dispatch(setUserProfile(mapCustomerToProfile(customer)));
      dispatch(authResolved());
      
      // Note: Backend does not currently support OTP generation/verification.
      // Skipping OTP verification step and navigating directly.
      
      let redirectUrl = '/profile';
      if (returnUrlParam) {
        try {
          const decoded = decodeURIComponent(returnUrlParam);
          if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.toLowerCase().includes('javascript:')) {
            redirectUrl = decoded;
          }
        } catch (e) {
          console.warn("Failed to decode return URL:", e?.message || e);
        }
      }
      
      navigate(redirectUrl, { replace: true });
      
    } catch (err) {
      dispatch(authResolved());
      dispatch(loginFailure(err.message));
      
      let message = err?.response?.data?.message || err?.message || 'Registration failed';
      if (err?.response?.status === 409 || message.toLowerCase().includes("already exists")) {
        message = "This email is already registered. Please login.";
      }
      setAlertState({ type: 'error', message });
    } finally {
      setIsLoading(false);
    }
  };
  
  let urlQuery = "";
  if (returnUrlParam) {
    urlQuery = `?returnUrl=${encodeURIComponent(returnUrlParam)}`;
  }

  return (
    <AuthLayout
      title="Join Organic Canada."
      subtitle="Create an account to track your orders, save your favorite products, and checkout faster."
    >
      <AuthHeader 
        title="Create Account"
        subtitle="Start your organic journey"
        icon={User}
      />

      <AuthAlert {...(alertState || {})} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            placeholder="John"
            required
            disabled={isLoading}
          />
          <Input
            label="Last Name"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            placeholder="Doe"
            required
            disabled={isLoading}
          />
        </div>

        <Input
          label="Email Address"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="hello@example.com"
          required
          disabled={isLoading}
        />

        <Input
          label="Phone Number (Optional)"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          placeholder="+1 (555) 000-0000"
          disabled={isLoading}
        />

        <PasswordField
          label="Password"
          name="password"
          value={formData.password}
          onChange={handleChange}
          required
          disabled={isLoading}
        />

        <PasswordField
          label="Confirm Password"
          name="confirm_password"
          value={formData.confirm_password}
          onChange={handleChange}
          required
          disabled={isLoading}
        />

        <label className="flex items-start gap-3 mt-2 cursor-pointer group">
          <div className="relative flex items-center justify-center mt-1">
            <input 
              type="checkbox" 
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="peer sr-only"
              disabled={isLoading}
            />
            <div className="w-5 h-5 border-2 rounded-md border-stone-300 peer-checked:bg-[#594236] peer-checked:border-[#594236] peer-focus-visible:ring-4 peer-focus-visible:ring-[#594236]/20 transition-all flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <span className="text-sm text-stone-600 font-medium leading-tight">
            I agree to the <a href="/terms" className="text-[#C16D45] hover:underline" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" className="text-[#C16D45] hover:underline" target="_blank" rel="noreferrer">Privacy Policy</a>
          </span>
        </label>

        <AuthLoadingButton isLoading={isLoading} className="mt-4">
          Create Account
        </AuthLoadingButton>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-stone-500 font-medium">
          Already have an account?{' '}
          <Link to={`/auth/login?role=customer${returnUrlParam ? '&returnUrl='+encodeURIComponent(returnUrlParam) : ''}`} className="font-bold text-[#594236] hover:underline">
            Sign In
          </Link>
        </p>
      </div>

      <AuthFooter />
    </AuthLayout>
  );
};

export default RegisterCustomer;
