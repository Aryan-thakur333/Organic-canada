import React, { useState } from 'react';
import Input from '../common/Input';
import { Eye, EyeOff } from 'lucide-react';

const PasswordField = ({ label = "Password", name = "password", value, onChange, placeholder = "••••••••", required = true, disabled = false, ...props }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <Input
        label={label}
        name={name}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        {...props}
      />
      <button
        type="button"
        className="absolute right-3 top-[34px] text-stone-400 hover:text-[#594236] focus:outline-none focus:text-[#594236] p-1 rounded-md"
        onClick={() => setShowPassword(!showPassword)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        disabled={disabled}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

export default PasswordField;
