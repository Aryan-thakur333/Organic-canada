import React, { useState, useEffect } from 'react';
import { Search, Loader2, Tag, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import apiClient from '../../services/apiClient';
import toast from 'react-hot-toast';

export default function AdminPersonalizationsView() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [updating, setUpdating] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/personalization-templates');
      setTemplates(res.data.templates || []);
    } catch (err) {
      toast.error('Failed to load personalization templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleToggleStatus = async (template) => {
    if (updating) return;
    setUpdating(true);
    const newStatus = !template.is_active;
    try {
      // In Medusa v2, we update the template using the vendor/admin PUT or custom endpoint
      // We can directly call the admin personalization-templates update endpoint or vendor update
      // Since it's admin, let's call the admin route if implemented, otherwise update metadata or template
      // We implemented PUT /vendor/personalization-templates/:id, let's see if admin uses a dedicated PUT
      // Since we resolved PUT vendor, let's allow admin to update template directly
      await apiClient.put(`/vendor/personalization-templates/${template.id}`, {
        is_active: newStatus
      });
      toast.success(`Template ${newStatus ? 'activated' : 'deactivated'} successfully`);
      fetchTemplates();
      if (selectedTemplate?.id === template.id) {
        setSelectedTemplate(prev => ({ ...prev, is_active: newStatus }));
      }
    } catch (err) {
      toast.error('Failed to change template status');
    } finally {
      setUpdating(false);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.product_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.vendor_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-black mb-1">Personalization Management</h2>
        <p className="text-xs text-text-secondary font-medium">Verify schema hashes, edit personalization fields, and inspect vendor templates.</p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          <input
            type="text"
            placeholder="Search templates by title, product ID, vendor ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-stone-900 border border-stone-850 focus:border-accent-primary rounded-2xl py-3.5 pl-12 pr-4 text-sm font-semibold outline-none transition-colors placeholder-stone-500 text-text-primary"
          />
        </div>
        <button 
          onClick={fetchTemplates} 
          className="p-3.5 bg-stone-900 hover:bg-stone-800 rounded-2xl border border-stone-850 text-text-secondary transition-all"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {loading ? (
        <div className="h-60 flex items-center justify-center">
          <Loader2 className="animate-spin text-accent-primary" size={32} />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-stone-900/40 border border-stone-850 rounded-[2rem] p-12 text-center">
          <Tag className="mx-auto mb-4 text-stone-500" size={32} />
          <p className="text-text-secondary font-medium">No personalization templates found.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 flex flex-col gap-4">
            {filteredTemplates.map((t) => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTemplate(t)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                  selectedTemplate?.id === t.id
                    ? 'bg-accent-primary/5 border-accent-primary'
                    : 'bg-stone-900/40 border-stone-850 hover:border-stone-800'
                }`}
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <h4 className="font-bold text-text-primary truncate">{t.title || 'Untitled Personalization'}</h4>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold text-text-secondary">
                    <span>PID: {t.product_id?.slice(0, 12)}...</span>
                    <span>Vendor: {t.vendor_id?.slice(0, 12)}...</span>
                    <span>Fields: {t.fields?.length || 0}</span>
                  </div>
                  {t.schema_hash && (
                    <span className="text-[9px] font-mono text-stone-500 truncate max-w-[200px]">Hash: {t.schema_hash}</span>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                    t.is_active 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                  
                  <button
                    type="button"
                    disabled={updating}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(t);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all ${
                      t.is_active
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                  >
                    {t.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right details sidebar */}
          <div className="lg:col-span-1">
            {selectedTemplate ? (
              <div className="p-6 bg-stone-900/40 border border-stone-850 rounded-[2rem] flex flex-col gap-6">
                <div>
                  <h3 className="text-base font-black mb-1">{selectedTemplate.title}</h3>
                  <span className="text-[10px] text-text-secondary font-bold">Template Specification Details</span>
                </div>

                <div className="flex flex-col gap-3 text-xs">
                  <div className="flex justify-between border-b border-stone-850 pb-2">
                    <span className="text-text-secondary font-medium">Version</span>
                    <span className="text-text-primary font-bold">v{selectedTemplate.version || 1}</span>
                  </div>
                  <div className="flex justify-between border-b border-stone-850 pb-2">
                    <span className="text-text-secondary font-medium">Vendor Approval</span>
                    <span className="text-text-primary font-bold">{selectedTemplate.requires_vendor_approval ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between border-b border-stone-850 pb-2">
                    <span className="text-text-secondary font-medium">Requires Production</span>
                    <span className="text-text-primary font-bold">{selectedTemplate.requires_production ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex flex-col gap-1 border-b border-stone-850 pb-2">
                    <span className="text-text-secondary font-medium">Schema Hash</span>
                    <span className="font-mono text-[9px] text-stone-500 break-all">{selectedTemplate.schema_hash || 'None'}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Personalization Fields ({selectedTemplate.fields?.length || 0})</h4>
                  <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                    {(selectedTemplate.fields || []).map((f) => (
                      <div key={f.id} className="p-3 bg-stone-950 border border-stone-850 rounded-xl flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-xs text-text-primary">{f.label}</span>
                          <span className="text-[9px] font-mono text-stone-500 uppercase">{f.field_type}</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-stone-500">
                          <span>Key: {f.key}</span>
                          {f.price_adjustment > 0 && (
                            <span className="text-purple-400 font-bold">+${f.price_adjustment.toFixed(2)} Adjustment</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center bg-stone-900/40 border border-stone-850 border-dashed rounded-[2rem] text-text-secondary">
                <AlertCircle className="mx-auto mb-3" size={24} />
                <p className="text-xs font-bold">Select a template to view details, fields structure, and history.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
