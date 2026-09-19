import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { useAuthStore } from "./lib/authStore";
import { LoadScreen } from "./components/LoadScreen";
import "./styles.css";

useAuthStore.getState().restore();

function Boot() {
  const status = useAuthStore(s => s.status);
  return status === "loading" ? <LoadScreen /> : <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Boot />
    </HashRouter>
  </React.StrictMode>
);