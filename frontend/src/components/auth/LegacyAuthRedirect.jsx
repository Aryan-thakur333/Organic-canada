import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LoadingSpinner from '../common/LoadingSpinner';

const sanitizeReturnUrl = (url) => {
  if (!url) return null;
  try {
    const decodedUrl = decodeURIComponent(url);
    if (!decodedUrl.startsWith('/')) return null;
    if (decodedUrl.startsWith('//')) return null;
    if (decodedUrl.toLowerCase().includes('javascript:')) return null;
    return decodedUrl;
  } catch (e) {
    return null;
  }
};

const LegacyAuthRedirect = ({ to, role }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const rawReturnUrl = searchParams.get('returnUrl');
    const safeReturnUrl = sanitizeReturnUrl(rawReturnUrl);

    let redirectUrl = to;
    const queryParams = [];

    // Valid roles: customer, seller, b2b
    if (role && ['customer', 'seller', 'b2b'].includes(role)) {
      queryParams.push(`role=${role}`);
    } else if (role === 'admin') {
      redirectUrl = '/auth'; // Reject admin role
    }

    if (safeReturnUrl) {
      queryParams.push(`returnUrl=${encodeURIComponent(safeReturnUrl)}`);
    }

    if (queryParams.length > 0) {
      redirectUrl += `?${queryParams.join('&')}`;
    }

    navigate(redirectUrl, { replace: true });
  }, [navigate, location, to, role]);

  return <LoadingSpinner fullScreen label="Redirecting..." />;
};

export default LegacyAuthRedirect;
