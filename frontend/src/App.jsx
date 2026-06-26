import AppRoutes from "./routes/Approutes";
import ErrorBoundary from "./components/common/ErrorBoundary";
import BackendStatusBanner from "./components/common/BackendStatusBanner";

function App() {
  return (
    <ErrorBoundary>
      <BackendStatusBanner />
      <AppRoutes />
    </ErrorBoundary>
  );
}

export default App;
