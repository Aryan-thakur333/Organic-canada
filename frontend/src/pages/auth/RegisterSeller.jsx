import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Store, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import Input from '../../components/common/Input';
import PasswordField from '../../components/auth/PasswordField';
import AuthLoadingButton from '../../components/auth/AuthLoadingButton';
import AuthAlert from '../../components/auth/AuthAlert';
import AuthFooter from '../../components/auth/AuthFooter';
import AuthStepProgress from '../../components/auth/AuthStepProgress';

import { vendorApi } from '../../services/vendorApi';
import { vendorStart, vendorSuccess, vendorFailure } from '../../redux/vendorSlice';

const RegisterSeller = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4; // 1: Personal 2: Store 3: Documents 4: Review

  const [formData, setFormData] = useState({
    owner_name: '',
    email: '',
    phone: '',
    business_name: '',
    description: '',
    password: '',
    confirm_password: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [alertState, setAlertState] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    if (alertState) setAlertState(null);
  };

  const nextStep = () => {
    setAlertState(null);
    if (currentStep === 1) {
      if (!formData.owner_name || !formData.email || !formData.password || !formData.confirm_password) {
        setAlertState({ type: 'error', message: 'Please fill in all required fields.' });
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
    }
    if (currentStep === 2) {
      if (!formData.business_name) {
        setAlertState({ type: 'error', message: 'Store Name is required.' });
        return;
      }
    }
    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  };

  const prevStep = () => {
    setAlertState(null);
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    dispatch(vendorStart());
    setAlertState(null);

    try {
      await vendorApi.register({
        business_name: formData.business_name,
        owner_name: formData.owner_name,
        name: formData.owner_name,
        store_name: formData.business_name,
        email: formData.email,
        phone: formData.phone || undefined,
        password: formData.password,
        confirm_password: formData.confirm_password,
        description: formData.description,
      });
      
      dispatch(vendorSuccess());
      setIsSuccess(true);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to register";
      dispatch(vendorFailure(msg));
      setAlertState({ type: 'error', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout title="Application Submitted!" subtitle="Our administrator team will review your application shortly.">
        <div className="text-center py-8">
          <div className="inline-flex p-6 rounded-full bg-[#594236]/10 text-[#594236] mb-6">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-3xl font-black mb-3">Application Received</h2>
          <p className="text-stone-500 mb-8 leading-relaxed">
            Your store application for <strong className="text-stone-900">{formData.business_name}</strong> has been received. You can check your application status using your login.
          </p>
          <Link 
            to="/auth/login?role=seller"
            className="w-full flex items-center justify-center h-[48px] rounded-2xl font-bold text-white bg-[#594236] hover:bg-[#4A372D]"
          >
            Continue to Login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Grow with us."
      subtitle="Open your store on Organic Canada and reach thousands of organic enthusiasts."
    >
      <AuthHeader 
        title="Create Store"
        subtitle="Register your vendor profile"
        icon={Store}
        iconClassName="bg-[#C16D45]/10 text-[#C16D45]"
      />

      <AuthStepProgress currentStep={currentStep} totalSteps={totalSteps} />
      <AuthAlert {...(alertState || {})} />

      <div className="flex flex-col gap-5">
        {currentStep === 1 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Personal Information</h3>
            <Input label="Owner Name" name="owner_name" value={formData.owner_name} onChange={handleChange} required />
            <Input label="Business Email" name="email" type="email" value={formData.email} onChange={handleChange} required />
            <Input label="Phone Number" name="phone" type="tel" value={formData.phone} onChange={handleChange} />
            <PasswordField label="Password" name="password" value={formData.password} onChange={handleChange} required />
            <PasswordField label="Confirm Password" name="confirm_password" value={formData.confirm_password} onChange={handleChange} required />
          </div>
        )}

        {currentStep === 2 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Store Information</h3>
            <Input label="Store Name" name="business_name" value={formData.business_name} onChange={handleChange} required />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-stone-500">Store Description</label>
              <textarea
                name="description"
                placeholder="Briefly describe what your store offers..."
                value={formData.description}
                onChange={handleChange}
                className="w-full bg-white border-2 border-stone-200 focus:border-[#594236] rounded-2xl py-3 px-4 text-stone-900 placeholder-stone-400 outline-none transition-colors text-sm font-semibold min-h-[100px]"
              />
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Documents</h3>
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center">
              <p className="text-stone-500 text-sm font-medium mb-2">
                Document Upload is currently unavailable.
              </p>
              <p className="text-stone-400 text-xs">
                This verification step will be enabled when backend support is available. You may proceed without uploading documents.
              </p>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Review & Submit</h3>
            <div className="bg-stone-50 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Owner</span>
                <span className="text-sm font-bold text-stone-900">{formData.owner_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Email</span>
                <span className="text-sm font-bold text-stone-900">{formData.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Store Name</span>
                <span className="text-sm font-bold text-stone-900">{formData.business_name}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-4">
          {currentStep > 1 && (
            <button 
              type="button" 
              onClick={prevStep}
              className="flex-1 h-[48px] rounded-2xl font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors"
            >
              Back
            </button>
          )}
          {currentStep < totalSteps ? (
            <button 
              type="button" 
              onClick={nextStep}
              className="flex-1 h-[48px] rounded-2xl font-bold text-white bg-[#C16D45] hover:bg-[#A85A35] transition-colors"
            >
              Next
            </button>
          ) : (
            <AuthLoadingButton 
              onClick={handleSubmit}
              isLoading={isLoading}
              className="flex-1 bg-[#C16D45] hover:bg-[#A85A35] shadow-[#C16D45]/20 focus:ring-[#C16D45]/20"
            >
              Submit Application
            </AuthLoadingButton>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-stone-500 font-medium">
          Already registered?{' '}
          <Link to="/auth/login?role=seller" className="font-bold text-[#C16D45] hover:underline">
            Sign In
          </Link>
        </p>
      </div>

      <AuthFooter />
    </AuthLayout>
  );
};

export default RegisterSeller;
