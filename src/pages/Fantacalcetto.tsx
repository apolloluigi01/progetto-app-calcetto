export default function Fantacalcetto() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="relative inline-block">
        <span
          className="text-5xl font-black uppercase tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #f9a825 0%, #ffe082 50%, #f57f17 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 2px 8px rgba(249,168,37,0.4))',
          }}
        >
          Fantacalcetto
        </span>
      </div>
      <p className="mt-4 text-gray-400 text-sm uppercase tracking-widest">Prossimamente</p>
    </div>
  )
}
