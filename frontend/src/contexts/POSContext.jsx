import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { clearPosRegisterContext, logoutStaff, setPosRegister, setPosSession, setStaff } from "../redux/posSlice";
import { getCurrentPosToken, getPosAuthActorId, isRequestCanceled } from "../services/apiClient";
import { clearPosStaff, posApi, setPosStaff, setStoredPosRegister } from "../services/posApi";
import { POSContext } from "./usePOS";

const initialState = { status: "IDLE", operator: null, registers: [], session: null, activeRegister: null, error: null, warning: null, isRefreshing: false, bootstrapSuccess: false };
const isDev = import.meta.env.DEV;
const log = (event, detail = {}) => { if (isDev) console.info(event, JSON.stringify(detail)); };

function deriveRuntime(payload) {
  if (!payload?.authenticated || !payload.operator?.id || !Array.isArray(payload.registers)) throw new Error("POS_BOOTSTRAP_INVALID_RESPONSE");
  const activeRegister = payload.session?.register || null;
  if ((payload.assignment_state === "empty") !== (payload.registers.length === 0)) throw new Error("POS_BOOTSTRAP_ASSIGNMENT_STATE_INVALID");
  const status = payload.assignment_state === "empty" ? "EMPTY_ASSIGNMENTS" : payload.session ? "READY_SESSION" : "READY_NO_SESSION";
  return { status, operator: payload.operator, registers: payload.registers, session: payload.session || null, activeRegister, error: null, warning: null, isRefreshing: false, bootstrapSuccess: true };
}

export function POSProvider({ children }) {
  const dispatch = useDispatch();
  const bootstrapGenerationRef = useRef(0);
  const controllerRef = useRef(null);
  const identityRef = useRef(null);
  const lastGoodBootstrapRef = useRef(null);
  const [runtime, setRuntime] = useState(initialState);
  const runtimeRef = useRef(initialState);

  useEffect(() => { runtimeRef.current = runtime; }, [runtime]);

  const commit = useCallback((next, generation) => {
    console.info("[POS_BOOTSTRAP_COMMIT]", JSON.stringify({
      generation,
      actor_id: getPosAuthActorId(),
      operator: {
        actor_id: next.operator?.actor_id
      },
      assignment_state: next.status === "EMPTY_ASSIGNMENTS" ? "empty" : "ready",
      registerCount: next.registers.length
    }));
    dispatch(setStaff(next.operator));
    setPosStaff(next.operator);
    if (next.session && next.activeRegister) {
      dispatch(setPosRegister(next.activeRegister));
      dispatch(setPosSession(next.session));
      setStoredPosRegister(next.activeRegister);
    } else dispatch(clearPosRegisterContext());
    setRuntime(next);
  }, [dispatch]);

  const clearRuntime = useCallback(({ clearToken = false } = {}) => {
    bootstrapGenerationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    identityRef.current = null;
    lastGoodBootstrapRef.current = null;
    if (clearToken) clearPosStaff();
    dispatch(logoutStaff());
    dispatch(clearPosRegisterContext());
    setRuntime({ ...initialState, status: clearToken ? "AUTH_REQUIRED" : "IDLE" });
  }, [dispatch]);

  const refreshBootstrap = useCallback(async () => {
    const isPosPath = window.location.pathname.startsWith("/pos");
    if (!isPosPath) return null;

    const token = getCurrentPosToken();
    if (!token) {
      if (identityRef.current || runtimeRef.current.status !== "AUTH_REQUIRED") clearRuntime({ clearToken: true });
      setRuntime((current) => ({ ...current, status: "AUTH_REQUIRED", isRefreshing: false }));
      return null;
    }

    if (identityRef.current && identityRef.current !== token) clearRuntime();
    const generation = ++bootstrapGenerationRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    console.info("[POS_BOOTSTRAP_REQUEST]", JSON.stringify({
      generation,
      actor_id: getPosAuthActorId()
    }));
    setRuntime((current) => ({ ...current, status: "BOOTSTRAP_LOADING", error: null, warning: null, isRefreshing: current.bootstrapSuccess }));
    try {
      const payload = await posApi.bootstrap({ signal: controller.signal });
      if (controller.signal.aborted || generation !== bootstrapGenerationRef.current) {
        log("[POS_BOOTSTRAP_STALE_IGNORED]", { generation, latestGeneration: bootstrapGenerationRef.current });
        return null;
      }
      const next = deriveRuntime(payload);
      const authActorId = getPosAuthActorId();
      
      const getCanonicalBootstrapActorId = (bootstrap) => {
        const actorId = String(bootstrap?.operator?.actor_id || "").trim();
        if (!actorId) {
          const missing = new Error("POS_BOOTSTRAP_ACTOR_ID_MISSING");
          missing.code = "POS_BOOTSTRAP_ACTOR_ID_MISSING";
          throw missing;
        }
        return actorId;
      };
      const bootstrapActorId = getCanonicalBootstrapActorId(payload);

      console.info("[POS_BOOTSTRAP_RESPONSE]", JSON.stringify({
        generation,
        actor_id: authActorId,
        operator: {
          actor_id: payload?.operator?.actor_id
        },
        assignment_state: payload?.assignment_state,
        registerCount: payload?.registers?.length
      }));

      if (!authActorId || authActorId !== bootstrapActorId) {
        console.error("[POS_ACTOR_MISMATCH]", { authenticated_actor_id: authActorId, bootstrap_actor_id: bootstrapActorId });
        const mismatch = new Error("POS authentication belongs to a different account than the resolved POS operator.");
        mismatch.code = "POS_ACTOR_MISMATCH";
        throw mismatch;
      }
      identityRef.current = token;
      lastGoodBootstrapRef.current = { identityKey: token, runtime: next };
      commit(next, generation);
      return { ...payload, ...next };
    } catch (error) {
      if (controller.signal.aborted || isRequestCanceled(error) || generation !== bootstrapGenerationRef.current) {
        const lastGood = lastGoodBootstrapRef.current;
        if (generation === bootstrapGenerationRef.current && lastGood?.identityKey === token) setRuntime(lastGood.runtime);
        log("[POS_BOOTSTRAP_ABORTED]", { generation });
        return null;
      }
      if (
        error?.code === "POS_ACTOR_MISMATCH" ||
        error?.code === "POS_AUTH_ACTOR_ID_MISSING" ||
        error?.code === "POS_BOOTSTRAP_ACTOR_ID_MISSING" ||
        error?.response?.status === 401 ||
        error?.response?.data?.code === "POS_AUTH_REQUIRED"
      ) {
        clearRuntime({ clearToken: true });
        throw error;
      }
      const lastGood = lastGoodBootstrapRef.current;
      if (lastGood?.identityKey === token) {
        setRuntime({ ...lastGood.runtime, error: null, warning: "Could not refresh POS data. Showing last confirmed register state.", isRefreshing: false });
      } else setRuntime({ ...initialState, status: "ERROR", error, isRefreshing: false });
      log("[POS_BOOTSTRAP_STATE]", { generation, status: lastGood?.identityKey === token ? lastGood.runtime.status : "ERROR", registerCount: lastGood?.identityKey === token ? lastGood.runtime.registers.length : 0 });
      throw error;
    }
  }, [clearRuntime, commit]);

  useEffect(() => {
    refreshBootstrap().catch(() => undefined);
    return () => { controllerRef.current?.abort(); };
  }, [refreshBootstrap]);
  useEffect(() => {
    const syncToken = (event) => { if (["eatsie_pos_token", "eatsie_pos_auth_scope", "eatsie_pos_actor_id"].includes(event.key)) refreshBootstrap().catch(() => undefined); };
    const syncLocalAuth = () => refreshBootstrap().catch(() => undefined);
    window.addEventListener("storage", syncToken);
    window.addEventListener("eatsie-pos-auth-changed", syncLocalAuth);
    return () => { window.removeEventListener("storage", syncToken); window.removeEventListener("eatsie-pos-auth-changed", syncLocalAuth); };
  }, [refreshBootstrap]);
  return <POSContext.Provider value={{ ...runtime, refreshBootstrap, clearRuntime }}>{children}</POSContext.Provider>;
}
