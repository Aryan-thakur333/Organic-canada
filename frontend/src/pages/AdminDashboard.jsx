import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Users, 
  BarChart3, 
  Settings, 
  Bell, 
  Search, 
  TrendingUp, 
  ArrowUpRight,
  Package,
  CheckCircle2,
  Clock,
  Store,
  Repeat
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import Button from '../components/common/Button';
import AdminVendorsView from '../components/admin/AdminVendorsView';
import AdminCouponsView from '../components/admin/AdminCouponsView';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'vendors', label: 'Vendors', icon: <Store size={20} /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag size={20} /> },
    { id: 'products', label: 'Products', icon: <Package size={20} /> },
    { id: 'customers', label: 'Customers', icon: <Users size={20} /> },
    { id: 'coupons', label: 'Coupons', icon: <TrendingUp size={20} /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <Repeat size={20} /> },
    { id: 'settings', label: 'Store Settings', icon: <Settings size={20} /> }
  ];

  const stats = [
    { label: 'Total Revenue', value: '$24,560', change: '+12%', icon: <BarChart3 /> },
    { label: 'Active Orders', value: '156', change: '+5%', icon: <ShoppingBag /> },
    { label: 'New Customers', value: '42', change: '+18%', icon: <Users /> },
    { label: 'Avg. Order', value: '$85.00', change: '-2%', icon: <TrendingUp /> },
  ];

  const recentOrders = [
    { id: '#ORD-8821', customer: 'Alice Johnson', items: 3, total: '$45.00', status: 'delivered', date: '2 mins ago' },
    { id: '#ORD-8822', customer: 'Bob Smith', items: 1, total: '$12.50', status: 'processing', date: '15 mins ago' },
    { id: '#ORD-8823', customer: 'Charlie Brown', items: 5, total: '$120.00', status: 'shipped', date: '1 hour ago' },
    { id: '#ORD-8824', customer: 'Diana Prince', items: 2, total: '$34.00', status: 'pending', date: '3 hours ago' },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom flex gap-12">
        {/* Admin Sidebar */}
        <aside className="w-64 hidden lg:flex flex-col gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'subscriptions') {
                  navigate('/admin/subscriptions');
                } else {
                  setActiveTab(tab.id);
                }
              }}
              className={`flex items-center gap-3 p-4 rounded-2xl font-bold transition-all text-left ${
                activeTab === tab.id
                  ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20'
                  : 'hover:bg-stone-50 dark:hover:bg-slate-800 text-text-secondary'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </aside>

        {/* Dashboard Content */}
        <div className="flex-1 flex flex-col gap-10">
          {activeTab === 'vendors' ? (
            <AdminVendorsView />
          ) : activeTab === 'coupons' ? (
            <AdminCouponsView />
          ) : activeTab === 'overview' ? (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black text-text-primary mb-2">Dashboard.</h1>
              <p className="text-sm text-text-secondary font-medium">Welcome back, Aryan. Here's what's happening today.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
                <input 
                  type="text" 
                  placeholder="Search..." 
                  className="bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-2xl py-3 pl-12 pr-6 outline-none text-sm font-bold w-64"
                />
              </div>
              <button className="p-3 bg-white dark:bg-slate-800 rounded-2xl border-2 border-stone-100 dark:border-slate-700 text-text-secondary hover:text-accent-primary transition-colors">
                <Bell size={20} />
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-premium border border-stone-100 dark:border-slate-700"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                    {stat.icon}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${stat.change.startsWith('+') ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {stat.change}
                  </span>
                </div>
                <p className="text-xs font-black uppercase tracking-widest text-text-secondary mb-1">{stat.label}</p>
                <p className="text-3xl font-black text-text-primary">{stat.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Main Chart/Table Area */}
          <div className="grid xl:grid-cols-3 gap-8">
            {/* Recent Orders Table */}
            <div className="xl:col-span-2 bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden">
              <div className="p-8 flex items-center justify-between border-b border-stone-50 dark:border-slate-700">
                <h3 className="text-xl font-black">Recent Orders</h3>
                <button className="text-xs font-black uppercase tracking-widest text-accent-primary hover:underline">View All</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-stone-50 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary">Order ID</th>
                      <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary">Customer</th>
                      <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary">Status</th>
                      <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-text-secondary">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50 dark:divide-slate-700">
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-stone-50/50 dark:hover:bg-slate-900/20 transition-colors">
                        <td className="px-8 py-5 text-sm font-black text-accent-primary">{order.id}</td>
                        <td className="px-8 py-5">
                          <p className="text-sm font-bold text-text-primary">{order.customer}</p>
                          <p className="text-[10px] text-text-secondary font-medium">{order.date}</p>
                        </td>
                        <td className="px-8 py-5">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                            order.status === 'delivered' ? 'bg-green-100 text-green-600' : 
                            order.status === 'processing' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right font-black text-text-primary">{order.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Actions / Activity */}
            <div className="flex flex-col gap-6">
              <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700">
                <h3 className="text-xl font-black mb-6">Quick Actions</h3>
                <div className="flex flex-col gap-3">
                  <Button variant="secondary" className="justify-start gap-3 w-full">
                    <Package size={18} /> Add New Product
                  </Button>
                  <Button variant="secondary" className="justify-start gap-3 w-full">
                    <Bell size={18} /> Send Notification
                  </Button>
                  <Button variant="secondary" className="justify-start gap-3 w-full">
                    <BarChart3 size={18} /> Export Reports
                  </Button>
                </div>
              </div>

              <div className="bg-bg-secondary p-8 rounded-[2.5rem] border border-stone-100 dark:border-slate-800">
                <h3 className="text-lg font-black mb-6">Live Activity</h3>
                <div className="flex flex-col gap-6">
                  <div className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2 shrink-0 animate-pulse" />
                    <div>
                      <p className="text-sm font-bold">New order from London</p>
                      <p className="text-xs text-text-secondary font-medium">Just now · $120.00</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                    <div>
                      <p className="text-sm font-bold">Product "Organic Kale" stock low</p>
                      <p className="text-xs text-text-secondary font-medium">14 mins ago · 5 left</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 bg-white dark:bg-slate-800 rounded-[2.5rem] border border-stone-100 dark:border-slate-700">
              <p className="text-text-secondary font-bold">This section is under construction.</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AdminDashboard;
