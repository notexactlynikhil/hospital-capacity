import { Activity, Bell, ChevronDown, Moon, Search } from "lucide-react";

import { cn } from "../lib/utils";

const NAV_ITEMS = ["Overview", "Patients", "Treatments", "Resources", "Analytics"];
const ACTIVE = "Resources";

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">
            <Activity size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">MedFlow</span>
        </div>

        <nav className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                item === ACTIVE
                  ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
              )}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button className="icon-btn" aria-label="Search">
            <Search size={18} />
          </button>
          <button className="icon-btn" aria-label="Toggle theme">
            <Moon size={18} />
          </button>
          <button className="icon-btn relative" aria-label="Alerts">
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-teal-500 ring-2 ring-white" />
          </button>
          <div className="mx-2 hidden h-8 w-px bg-slate-200 sm:block" />
          <div className="flex items-center gap-2.5">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-800">Dr. Christa Bel</p>
              <p className="text-xs text-slate-400">Capacity Admin</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-semibold text-white">
              CB
            </div>
            <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
          </div>
        </div>
      </div>
    </header>
  );
}
