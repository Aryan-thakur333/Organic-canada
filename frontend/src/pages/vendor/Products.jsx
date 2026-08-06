import React, { useEffect, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Image as ImageIcon,
  Loader2,
  Tag,
  FolderTree,
  ToggleLeft,
  ToggleRight,
  Copy,
  GripVertical,
  Globe,
  EyeOff,
  Package,
  Check,
  PlusCircle,
  Download,
  Shield,
  FileText,
  Upload,
} from "lucide-react";
import DashboardLayout from "./DashboardLayout";
import { vendorApi } from "../../services/vendorApi";
import { setProducts } from "../../redux/vendorSlice";
import toast from "react-hot-toast";

/* ════════════════════════════════════════════════════════════════════════════
 *  Status / Publish helpers
 * ════════════════════════════════════════════════════════════════════════════ */

const STATUS_MAP = {
  published: { label: "Published", icon: <Globe size={12} />, cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  draft: { label: "Draft", icon: <EyeOff size={12} />, cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border flex items-center gap-1 w-fit ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Main Products Component
 * ════════════════════════════════════════════════════════════════════════════ */

export default function Products() {
  const dispatch = useDispatch();
  const products = useSelector((state) => state.vendor.products);
  const safeProducts = Array.isArray(products) ? products : [];
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [status, setStatus] = useState("published");
  const [inventoryQuantity, setInventoryQuantity] = useState("100");
  const initialVariants = [{ title: "Standard", sku: "", barcode: "", price: "", manage_inventory: true, allow_backorder: false }];
  const [variants, setVariants] = useState(() => initialVariants.map((v, i) => ({ ...v, _key: Date.now() + i })));
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Digital product fields
  const [isDigital, setIsDigital] = useState(false);
  const [digitalVersion, setDigitalVersion] = useState("1.0.0");
  const [downloadLimit, setDownloadLimit] = useState("5");
  const [expiryDays, setExpiryDays] = useState("365");
  const [licenseRequired, setLicenseRequired] = useState(false);
  const [digitalFiles, setDigitalFiles] = useState([]);
  const [releaseNotes, setReleaseNotes] = useState("");

  // Product type & personalization states
  const [productType, setProductType] = useState("standard");
  const [personalizationTemplate, setPersonalizationTemplate] = useState({
    title: "",
    description: "",
    requires_vendor_approval: false,
    requires_production: false,
    fields: []
  });
  const [deletedFieldIds, setDeletedFieldIds] = useState([]);
  const [submitStep, setSubmitStep] = useState("");

  // Reference data (categories & tags)
  const [allCategories, setAllCategories] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [refDataLoading, setRefDataLoading] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vendorApi.getProducts();
      dispatch(setProducts(Array.isArray(res?.products) ? res.products : []));
    } catch (err) {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const fetchReferenceData = useCallback(async () => {
    setRefDataLoading(true);
    try {
      const [catRes, tagRes] = await Promise.all([
        vendorApi.getProductCategories(),
        vendorApi.getProductTags(),
      ]);
      setAllCategories(catRes.categories || []);
      setAllTags(tagRes.tags || []);
    } catch (err) {
      // Non-critical — form still works without categories/tags
    } finally {
      setRefDataLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    resetForm();
    setProductType("standard");
    setIsDigital(false);
    fetchReferenceData();
    setShowModal(true);
  };

  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setTitle(product.title || "");
    setDescription(product.description || "");
    setThumbnail(product.thumbnail || "");
    setStatus(product.status === "draft" ? "draft" : "published");
    const pType = product.metadata?.product_type || (product.metadata?.is_digital === true || product.metadata?.is_digital === 'true' ? "digital" : "standard");
    setProductType(pType);
    setIsDigital(pType === "digital");

    // Clear personalization states first
    setPersonalizationTemplate({
      title: "",
      description: "",
      requires_vendor_approval: false,
      requires_production: false,
      fields: []
    });
    setDeletedFieldIds([]);

    if (pType === "personalized") {
      vendorApi.getPersonalizationTemplates()
        .then((res) => {
          const matching = res.templates?.find(t => t.product_id === product.id);
          if (matching) {
            setPersonalizationTemplate({
              id: matching.id,
              title: matching.title || "",
              description: matching.description || "",
              requires_vendor_approval: matching.requires_vendor_approval || false,
              requires_production: matching.requires_production || false,
              fields: matching.fields || []
            });
          }
        })
        .catch((err) => {
          console.error("Failed to load personalization template", err);
        });
    }
    const firstVariant = Array.isArray(product.variants) ? product.variants[0] : null;
    const existingStock = (firstVariant?.inventory_items || [])
      .flatMap((link) => link?.inventory?.location_levels || [])
      .reduce((sum, level) => sum + Number(level?.stocked_quantity || 0), 0);
    setInventoryQuantity(String(existingStock || 0));

    // Build variants from product data
    const productVariants = Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants.map((v, i) => ({
          _key: Date.now() + i,
          _id: v.id,
          title: v.title || "",
          sku: v.sku || "",
          barcode: v.barcode || "",
          price: v.prices?.[0] ? v.prices[0].amount.toString() : "",
          manage_inventory: v.manage_inventory !== false,
          allow_backorder: v.allow_backorder === true,
        }))
      : [{ _key: Date.now(), title: "Standard", sku: "", barcode: "", price: "", manage_inventory: true, allow_backorder: false }];
    setVariants(productVariants);

    // Categories
    const catIds = Array.isArray(product.categories) ? product.categories.map((c) => c.id) : [];
    setSelectedCategoryIds(catIds);

    // Tags
    const tagIds = Array.isArray(product.tags) ? product.tags.map((t) => t.id) : [];
    setSelectedTagIds(tagIds);

    fetchReferenceData();
    setShowModal(true);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setThumbnail("");
    setStatus("published");
    setInventoryQuantity("100");
    setVariants([{ title: "Standard", sku: "", barcode: "", price: "", manage_inventory: true, allow_backorder: false, _key: Date.now() }]);
    setSelectedCategoryIds([]);
    setSelectedTagIds([]);
    setTagInput("");
    setIsDigital(false);
    setDigitalVersion("1.0.0");
    setDownloadLimit("5");
    setExpiryDays("365");
    setLicenseRequired(false);
    setDigitalFiles([]);
    setProductType("standard");
    setPersonalizationTemplate({
      title: "",
      description: "",
      requires_vendor_approval: false,
      requires_production: false,
      fields: []
    });
    setDeletedFieldIds([]);
  };

  // ── Variant management ──────────────────────────────────────────────────
  const addVariant = () => {
    setVariants((prev) => [
      ...prev,
      { title: "", sku: "", barcode: "", price: "", manage_inventory: true, allow_backorder: false, _key: Date.now() },
    ]);
  };

  const removeVariant = (key) => {
    if (variants.length <= 1) return toast.error("At least one variant is required");
    setVariants((prev) => prev.filter((v) => v._key !== key));
  };

  const moveField = (index, direction) => {
    const updatedFields = [...personalizationTemplate.fields];
    if (direction === "up" && index > 0) {
      const temp = updatedFields[index];
      updatedFields[index] = updatedFields[index - 1];
      updatedFields[index - 1] = temp;
    } else if (direction === "down" && index < updatedFields.length - 1) {
      const temp = updatedFields[index];
      updatedFields[index] = updatedFields[index + 1];
      updatedFields[index + 1] = temp;
    }
    setPersonalizationTemplate((prev) => ({ ...prev, fields: updatedFields }));
  };

  const updateVariant = (key, field, value) => {
    setVariants((prev) => prev.map((v) => (v._key === key ? { ...v, [field]: value } : v)));
  };

  // ── Tag management ─────────────────────────────────────────────────────
  const availableTags = allTags.filter((t) => !selectedTagIds.includes(t.id));

  const addTag = (tagId) => {
    if (!selectedTagIds.includes(tagId)) {
      setSelectedTagIds((prev) => [...prev, tagId]);
    }
    setTagInput("");
  };

  const removeTag = (tagId) => {
    setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
  };

  const handleTagInputKeyDown = (e) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const match = availableTags.find(
        (t) => t.value.toLowerCase() === tagInput.trim().toLowerCase()
      );
      if (match) addTag(match.id);
      else setTagInput("");
    }
  };

  // ── Category toggle ────────────────────────────────────────────────────
  const toggleCategory = (catId) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Product title is required");

    const primaryVariant = variants[0] || {};
    const priceNumber = Number(primaryVariant.price);
    const hasValidPrice = Number.isFinite(priceNumber) && priceNumber > 0;
    if (!hasValidPrice) {
      return toast.error("Please enter a valid product price");
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(primaryVariant.price || "").trim())) {
      return toast.error("Please enter a valid product price");
    }

    const inventoryNumber = Number(inventoryQuantity || 0);
    if (!isDigital && (!Number.isFinite(inventoryNumber) || inventoryNumber < 0)) {
      return toast.error("Inventory quantity must be 0 or greater");
    }

    const normalizedVariants = variants.map((variant, index) => ({
      ...variant,
      price: index === 0 ? primaryVariant.price : variant.price,
    }));

    const variantOptionValues = normalizedVariants.map((v) => {
      const variantTitle = String(v.title || "Standard").trim() || "Standard";
      return variantTitle === "Standard" ? "Default value" : variantTitle;
    });
    const defaultOption = {
      title: "Default option",
      values: [...new Set(variantOptionValues)],
    };

    setSubmitting(true);
    setSubmitStep("saving");
    try {
      const metadata = {
        product_type: productType,
        ...(isDigital ? {
          is_digital: true,
          version: digitalVersion,
          download_limit: Number(downloadLimit) || 5,
          download_expiry_days: Number(expiryDays) || 365,
          license_required: licenseRequired,
          requires_payment: true,
        } : {}),
      };

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        thumbnail: thumbnail.trim() || undefined,
        status,
        type: isDigital ? "digital" : "physical",
        price: priceNumber,
        currency_code: "cad",
        sku: primaryVariant.sku || undefined,
        barcode: primaryVariant.barcode || undefined,
        inventory_quantity: isDigital ? 0 : inventoryNumber,
        variants: normalizedVariants.map((v, index) => ({
          title: v.title || "Standard",
          sku: v.sku || undefined,
          barcode: v.barcode || undefined,
          price: Number(v.price),
          manage_inventory: v.manage_inventory,
          allow_backorder: v.allow_backorder,
          options: {
            [defaultOption.title]: variantOptionValues[index],
          },
          _new: !v._id,
          ...(v._id ? { id: v._id } : {}),
        })),
        options: [defaultOption],
        categories: selectedCategoryIds,
        tags: selectedTagIds,
        metadata
      };

      // For digital products, set variants with manage_inventory: false
      if (isDigital) {
        payload.variants = payload.variants?.map(v => ({
          ...v,
          manage_inventory: false,
          allow_backorder: true,
        }));
      }

      let product = null;
      if (editingProduct) {
        const res = await vendorApi.updateProduct(editingProduct.id, payload);
        product = res.product || editingProduct;
        toast.success("Product updated successfully");
      } else {
        const res = await vendorApi.createProduct(payload);
        product = res.product;
        toast.success("Product created successfully");
      }

      // Handle template creation or update
      if (productType === "personalized") {
        if (!product || !product.id) {
          throw new Error("Could not resolve product ID for personalization template");
        }

        let templateId = personalizationTemplate.id;
        if (!templateId) {
          const tRes = await vendorApi.createPersonalizationTemplate({
            product_id: product.id,
            title: title.trim() + " Personalization",
            requires_vendor_approval: personalizationTemplate.requires_vendor_approval || false,
            requires_production: personalizationTemplate.requires_production || false,
          });
          templateId = tRes.template.id;
        } else {
          await vendorApi.updatePersonalizationTemplate(templateId, {
            title: title.trim() + " Personalization",
            requires_vendor_approval: personalizationTemplate.requires_vendor_approval || false,
            requires_production: personalizationTemplate.requires_production || false,
          });
        }

        // Deletions
        for (const fid of deletedFieldIds) {
          try {
            await vendorApi.deletePersonalizationField(templateId, fid);
          } catch (e) {
            console.error("Failed to delete field", fid, e);
          }
        }

        // Additions / Updates
        setSubmitStep("adding_field");
        for (let index = 0; index < personalizationTemplate.fields.length; index++) {
          const field = personalizationTemplate.fields[index];
          const fPayload = {
            key: field.key,
            label: field.label,
            field_type: field.field_type,
            is_required: field.is_required || false,
            price_adjustment: Number(field.price_adjustment) || 0,
            allowed_values: Array.isArray(field.allowed_values) 
              ? field.allowed_values 
              : (typeof field.allowed_values === "string" 
                  ? field.allowed_values.split(",").map(v => v.trim()).filter(Boolean) 
                  : null),
            min_length: field.min_length !== undefined && field.min_length !== "" ? Number(field.min_length) : null,
            max_length: field.max_length !== undefined && field.max_length !== "" ? Number(field.max_length) : null,
            min_value: field.min_value !== undefined && field.min_value !== "" ? Number(field.min_value) : null,
            max_value: field.max_value !== undefined && field.max_value !== "" ? Number(field.max_value) : null,
            placeholder: field.placeholder || null,
            help_text: field.help_text || null,
            sort_order: index,
          };

          if (field.id) {
            await vendorApi.updatePersonalizationField(templateId, field.id, fPayload);
          } else {
            await vendorApi.createPersonalizationField(templateId, fPayload);
          }
        }

        // Finally, publish
        setSubmitStep("publishing");
        await vendorApi.publishPersonalizationTemplate(templateId);
      } else if (editingProduct && productType !== "personalized" && personalizationTemplate.id) {
        // Deleted template if toggled away from personalized
        try {
          await vendorApi.deletePersonalizationTemplate(personalizationTemplate.id);
        } catch (e) {
          console.error("Failed to delete template", e);
        }
      }

      setShowModal(false);
      fetchProducts();
    } catch (err) {
      const rawMsg = err.response?.data?.message || err.message || "Failed to save product";
      const msg = /positive price/i.test(rawMsg) ? "Please add a price greater than 0" : rawMsg;
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

  // ── Status toggle shortcut (from grid) ──────────────────────────────────
  const togglePublish = async (product) => {
    const newStatus = product.status === "draft" ? "published" : "draft";
    try {
      await vendorApi.updateProduct(product.id, { status: newStatus });
      toast.success(`Product ${newStatus === "published" ? "published" : "unpublished"}`);
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update status");
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-10">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-black mb-2">My Products.</h1>
            <p className="text-sm text-stone-400 font-bold">
              List and manage items available in your storefront catalogue.
            </p>
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider rounded-2xl hover:opacity-90 transition-all self-start"
          >
            <Plus size={16} /> Add Product
          </button>
        </div>

        {/* ── Product Grid ──────────────────────────────────────────────── */}
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
              const pType = product.metadata?.product_type || (product.metadata?.is_digital === true || product.metadata?.is_digital === 'true' ? "digital" : "standard");
              const amount = product.variants?.[0]?.prices?.[0]?.amount || 0;
              const formattedPrice = Number(amount).toFixed(2);
              const variantCount = product.variants?.length || 0;
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
                    <div className="absolute top-3 left-3">
                      <StatusBadge status={product.status} />
                    </div>
                    {pType === "digital" && (
                      <div className="absolute top-3 right-14 bg-blue-500/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-black text-white flex items-center gap-1">
                        <Download size={10} /> Digital
                      </div>
                    )}
                    {pType === "personalized" && (
                      <div className="absolute top-3 right-14 bg-purple-500/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-black text-white flex items-center gap-1">
                        <Tag size={10} /> Custom
                      </div>
                    )}
                    {pType === "bundle" && (
                      <div className="absolute top-3 right-14 bg-amber-500/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-black text-white flex items-center gap-1">
                        <Package size={10} /> Bundle
                      </div>
                    )}
                    <div className="absolute top-3 right-3 bg-stone-950/80 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-black text-emerald-400">
                      ${formattedPrice}
                    </div>
                    {variantCount > 1 && (
                      <div className="absolute bottom-3 left-3 bg-stone-950/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-bold text-stone-400 flex items-center gap-1">
                        <Copy size={10} /> {variantCount} variants
                      </div>
                    )}
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

                    {/* Categories & Tags chips */}
                    {(product.categories?.length > 0 || product.tags?.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {(product.categories || []).slice(0, 2).map((cat) => (
                          <span key={cat.id} className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full text-[8px] font-black uppercase tracking-wider">
                            {cat.name}
                          </span>
                        ))}
                        {(product.tags || []).slice(0, 3).map((tag) => (
                          <span key={tag.id} className="px-2 py-0.5 bg-stone-800 text-stone-300 rounded-full text-[8px] font-medium">
                            #{tag.value}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 mt-auto pt-4 border-t border-stone-800/40">
                      <button
                        onClick={() => togglePublish(product)}
                        className="p-3 bg-stone-950 hover:bg-stone-800 border border-stone-800 hover:border-stone-750 text-stone-500 hover:text-emerald-400 rounded-xl transition-all"
                        title={product.status === "draft" ? "Publish" : "Unpublish"}
                      >
                        {product.status === "draft" ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
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

        {/* ══════════════════════════════════════════════════════════════════
            PRODUCT FORM MODAL
            ══════════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showModal && (
            <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowModal(false)}
                className="fixed inset-0 bg-black/70 backdrop-blur-sm"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-stone-900 border border-stone-800 w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl relative z-10"
              >
                {/* ── Modal Header ──────────────────────────────────────── */}
                <div className="p-8 border-b border-stone-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black">
                      {editingProduct ? "Edit Product" : "Add New Product"}
                    </h3>
                    <p className="text-[10px] text-stone-500 font-bold mt-0.5">
                      {editingProduct ? "Update details, variants, categories, and more" : "Configure your product listing"}
                    </p>
                  </div>
                  <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-white">
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-8 max-h-[70vh] overflow-y-auto">
                  {/* ── SECTION: Basic Info ──────────────────────────────── */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-4 flex items-center gap-2">
                      <Package size={14} /> Product Details
                    </h4>
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                          Product Title <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Organic Honey Jar"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Thumbnail URL</label>
                          <input
                            type="url"
                            placeholder="https://images.unsplash.com/..."
                            value={thumbnail}
                            onChange={(e) => setThumbnail(e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Status</label>
                          <div className="flex gap-2 h-full items-center">
                            <button
                              type="button"
                              onClick={() => setStatus("draft")}
                              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all flex items-center justify-center gap-2 ${
                                status === "draft"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : "bg-stone-950 text-stone-500 border-stone-800 hover:border-stone-700"
                              }`}
                            >
                              <EyeOff size={12} /> Draft
                            </button>
                            <button
                              type="button"
                              onClick={() => setStatus("published")}
                              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all flex items-center justify-center gap-2 ${
                                status === "published"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-stone-950 text-stone-500 border-stone-800 hover:border-stone-700"
                              }`}
                            >
                              <Globe size={12} /> Published
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                            PRICE CAD <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="Example: 10.00"
                            value={variants[0]?.price || ""}
                            onChange={(e) => updateVariant(variants[0]?._key, "price", e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                            required
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">SKU</label>
                          <input
                            type="text"
                            placeholder="SKU-001"
                            value={variants[0]?.sku || ""}
                            onChange={(e) => updateVariant(variants[0]?._key, "sku", e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Barcode</label>
                          <input
                            type="text"
                            placeholder="012345678905"
                            value={variants[0]?.barcode || ""}
                            onChange={(e) => updateVariant(variants[0]?._key, "barcode", e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Description</label>
                        <textarea
                          placeholder="Enter description, size, weight details..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          rows={3}
                          className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── SECTION: Product Type Selector ──────────────────── */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-blue-400 flex items-center gap-2">
                        <Download size={14} /> Product Type
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setProductType("standard");
                            setIsDigital(false);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
                            productType === "standard"
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-stone-950 text-stone-500 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          <Package size={12} className="inline mr-1" /> Physical
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProductType("digital");
                            setIsDigital(true);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
                            productType === "digital"
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-stone-950 text-stone-500 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          <Download size={12} className="inline mr-1" /> Digital
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProductType("personalized");
                            setIsDigital(false);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
                            productType === "personalized"
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              : 'bg-stone-950 text-stone-500 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          <Tag size={12} className="inline mr-1" /> Personalized
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setProductType("bundle");
                            setIsDigital(false);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
                            productType === "bundle"
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-stone-950 text-stone-500 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          <Package size={12} className="inline mr-1" /> Bundle
                        </button>
                      </div>
                    </div>

                    {productType === "personalized" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-col gap-6 p-6 rounded-2xl bg-purple-950/20 border border-purple-900/30 mt-4 mb-4"
                      >
                        <h5 className="text-xs font-black uppercase tracking-widest text-purple-400">
                          Personalization Builder
                        </h5>

                        <div className="grid grid-cols-2 gap-4">
                          <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={personalizationTemplate.requires_vendor_approval}
                              onChange={(e) => setPersonalizationTemplate(prev => ({ ...prev, requires_vendor_approval: e.target.checked }))}
                              className="accent-purple-500"
                            />
                            Requires Vendor Approval
                          </label>
                          <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={personalizationTemplate.requires_production}
                              onChange={(e) => setPersonalizationTemplate(prev => ({ ...prev, requires_production: e.target.checked }))}
                              className="accent-purple-500"
                            />
                            Requires Production
                          </label>
                        </div>

                        <div className="flex flex-col gap-4">
                          {(personalizationTemplate.fields || []).map((field, index) => (
                            <div key={field.id || field._key || index} className="p-4 rounded-xl bg-stone-950 border border-stone-850 flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-bold text-stone-500 font-black">Field #{index + 1}</span>
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      disabled={index === 0}
                                      onClick={() => moveField(index, "up")}
                                      className="text-[10px] text-stone-500 hover:text-stone-300 disabled:opacity-30 font-bold"
                                    >
                                      ▲ Up
                                    </button>
                                    <button
                                      type="button"
                                      disabled={index === personalizationTemplate.fields.length - 1}
                                      onClick={() => moveField(index, "down")}
                                      className="text-[10px] text-stone-500 hover:text-stone-300 disabled:opacity-30 font-bold"
                                    >
                                      ▼ Down
                                    </button>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (field.id) {
                                      setDeletedFieldIds(prev => [...prev, field.id]);
                                    }
                                    setPersonalizationTemplate(prev => ({
                                      ...prev,
                                      fields: prev.fields.filter((_, i) => i !== index)
                                    }));
                                  }}
                                  className="text-red-400 hover:text-red-300 text-xs font-black uppercase tracking-wider"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Field Key</label>
                                  <input
                                    type="text"
                                    value={field.key}
                                    onChange={(e) => {
                                      const updatedFields = [...personalizationTemplate.fields];
                                      updatedFields[index] = { ...field, key: e.target.value };
                                      setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                    }}
                                    className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                    placeholder="e.g. recipient_name"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Label</label>
                                  <input
                                    type="text"
                                    value={field.label}
                                    onChange={(e) => {
                                      const updatedFields = [...personalizationTemplate.fields];
                                      updatedFields[index] = { ...field, label: e.target.value };
                                      setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                    }}
                                    className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                    placeholder="e.g. Recipient Name"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-3">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Type</label>
                                  <select
                                    value={field.field_type}
                                    onChange={(e) => {
                                      const updatedFields = [...personalizationTemplate.fields];
                                      updatedFields[index] = { ...field, field_type: e.target.value };
                                      setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                    }}
                                    className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                  >
                                    <option value="text">Text Input</option>
                                    <option value="textarea">Textarea</option>
                                    <option value="number">Number</option>
                                    <option value="select">Dropdown Select</option>
                                    <option value="checkbox">Checkbox</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="color">Color Picker</option>
                                    <option value="image_upload">Image Upload</option>
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Extra Price (minor units)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={field.price_adjustment}
                                    onChange={(e) => {
                                      const updatedFields = [...personalizationTemplate.fields];
                                      updatedFields[index] = { ...field, price_adjustment: parseFloat(e.target.value) || 0 };
                                      setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                    }}
                                    className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                    placeholder="0.00"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 justify-center pt-4">
                                  <label className="flex items-center gap-1.5 text-[10px] text-stone-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={field.is_required}
                                      onChange={(e) => {
                                        const updatedFields = [...personalizationTemplate.fields];
                                        updatedFields[index] = { ...field, is_required: e.target.checked };
                                        setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                      }}
                                      className="accent-purple-500"
                                    />
                                    Required
                                  </label>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Placeholder</label>
                                  <input
                                    type="text"
                                    value={field.placeholder || ""}
                                    onChange={(e) => {
                                      const updatedFields = [...personalizationTemplate.fields];
                                      updatedFields[index] = { ...field, placeholder: e.target.value };
                                      setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                    }}
                                    className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                    placeholder="e.g. Enter name here..."
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Help Text</label>
                                  <input
                                    type="text"
                                    value={field.help_text || ""}
                                    onChange={(e) => {
                                      const updatedFields = [...personalizationTemplate.fields];
                                      updatedFields[index] = { ...field, help_text: e.target.value };
                                      setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                    }}
                                    className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                    placeholder="e.g. Max 10 chars"
                                  />
                                </div>
                              </div>

                              {(field.field_type === "text" || field.field_type === "textarea") && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Min Length</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={field.min_length !== null && field.min_length !== undefined ? field.min_length : ""}
                                      onChange={(e) => {
                                        const updatedFields = [...personalizationTemplate.fields];
                                        updatedFields[index] = { ...field, min_length: e.target.value !== "" ? parseInt(e.target.value) : null };
                                        setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                      }}
                                      className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                      placeholder="No minimum"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Max Length</label>
                                    <input
                                      type="number"
                                      min="0"
                                      value={field.max_length !== null && field.max_length !== undefined ? field.max_length : ""}
                                      onChange={(e) => {
                                        const updatedFields = [...personalizationTemplate.fields];
                                        updatedFields[index] = { ...field, max_length: e.target.value !== "" ? parseInt(e.target.value) : null };
                                        setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                      }}
                                      className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                      placeholder="No maximum"
                                    />
                                  </div>
                                </div>
                              )}

                              {field.field_type === "number" && (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Min Value</label>
                                    <input
                                      type="number"
                                      value={field.min_value !== null && field.min_value !== undefined ? field.min_value : ""}
                                      onChange={(e) => {
                                        const updatedFields = [...personalizationTemplate.fields];
                                        updatedFields[index] = { ...field, min_value: e.target.value !== "" ? parseFloat(e.target.value) : null };
                                        setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                      }}
                                      className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                      placeholder="No minimum"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-stone-500">Max Value</label>
                                    <input
                                      type="number"
                                      value={field.max_value !== null && field.max_value !== undefined ? field.max_value : ""}
                                      onChange={(e) => {
                                        const updatedFields = [...personalizationTemplate.fields];
                                        updatedFields[index] = { ...field, max_value: e.target.value !== "" ? parseFloat(e.target.value) : null };
                                        setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                      }}
                                      className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                      placeholder="No maximum"
                                    />
                                  </div>
                                </div>
                              )}

                              {(field.field_type === "select" || field.field_type === "radio") && (
                                <div className="flex flex-col gap-1">
                                  <label className="text-[9px] font-black uppercase tracking-widest text-stone-500 font-black">Allowed Values (Comma-separated)</label>
                                  <input
                                    type="text"
                                    value={Array.isArray(field.allowed_values) ? field.allowed_values.join(", ") : (field.allowed_values || "")}
                                    onChange={(e) => {
                                      const updatedFields = [...personalizationTemplate.fields];
                                      updatedFields[index] = { ...field, allowed_values: e.target.value };
                                      setPersonalizationTemplate(prev => ({ ...prev, fields: updatedFields }));
                                    }}
                                    className="bg-stone-900 border border-stone-800 rounded-lg p-2 text-xs text-white outline-none focus:border-purple-500 font-bold"
                                    placeholder="Red, Blue, Green"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {isDigital && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex flex-col gap-4 p-5 rounded-2xl bg-blue-950/20 border border-blue-900/30"
                      >
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Version</label>
                            <input
                              type="text"
                              placeholder="1.0.0"
                              value={digitalVersion}
                              onChange={(e) => setDigitalVersion(e.target.value)}
                              className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Download Limit</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="5"
                              value={downloadLimit}
                              onChange={(e) => setDownloadLimit(e.target.value)}
                              className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Expiry (Days)</label>
                            <input
                              type="number"
                              min="0"
                              placeholder="365"
                              value={expiryDays}
                              onChange={(e) => setExpiryDays(e.target.value)}
                              className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Release Notes</label>
                            <input
                              type="text"
                              placeholder="What's new?"
                              value={releaseNotes}
                              onChange={(e) => setReleaseNotes(e.target.value)}
                              className="w-full bg-stone-950 border border-stone-800 focus:border-blue-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">License Required</label>
                            <div className="flex gap-2 h-full items-center pt-2">
                              <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={licenseRequired}
                                  onChange={(e) => setLicenseRequired(e.target.checked)}
                                  className="accent-blue-500"
                                />
                                Generate license key on purchase
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                            Upload Digital File
                          </label>
                          <input
                            type="file"
                            id="digital-file-upload"
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              setDigitalFiles(prev => [...prev, ...files.map(f => ({
                                id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                                file: f,
                                filename: f.name,
                                size: f.size,
                                type: f.type,
                              }))]);
                            }}
                            accept=".pdf,.zip,.docx,.xlsx,.png,.jpg,.jpeg,.txt,.mp4,.mov,.csv,.json"
                            className="w-full text-xs text-stone-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-500 file:text-white hover:file:bg-blue-600 file:cursor-pointer"
                          />
                          {digitalFiles.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {digitalFiles.map((df, idx) => (
                                <div key={df.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-950 border border-stone-700 text-stone-400 text-[10px] font-medium">
                                  <FileText size={12} className="text-blue-400" />
                                  <span className="max-w-[120px] truncate">{df.filename}</span>
                                  <span className="text-stone-600">({(df.size / 1024).toFixed(1)} KB)</span>
                                  <button
                                    type="button"
                                    onClick={() => setDigitalFiles(prev => prev.filter((_, i2) => i2 !== idx))}
                                    className="text-red-400 hover:text-red-300 ml-1"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-[9px] text-stone-600 mt-1">
                            Allowed: PDF, ZIP, DOCX, XLSX, PNG, JPG, TXT, MP4, CSV. Max 50 MB.
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {!isDigital && (
                      <>
                        {/* Show inventory field only for physical products */}
                        <div className="flex flex-col gap-1.5 mt-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Inventory Quantity</label>
                          <input
                            type="number"
                            min="0"
                            placeholder="100"
                            value={inventoryQuantity}
                            onChange={(e) => setInventoryQuantity(e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-white placeholder-stone-600 outline-none transition-colors text-sm font-bold"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── Submit ────────────────────────────────────────────── */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-400 text-stone-950 font-black text-sm uppercase tracking-wider py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2 justify-center">
                        <Loader2 className="animate-spin" size={18} />
                        {submitStep === "saving" && "Saving..."}
                        {submitStep === "adding_field" && "Adding Field..."}
                        {submitStep === "publishing" && "Publishing..."}
                      </span>
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
