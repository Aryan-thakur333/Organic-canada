import AppRoutes from "./routes/Approutes";
import ErrorBoundary from "./components/common/ErrorBoundary";
import BackendStatusBanner from "./components/common/BackendStatusBanner";
import AuthSync from "./components/common/AuthSync";
import { POSProvider } from "./contexts/POSContext";

function App() {
  return (
    <ErrorBoundary>
      <AuthSync />
      <BackendStatusBanner />
      <POSProvider>
        <AppRoutes />
      </POSProvider>
    </ErrorBoundary>
  );
}

export default App;
