import { AlertTriangle } from "lucide-react";
import { useData } from "../store/dataStore.jsx";

export default function OfflineBanner() {
  const { online, offlineReason } = useData();
  if (online) return null;
  return (
    <div className="callout is-warn">
      <AlertTriangle size={18} />
      <div>
        <strong>Database unavailable.</strong>
        {offlineReason && (
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{offlineReason}</div>
        )}
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
          Start a local MongoDB (<code>mongod</code>) or point <code>MONGODB_URI</code> at your Atlas cluster, then refresh.
        </div>
      </div>
    </div>
  );
}
