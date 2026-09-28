import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, pageSize, total, onPageChange, label }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const visiblePages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1);
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-semibold">
        Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} {label}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium disabled:opacity-50" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={14} /> Previous
        </button>
        {visiblePages.map((item) => (
          <button type="button" key={item} className={`h-8 w-8 rounded-md text-xs font-medium ${page === item ? 'bg-app-accent text-white' : 'border border-slate-200 text-slate-700'}`} onClick={() => onPageChange(item)}>
            {item}
          </button>
        ))}
        {totalPages > 6 && <span className="px-2 text-slate-400">...</span>}
        {totalPages > 5 && (
          <button type="button" className={`h-8 w-8 rounded-md text-xs font-medium ${page === totalPages ? 'bg-app-accent text-white' : 'border border-slate-200 text-slate-700'}`} onClick={() => onPageChange(totalPages)}>
            {totalPages}
          </button>
        )}
        <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-app-accent disabled:opacity-50" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
