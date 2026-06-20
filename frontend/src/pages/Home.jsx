import React, { useState, useEffect } from 'react';
import Navbar from '../components/layout/Navbar';
import Hero from '../components/Hero';
import CategoryList from '../components/home/CategoryList';
import FeaturedProducts from '../components/home/FeaturedProducts';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import { authService } from '../services/medusa/authService';

const Home = () => {
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('medusa_jwt') || localStorage.getItem('medusa_token');
        if (token) {
          const profileData = await authService.getCurrentCustomer();
          if (profileData && profileData.customer && profileData.customer.first_name) {
            setUserName(profileData.customer.first_name);
          }
        }
      } catch (error) {
        // Silently ignore or log error if user is not authenticated
        console.error('Failed to load profile:', error);
      }
    };
    loadProfile();
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary overflow-x-hidden">
      <Navbar />
      <main>
        {userName && (
          <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-100 py-3 text-center font-medium">
            Welcome back, {userName}! 🌿
          </div>
        )}
        <Hero />
        <CategoryList />
        <FeaturedProducts />
        
        {/* Why Choose Us Section */}
        <section className="py-20 bg-bg-secondary border-t border-stone-100 dark:border-slate-800">
          <div className="container-custom">
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h3 className="text-xl font-bold">100% Organic</h3>
                <p className="text-sm text-text-secondary">Certified organic products sourced from the best local farms in Canada.</p>
              </div>
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center text-orange-600">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h3 className="text-xl font-bold">Fast Delivery</h3>
                <p className="text-sm text-text-secondary">We deliver within 24 hours of harvest to ensure maximum freshness for you.</p>
              </div>
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                </div>
                <h3 className="text-xl font-bold">Secure Payment</h3>
                <p className="text-sm text-text-secondary">Safe and encrypted payments powered by Stripe for a worry-free checkout.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
};

export default Home;
