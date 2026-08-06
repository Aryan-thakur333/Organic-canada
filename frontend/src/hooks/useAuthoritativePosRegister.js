/**
 * useAuthoritativePosRegister
 *
 * Enforces the invariant:
 *   route param :registerId  === SINGLE AUTHORITATIVE REGISTER
 *
 * Usage:
 *   const { registerId, register, isAuthorized, isLoading, error } =
 *     useAuthoritativePosRegister();
 *
 * Behaviour:
 *   1. Reads useParams().registerId — never falls back to Redux or storage.
 *   2. Calls GET /pos/me/registers and finds the matching entry.
 *   3. If not found → redirects to /pos/register-select.
 *   4. If found → syncs Redux (setPosRegister) to that exact register and
 *      clears any incompatible session/cart state.
 *   5. Does NOT call POST /open. Session loading is the caller's responsibility.
 *
 * Abort safety:
 *   - Uses AbortController so that unmounts and route changes cancel in-flight
 *     requests immediately, preventing stale responses from updating Redux.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { clearPosRegisterContext, setPosRegister } from "../redux/posSlice";
import { posApi, setStoredPosRegister } from "../services/posApi";

export default function useAuthoritativePosRegister() {
  const { registerId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const staff = useSelector((state) => state.pos.staff);
  const reduxRegister = useSelector((state) => state.pos.register);

  const [state, setState] = useState({ isLoading: true, isAuthorized: false, register: null, error: null });
  const requestIdRef = useRef(0);

  const load = useCallback(async (signal) => {
    if (!registerId) {
      navigate("/pos/register-select", { replace: true });
      return;
    }

    setState({ isLoading: true, isAuthorized: false, register: null, error: null });
    const currentId = ++requestIdRef.current;

    try {
      const { registers } = await posApi.getMyRegisters({ signal });
      if (signal.aborted || requestIdRef.current !== currentId) return;

      const authorizedRegister = registers.find((entry) => entry.id === registerId);
      if (!authorizedRegister) {
        // Route register is not in the operator's authorized list
        console.warn("[POS_SESSION_ROUTE_MISMATCH]", {
          routeRegisterId: registerId,
          sessionRegisterId: reduxRegister?.id || null,
          action: "UNAUTHORIZED_REGISTER_REDIRECT",
        });
        dispatch(clearPosRegisterContext());
        navigate("/pos/register-select", { replace: true, state: { message: "You are not assigned to the selected register." } });
        return;
      }

      // Detect and log if Redux had a mismatched register
      if (reduxRegister?.id && reduxRegister.id !== registerId) {
        console.warn("[POS_SESSION_ROUTE_MISMATCH]", {
          routeRegisterId: registerId,
          sessionRegisterId: reduxRegister.id,
          action: "STALE_SESSION_STATE_CLEARED",
        });
        // Clear stale context (items, session, old register)
        dispatch(clearPosRegisterContext());
      }

      // Sync Redux and storage to the authoritative route register
      setStoredPosRegister(authorizedRegister);
      dispatch(setPosRegister(authorizedRegister));

      if (signal.aborted || requestIdRef.current !== currentId) return;
      setState({ isLoading: false, isAuthorized: true, register: authorizedRegister, error: null });
    } catch (error) {
      if (signal.aborted || error?.name === "CanceledError" || error?.code === "ERR_CANCELED") return;
      if (requestIdRef.current !== currentId) return;
      setState({ isLoading: false, isAuthorized: false, register: null, error });
    }
  }, [registerId, dispatch, navigate, reduxRegister]);

  useEffect(() => {
    if (!staff?.id || !registerId) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [staff?.id, registerId, load]);

  return {
    registerId: registerId || null,
    register: state.register,
    isAuthorized: state.isAuthorized,
    isLoading: state.isLoading,
    error: state.error,
  };
}
