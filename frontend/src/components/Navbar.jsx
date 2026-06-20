import { useSelector } from "react-redux";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AddressModal from "./common/AddressModal";
import OrganicHeader from "./organic/OrganicHeader";
import useToast from "../hooks/useToast";
import useAuth from "../hooks/useAuth";
import { addAddress } from "../services/api";

export default function Navbar() {
  const isAuthenticated = useSelector((state) => state.auth.isAuthenticated);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [isAddressSubmitting, setIsAddressSubmitting] = useState(false);
  const { showToast } = useToast();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleAddressSave = async (address) => {
    try {
      setIsAddressSubmitting(true);
      await addAddress(address);
      showToast("Delivery address saved", "success");
      setIsAddressOpen(false);
    } catch {
      showToast("Unable to save address right now", "error");
    } finally {
      setIsAddressSubmitting(false);
    }
  };

  return (
    <>
      <OrganicHeader
        onOpenAddress={() => setIsAddressOpen(true)}
        onOpenAuth={() => navigate("/login")}
        isAuthenticated={isAuthenticated}
        onSignOut={() => {
          signOut();
          showToast("Signed out", "success");
        }}
      />

      <AddressModal
        isOpen={isAddressOpen}
        onClose={() => setIsAddressOpen(false)}
        onSave={handleAddressSave}
        isSubmitting={isAddressSubmitting}
      />
    </>
  );
}
