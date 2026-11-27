import { createContext, useCallback, useContext, useState } from "react";

const ConfirmContext = createContext(null);

export default function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);

  const confirm = useCallback(({ title = "Are you sure?", body = "", okLabel = "Confirm", okClass = "btn-danger" }) => {
    return new Promise((resolve) => {
      setState({ title, body, okLabel, okClass, resolve });
    });
  }, []);

  const close = (val) => { state?.resolve(val); setState(null); };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-root">
          <div className="modal-backdrop" onClick={() => close(false)} />
          <div className="modal confirm-modal" role="dialog" aria-modal="true">
            <h2 className="modal-title">{state.title}</h2>
            <p className="modal-body">{state.body}</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
              <button
                type="button"
                className={`btn ${state.okClass}`}
                autoFocus
                onClick={() => close(true)}
              >
                {state.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
