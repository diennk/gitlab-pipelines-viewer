// Fixed height so showing/hiding never shifts the layout.
export function LoadingProgress({ label, done, total }: { label?: string; done?: number; total?: number }) {
  const pct = total ? Math.round(((done ?? 0) / total) * 100) : 0
  return (
    <div className="mt-1 flex h-4 items-center gap-2 text-xs text-slate-400" role={label ? 'status' : undefined}>
      {label && (
        <>
          <span className="whitespace-nowrap">{label}{total !== undefined && ` ${done}/${total}`}</span>
          {total !== undefined && (
            <div className="h-1.5 w-40 overflow-hidden rounded bg-slate-800">
              <div className="h-full bg-orange-500 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
