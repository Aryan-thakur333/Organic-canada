import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Store, Building2 } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout';
import AuthHeader from '../../components/auth/AuthHeader';
import RoleCard from '../../components/auth/RoleCard';
import AuthFooter from '../../components/auth/AuthFooter';
import AuthLoadingButton from '../../components/auth/AuthLoadingButton';

const AuthGateway = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedRole, setSelectedRole] = useState(null);

  // Preserve returnUrl query parameter
  const searchParams = new URLSearchParams(location.search);
  const returnUrl = searchParams.get('returnUrl');

  const handleContinue = () => {
    if (!selectedRole) return;
    let url = `/auth/login?role=${selectedRole}`;
    if (returnUrl) {
      url += `&returnUrl=${encodeURIComponent(returnUrl)}`;
    }
    navigate(url);
  };

  return (
    <AuthLayout
      title="Fresh, local, and organic."
      subtitle="Join our community of buyers and sellers committed to sustainable, high-quality organic produce."
    >
      <AuthHeader 
        title="Choose your account."
        subtitle="How would you like to continue?"
      />

      <div 
        className="flex flex-col gap-3 mb-8"
        role="radiogroup"
        aria-label="Account type selection"
      >
        <RoleCard
          id="customer"
          title="Customer"
          subtitle="Shop products and manage your orders"
          icon={User}
          isSelected={selectedRole === 'customer'}
          onClick={setSelectedRole}
        />
        
        <RoleCard
          id="seller"
          title="Seller"
          subtitle="Manage products, inventory and orders"
          icon={Store}
          isSelected={selectedRole === 'seller'}
          onClick={setSelectedRole}
          activeColorClass="border-[#C16D45] bg-[#C16D45]/5"
          iconActiveColorClass="text-[#C16D45]"
        />
        
        <RoleCard
          id="b2b"
          title="B2B Buyer"
          subtitle="Purchase products for your company"
          icon={Building2}
          isSelected={selectedRole === 'b2b'}
          onClick={setSelectedRole}
          activeColorClass="border-[#8B2635] bg-[#8B2635]/5"
          iconActiveColorClass="text-[#8B2635]"
        />
      </div>

      <AuthLoadingButton 
        onClick={handleContinue}
        disabled={!selectedRole}
        isLoading={false}
      >
        Continue
      </AuthLoadingButton>

      <AuthFooter />
    </AuthLayout>
  );
};

export default AuthGateway;
