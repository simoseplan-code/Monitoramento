import { CheckCircle2, XCircle, UserPlus } from "lucide-react";

type Evento = {
  id: string;
  tipo: "sync_ok" | "sync_erro" | "cadastro_pendente";
  texto: string;
  quando: string;
};

export function NotificationsFeed({ eventos }: { eventos: Evento[] }) {
  return (
    <div className="rounded-xl border border-black/5 bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">Notificações</h3>
      </div>
      <div className="space-y-3">
        {eventos.length === 0 && <p className="text-xs text-ink-muted">Nenhum evento recente.</p>}
        {eventos.map((e) => (
          <div key={e.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                e.tipo === "sync_erro"
                  ? "bg-status-critical-bg text-status-critical"
                  : e.tipo === "cadastro_pendente"
                    ? "bg-status-warning-bg text-status-warning"
                    : "bg-status-good-bg text-status-good"
              }`}
            >
              {e.tipo === "sync_erro" ? (
                <XCircle size={14} />
              ) : e.tipo === "cadastro_pendente" ? (
                <UserPlus size={14} />
              ) : (
                <CheckCircle2 size={14} />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-ink-secondary">{e.texto}</p>
              <p className="text-xs text-ink-muted">{e.quando}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
