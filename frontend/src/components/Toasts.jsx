import { useData } from "../store/dataStore.jsx";

export default function Toasts() {
  const { toasts } = useData();
  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className={`toast is-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}
