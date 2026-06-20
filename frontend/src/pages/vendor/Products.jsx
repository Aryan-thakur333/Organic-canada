import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, X, Image as ImageIcon, Loader2 } from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { setProducts } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

export default function Products() {
  const dispatch = useDispatch();
  const products = useSelector((state) => state.vendor.products);
  const safeProducts = Array.isArray(products) ? products : [];
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await vendorApi.getProducts();
      dispatch(setProducts(Array.isArray(res?.products) ? res.products : []));
    } catch (err) {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [dispatch]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setTitle("");
    setDescription("");
    setPrice("");
    setThumbnail("");
    setShowModal(true);
  };

  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setTitle(product.title || "");
    setDescription(product.description || "");
    // Extract price from variants
    const cents = product.variants?.[0]?.prices?.[0]?.amount || 0;
    setPrice((cents / 100).toString());
    setThumbnail(product.thumbnail || "");
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || price === "") {
      return toast.error("Title and price are required");
    }

    setSubmitting(true);
    try {
      const payload = {
        title,
        description,
        price: Number(price),
        thumbnail: thumbnail || undefined,
      };

      if (editingProduct) {
        await vendorApi.updateProduct(editingProduct.id, payload);
        toast.success("Product updated successfully");
      } else {
        await vendorApi.createProduct(payload);
        toast.success("Product created successfully");
      }
      setShowModal(false);
      fetchProducts();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to save product";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;

    try {
      await vendorApi.deleteProduct(id);
      toast.success("Product deleted successfully");
      fetchProducts();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Failed to delete product";
      toast.error(msg);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black mb-2">My Products.</h1>
            <p className="text-sm text-stone-400 font-bold">List and manage items available in your storefront catalogue.</p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider rounded-2xl hover:opacity-90 transition-all self-start"
          >
            <Plus size={16} /> Add Product
          </button>
        </div>

        {loading ? (
          <div className="h-[40vh] flex items-center justify-center">
            <Loader2 className="animate-spin text-emerald-400" size={32} />
          </div>
        ) : safeProducts.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-16 text-center shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-stone-950 flex items-center justify-center mx-auto mb-6 text-stone-500">
              <ImageIcon size={28} />
            </div>
            <h3 className="text-lg font-black mb-2">No Products Registered</h3>
            <p className="text-stone-500 text-sm font-semibold mb-6 max-w-sm mx-auto">
              Get started by adding your first product variant, price details, and store photos.
            </p>
            <button
              onClick={handleOpenAdd}
              className="px-6 py-4 bg-stone-950 border border-stone-850 hover:border-emerald-500/20 text-emerald-400 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
            >
              Add New Product Now
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {safeProducts.map((product) => {
              const cents = product.variants?.[0]?.prices?.[0]?.amount || 0;
              const formattedPrice = (cents / 100).toFixed(2);
              return (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-stone-900 border border-stone-800 rounded-[2rem] overflow-hidden shadow-xl hover:border-stone-700/80 transition-all flex flex-col group"
                >
                  <div className="aspect-[4/3] bg-stone-950 relative overflow-hidden">
                    {product.thumbnail ? (
                      <img
                        src={product.thumbnail}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-700">
                        <ImageIcon size={40} />
                      </div>
                    )}
                    <div className="absolute top-4 right-4 bg-stone-950/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-black text-emerald-400">
                      ${formattedPrice}
                    </div>
                  </div>

                  <div className="p-6 flex-1 flex flex-col gap-4">
                    <div>
                      <h3 className="text-base font-black mb-1 group-hover:text-emerald-400 transition-colors line-clamp-1">
                        {product.title}
                      </h3>
                      <p className="text-xs text-stone-400 font-semibold line-clamp-2">
                        {product.description || "No description provided."}
                      </p>
                    </div>

                    <div className="flex gap-2 mt-auto pt-4 border-t border-stone-800/40">
                      <button
                        onClick={() => handleOpenEdit(product)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-stone-950 hover:bg-stone-800 border border-stone-800 hover:border-stone-750 text-stone-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-3 bg-stone-950 hover:bg-red-500/10 border border-stone-800 hover:border-red-500/20 text-stone-500 hover:text-red-400 rounded-xl transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Modal Form for Add/Edit Product */}
        <AnimatePresence>
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowModal(false)}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              />

              {/* Form Container */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-stone-900 border border-stone-800 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10"
              >
                <div className="p-8 border-b border-stone-800 flex items-center justify-between">
                  <h3 className="text-lg font-black">
                    {editingProduct ? "Edit Product Details" : "List New Product"}
                  </h3>
                  <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Product Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Organic Honey Jar"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-850 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Selling Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 12.99"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-850 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Thumbnail URL</label>
                      <input
                        type="url"
                        placeholder="e.g. https://images.unsplash.com..."
                        value={thumbnail}
                        onChange={(e) => setThumbnail(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-850 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Product Description</label>
                    <textarea
                      placeholder="Enter description, size, weight details..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-850 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold min-h-[100px] max-h-[160px]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-sm uppercase tracking-wider py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : editingProduct ? (
                      "Save Product Changes"
                    ) : (
                      "Publish Product"
                    )}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
