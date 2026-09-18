export default function Loading() {
  return (
    <div className="flex min-h-screen bg-plane">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-black/5 bg-surface sm:block">
        <div className="animate-pulse space-y-4 p-5">
          <div className="h-9 w-9 rounded-xl bg-plane" />
          <div className="h-16 rounded-xl bg-plane" />
          <div className="space-y-2 pt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-plane" />
            ))}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 border-b border-black/5 bg-surface px-6 py-4">
          <div className="h-6 w-40 animate-pulse rounded bg-plane" />
        </div>

        <main className="flex-1 px-6 py-6">
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-black/5 bg-surface" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="h-72 animate-pulse rounded-xl border border-black/5 bg-surface lg:col-span-1" />
            <div className="h-72 animate-pulse rounded-xl border border-black/5 bg-surface lg:col-span-2" />
          </div>
        </main>
      </div>
    </div>
  );
}
