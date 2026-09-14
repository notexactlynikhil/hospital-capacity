import { AlertTriangle, CheckCircle2, Loader2, Lock, Unlock } from "lucide-react";
import { useEffect, useState } from "react";

import { useAllocate, useRelease } from "../hooks/useHospitalData";
import { cn, patientCode } from "../lib/utils";
import type { Patient, Resource } from "../types/hospital";
import { Modal } from "./Modal";
import { StatusPill } from "./StatusPill";

export function ResourceModal({
  resource,
  waiting,
  onClose,
  onViewPatient,
}: {
  resource: Resource | null;
  waiting: Patient[];
  onClose: () => void;
  onViewPatient: (id: number) => void;
}) {
  const allocate = useAllocate();
  const release = useRelease();
  const [selectedPatient, setSelectedPatient] = useState<number | "">("");
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [link, setLink] = useState<{ resourceId: number; patientId: number | null } | null>(null);

  const isOpen = resource !== null;
  const compatible = resource
    ? waiting.filter((patient) => patient.resource_type_needed === resource.type)
    : [];

  useEffect(() => {
    if (!resource) return;
    setFeedback(null);
    setSelectedPatient(compatible[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource?.id, resource?.status]);

  if (!resource) return null;

  const pending = allocate.isPending || release.isPending;

  async function handleAllocate() {
    setFeedback(null);
    try {
      const result = await allocate.mutateAsync({
        resourceId: resource!.id,
        patientId: selectedPatient === "" ? undefined : Number(selectedPatient),
      });
      setLink({ resourceId: resource!.id, patientId: result.patient?.id ?? null });
      setFeedback({ tone: "ok", text: result.message });
    } catch (error) {
      setFeedback({
        tone: "err",
        text: error instanceof Error ? error.message : "Allocation failed.",
      });
    }
  }

  async function handleRelease() {
    setFeedback(null);
    try {
      await release.mutateAsync(resource!.id);
      setFeedback({ tone: "ok", text: `${resource!.name} released back to available.` });
    } catch (error) {
      setFeedback({
        tone: "err",
        text: error instanceof Error ? error.message : "Release failed.",
      });
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={resource.name}
      subtitle={`${resource.type} resource · revision ${resource.version}`}
    >
      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        <div>
          <p className="text-xs text-slate-400">Current status</p>
          <p className="text-sm font-semibold capitalize text-slate-700">{resource.status}</p>
        </div>
        <StatusPill status={resource.status} />
      </div>

      {resource.status === "available" ? (
        <div className="space-y-4">
          <div>
            <label className="label-muted mb-1.5 block">Assign to waiting patient</label>
            {compatible.length === 0 ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                No waiting patient currently needs a {resource.type}.
              </p>
            ) : (
              <select
                className="w-full rounded-xl border-0 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-slate-200 focus:ring-2 focus:ring-teal-500"
                value={selectedPatient}
                onChange={(event) =>
                  setSelectedPatient(event.target.value === "" ? "" : Number(event.target.value))
                }
              >
                {compatible.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patientCode(patient.id)} · {patient.name} · urgency {patient.urgency_score}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            className="btn-primary w-full justify-center"
            disabled={pending || compatible.length === 0}
            onClick={handleAllocate}
          >
            {allocate.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Lock size={16} />
            )}
            Allocate resource
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-100">
            This resource is committed. Releasing it returns it to <strong>available</strong> and
            appends a release event to the audit trail. History is never deleted.
          </div>
          <button
            className="btn-ghost w-full justify-center"
            disabled={pending}
            onClick={handleRelease}
          >
            {release.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Unlock size={16} />
            )}
            Release resource
          </button>
        </div>
      )}

      {feedback && (
        <p
          className={cn(
            "mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm",
            feedback.tone === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {feedback.tone === "ok" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          {feedback.text}
        </p>
      )}

      {link?.patientId != null && (
        <button
          className="mt-3 text-sm font-medium text-teal-600 hover:text-teal-700"
          onClick={() => onViewPatient(link.patientId as number)}
        >
          View {patientCode(link.patientId)} history →
        </button>
      )}
    </Modal>
  );
}
