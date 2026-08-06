import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import Input from '../../components/common/Input';
import PasswordField from '../../components/auth/PasswordField';
import AuthLoadingButton from '../../components/auth/AuthLoadingButton';
import AuthAlert from '../../components/auth/AuthAlert';
import AuthFooter from '../../components/auth/AuthFooter';
import AuthStepProgress from '../../components/auth/AuthStepProgress';

import { b2bApi } from '../../services/b2bApi';

const RegisterB2B = () => {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [alertState, setAlertState] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // According to current b2bApi.register logic, it takes these fields mostly:
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    tax_id: '',
    business_type: 'retailer',
    password: '',
    confirm_password: ''
  });

  // Since it's a 5 step wizard:
  const totalSteps = 5;

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    if (alertState) setAlertState(null);
  };

  const nextStep = () => {
    setAlertState(null);
    if (currentStep === 1) { // Contact Person & Credentials
      if (!formData.contact_name || !formData.email || !formData.password || !formData.confirm_password) {
        setAlertState({ type: 'error', message: 'Please fill in all required fields.' });
        return;
      }
      if (formData.password !== formData.confirm_password) {
        setAlertState({ type: 'error', message: 'Passwords do not match.' });
        return;
      }
    }
    if (currentStep === 2) { // Company Info
      if (!formData.company_name) {
        setAlertState({ type: 'error', message: 'Company Name is required.' });
        return;
      }
    }
    if (currentStep === 3) { // Tax Info
      if (!formData.tax_id) {
        setAlertState({ type: 'error', message: 'Tax ID is required.' });
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
    setAlertState(null);

    try {
      await b2bApi.register({
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        email: formData.email,
        phone: formData.phone || undefined,
        tax_id: formData.tax_id,
        business_type: formData.business_type,
        password: formData.password,
      });
      
      setIsSuccess(true);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to register B2B company";
      setAlertState({ type: 'error', message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthLayout title="Application Submitted!" subtitle="Our B2B team will review your application shortly.">
        <div className="text-center py-8">
          <div className="inline-flex p-6 rounded-full bg-[#8B2635]/10 text-[#8B2635] mb-6">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-3xl font-black mb-3">Company Registered</h2>
          <p className="text-stone-500 mb-8 leading-relaxed">
            Your B2B application for <strong className="text-stone-900">{formData.company_name}</strong> is now pending admin approval.
          </p>
          <Link 
            to="/auth/login?role=b2b"
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
      title="Wholesale Solutions."
      subtitle="Access bulk pricing, custom quotes, and streamlined ordering for your business."
    >
      <AuthHeader 
        title="B2B Registration"
        subtitle="Register your company account"
        icon={Building2}
        iconClassName="bg-[#8B2635]/10 text-[#8B2635]"
      />

      <AuthStepProgress currentStep={currentStep} totalSteps={totalSteps} />
      <AuthAlert {...(alertState || {})} />

      <div className="flex flex-col gap-5">
        {currentStep === 1 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Contact Person & Security</h3>
            <Input label="Contact Name" name="contact_name" value={formData.contact_name} onChange={handleChange} required />
            <Input label="Work Email" name="email" type="email" value={formData.email} onChange={handleChange} required />
            <PasswordField label="Password" name="password" value={formData.password} onChange={handleChange} required />
            <PasswordField label="Confirm Password" name="confirm_password" value={formData.confirm_password} onChange={handleChange} required />
          </div>
        )}

        {currentStep === 2 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Company Information</h3>
            <Input label="Company Name" name="company_name" value={formData.company_name} onChange={handleChange} required />
            <Input label="Business Phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} />
          </div>
        )}

        {currentStep === 3 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Tax & Business Information</h3>
            <Input label="Tax ID / Registration Number" name="tax_id" value={formData.tax_id} onChange={handleChange} required />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black uppercase tracking-widest text-stone-500">Business Type</label>
              <select
                name="business_type"
                value={formData.business_type}
                onChange={handleChange}
                className="w-full bg-white border-2 border-stone-200 focus:border-[#594236] rounded-2xl py-3 px-4 text-stone-900 outline-none transition-colors text-sm font-semibold"
              >
                <option value="retailer">Retailer</option>
                <option value="distributor">Distributor</option>
                <option value="restaurant">Restaurant / Hospitality</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        )}

        {currentStep === 4 && (
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

        {currentStep === 5 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-bold text-lg border-b border-stone-100 pb-2">Review & Submit</h3>
            <div className="bg-stone-50 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Company Name</span>
                <span className="text-sm font-bold text-stone-900">{formData.company_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Contact Person</span>
                <span className="text-sm font-bold text-stone-900">{formData.contact_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Email</span>
                <span className="text-sm font-bold text-stone-900">{formData.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-stone-500">Tax ID</span>
                <span className="text-sm font-bold text-stone-900">{formData.tax_id}</span>
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
              className="flex-1 h-[48px] rounded-2xl font-bold text-white bg-[#8B2635] hover:bg-[#6D1B28] transition-colors"
            >
              Next
            </button>
          ) : (
            <AuthLoadingButton 
              onClick={handleSubmit}
              isLoading={isLoading}
              className="flex-1 bg-[#8B2635] hover:bg-[#6D1B28] shadow-[#8B2635]/20 focus:ring-[#8B2635]/20"
            >
              Submit Application
            </AuthLoadingButton>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-stone-500 font-medium">
          Already registered?{' '}
          <Link to="/auth/login?role=b2b" className="font-bold text-[#8B2635] hover:underline">
            Sign In
          </Link>
        </p>
      </div>

      <AuthFooter />
    </AuthLayout>
  );
};

export default RegisterB2B;
