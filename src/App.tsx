import { AlertCircle, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { AddPatientModal } from "./components/AddPatientModal";
import { AuditFeed } from "./components/AuditFeed";
import { BottleneckStrip } from "./components/BottleneckStrip";
import { CapacityTiles } from "./components/CapacityTiles";
import { MatchPanel } from "./components/MatchPanel";
import { PatientHistoryModal } from "./components/PatientHistoryModal";
import { RaceSimulator } from "./components/RaceSimulator";
import { ResourceGrid } from "./components/ResourceGrid";
import { ResourceModal } from "./components/ResourceModal";
import { TopNav } from "./components/TopNav";
import { WaitingQueue } from "./components/WaitingQueue";
import { usePatients, useResources, useWaiting } from "./hooks/useHospitalData";
import type { Resource } from "./types/hospital";

export default function App() {
  const { data: resources = [], isLoading, isError, refetch, isFetching } = useResources();
  const { data: waiting = [] } = useWaiting();
  const { data: patients = [] } = usePatients();

  const [historyPatientId, setHistoryPatientId] = useState<number | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [showAddPatient, setShowAddPatient] = useState(false);

  const selectedResource = useMemo<Resource | null>(
    () => resources.find((resource) => resource.id === selectedResourceId) ?? null,
    [resources, selectedResourceId],
  );
  const historyPatient = useMemo(
    () => patients.find((patient) => patient.id === historyPatientId) ?? null,
    [patients, historyPatientId],
  );

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav />

      <main className="mx-auto max-w-[1440px] px-5 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-muted mb-1">Capacity · Live operations</p>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Operations &amp; Capacity
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
                </span>
                Live
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Beds, theatre and staff capacity refreshing every 2.5 seconds.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-ghost"
              onClick={() => refetch()}
              title="Force refresh now"
            >
              <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} /> Refresh
            </button>
            <button className="btn-primary" onClick={() => setShowAddPatient(true)}>
              <Plus size={16} /> Add Patient
            </button>
          </div>
        </div>

        {isError && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={18} />
            <div>
              <p className="font-semibold">Cannot reach the backend API.</p>
              <p className="text-red-600">
                Start FastAPI on http://127.0.0.1:8000 (see README) — the dashboard will reconnect
                on the next poll.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <CapacityTiles resources={resources} waiting={waiting} />
          <BottleneckStrip resources={resources} waiting={waiting} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-7">
              <MatchPanel onViewPatient={setHistoryPatientId} />
              <WaitingQueue
                onViewPatient={setHistoryPatientId}
                onAddPatient={() => setShowAddPatient(true)}
              />
            </div>
            <div className="space-y-6 xl:col-span-5">
              <ResourceGrid resources={resources} onSelect={(resource) => setSelectedResourceId(resource.id)} />
              <RaceSimulator />
            </div>
          </div>

          <AuditFeed />
        </div>
      </main>

      <ResourceModal
        resource={selectedResource}
        waiting={waiting}
        patients={patients}
        onClose={() => setSelectedResourceId(null)}
        onViewPatient={setHistoryPatientId}
      />

      <PatientHistoryModal
        patientId={historyPatientId}
        patient={historyPatient}
        onClose={() => setHistoryPatientId(null)}
      />

      <AddPatientModal
        open={showAddPatient}
        onClose={() => setShowAddPatient(false)}
        onCreated={(patientId) => setHistoryPatientId(patientId)}
      />
    </div>
  );
}
