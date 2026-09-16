export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8]">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[#e6e8eb] border-t-[#0bdbcf]"
        role="status"
        aria-label="Cargando"
      />
    </div>
  );
}
